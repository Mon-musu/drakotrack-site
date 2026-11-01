#!/usr/bin/env python3
"""Bump versionCode/versionName in a compiled AndroidManifest.xml inside an APK.

Works on the binary AXML in place: versionCode is a 4-byte int in the attribute's
typed value, and versionName is patched as a string-pool entry of identical length,
so every chunk size stays the same and nothing else in the file moves.

With --tag-apk the shell's start URL also gets its build number appended
(?apk=<versionCode>), which is how the web app knows which APK is running.

With --web-dir/--web-files the APK's bundled copy of the site
(assets/public/*) is rebuilt from the repository files, so the offline
fallback can never drift away from what is deployed.
"""
import json
import os
import re
import struct
import sys
import zipfile

NEW_CODE = 2
NEW_NAME = "1.1"
WEB_PREFIX = "assets/public/"


def read_web_assets(web_dir, names):
    """Read the site files that go into assets/public/ as (name, bytes) pairs."""
    if not names:
        raise SystemExit("--web-files was empty: refusing to strip the bundled site")
    out = []
    for name in names:
        path = os.path.join(web_dir, name)
        if not os.path.isfile(path):
            raise SystemExit(f"web asset not found: {path}")
        with open(path, "rb") as fh:
            out.append((name, fh.read()))
    return out


def read_varint(buf, off):
    val = 0
    for i in range(4):
        b = buf[off + i]
        val |= (b & 0x7F) << (7 * i)
        if not b & 0x80:
            return val, off + i + 1
    return val, off + 4


def parse_string_pool(axml, pos, hsize):
    (count, style_count, flags, strings_start, styles_start) = struct.unpack(
        "<IIIII", axml[pos + 8:pos + 28]
    )
    utf8 = bool(flags & 0x100)
    offsets = [struct.unpack("<I", axml[pos + hsize + 4 * i:pos + hsize + 4 * i + 4])[0]
               for i in range(count)]
    base = pos + strings_start
    strings = []
    for off in offsets:
        p = base + off
        if utf8:
            _, p = read_varint(axml, p)          # length in chars (not needed)
            nbytes, p = read_varint(axml, p)     # length in bytes
            chars = p
        else:
            nbytes = struct.unpack("<H", axml[p:p + 2])[0] * 2
            chars = p + 2
        strings.append((chars, nbytes, utf8))
    return strings, utf8


def start_elements(axml):
    """Yield (abs_offset, name_i, attrs) for every START_ELEMENT chunk."""
    pos = 8
    out = []
    while pos + 8 <= len(axml):
        ctype, hsize, csize = struct.unpack("<HHI", axml[pos:pos + 8])
        if csize <= 0:
            break
        if ctype == 0x0102:  # RES_XML_START_ELEMENT_TYPE
            ns_i, name_i = struct.unpack("<II", axml[pos + 16:pos + 24])
            attr_start, attr_size, attr_count = struct.unpack("<HHH", axml[pos + 24:pos + 30])
            attrs = []
            a = pos + 16 + attr_start
            for _ in range(attr_count):
                a_ns, a_name, a_raw = struct.unpack("<III", axml[a:a + 12])
                dsize, _res0, dtype = struct.unpack("<HBB", axml[a + 12:a + 16])
                ddata = struct.unpack("<I", axml[a + 16:a + 20])[0]
                attrs.append((a, a_name, a_raw, dtype, ddata))
                a += attr_size
            out.append((pos, name_i, attrs))
        pos += csize
    return out


def patch(axml, new_code, new_name):
    pool, _utf8 = parse_string_pool(axml, 8, struct.unpack("<H", axml[10:12])[0])

    def text_of(idx):
        chars, nbytes, is_utf8 = pool[idx]
        return axml[chars:chars + nbytes].decode("utf-8" if is_utf8 else "utf-16-le")

    for pos, name_i, attrs in start_elements(axml):
        if text_of(name_i) != "manifest":
            continue
        report = {}
        for off, a_name_i, raw_i, _dtype, data in attrs:
            attr = text_of(a_name_i)
            if attr == "versionCode":
                report["versionCode"] = (data, new_code)
                struct.pack_into("<I", axml, off + 16, new_code)
            elif attr == "versionName":
                idx, old = data, text_of(data)
                if len(old) != len(new_name):
                    alt = text_of(raw_i) if 0 <= raw_i < len(pool) else old
                    if len(alt) == len(new_name):
                        idx, old = raw_i, alt
                    else:
                        raise SystemExit(
                            f"versionName length mismatch: pool entry {old!r} is "
                            f"{len(old)} chars, {new_name!r} is {len(new_name)}; "
                            "need an equal-length name"
                        )
                chars, nbytes, is_utf8 = pool[idx]
                axml[chars:chars + nbytes] = new_name.encode(
                    "utf-8" if is_utf8 else "utf-16-le")
                struct.pack_into("<I", axml, off + 16, idx)
                if 0 <= raw_i < len(pool):
                    struct.pack_into("<I", axml, off + 8, idx)
                report["versionName"] = (old, new_name)
        return report
    raise SystemExit("no <manifest> element found")


def tag_config(raw, code):
    """Append ?apk=<code> to the shell start URL so the web app knows its build."""
    cfg = json.loads(raw.decode("utf-8"))
    server = cfg.setdefault("server", {})
    url = re.sub(r"[?&]apk=\d+", "", server.get("url", "")).rstrip("?&")
    if not url:
        raise SystemExit("capacitor config has no server.url to tag")
    server["url"] = url + ("&" if "?" in url else "?") + f"apk={code}"
    return json.dumps(cfg, indent="\t").encode("utf-8")


def main(src_apk, dst_apk, new_code, new_name, tag_apk=False, web_assets=None):
    with zipfile.ZipFile(src_apk) as zin:
        manifest = bytearray(zin.read("AndroidManifest.xml"))
        original_len = len(manifest)
        report = patch(manifest, new_code, new_name)
        if len(manifest) != original_len:
            raise SystemExit("manifest length changed; refusing to write")
        print("patched:", report)

        with zipfile.ZipFile(dst_apk, "w", zipfile.ZIP_DEFLATED) as zout:
            managed = {name for name, _ in web_assets or []}
            for info in zin.infolist():
                if info.filename.endswith("/"):
                    continue
                if (web_assets is not None
                        and info.filename.startswith(WEB_PREFIX)
                        and info.filename[len(WEB_PREFIX):] in managed):
                    continue    # rebuilt below from the repository copies
                data = manifest if info.filename == "AndroidManifest.xml" else zin.read(info.filename)
                if tag_apk and info.filename.endswith("assets/capacitor.config.json"):
                    data = tag_config(data, new_code)
                zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
                zi.external_attr = info.external_attr
                zi.create_system = 0
                zi.compress_type = info.compress_type
                zout.writestr(zi, bytes(data))
            for name, data in web_assets or []:
                zi = zipfile.ZipInfo(WEB_PREFIX + name, date_time=(1981, 1, 1, 1, 1, 0))
                zi.external_attr = 0o644 << 16
                zi.create_system = 0
                zi.compress_type = zipfile.ZIP_DEFLATED
                zout.writestr(zi, data)
    if web_assets is not None:
        print("bundled site:", len(web_assets), "files from", WEB_PREFIX)
    print("wrote", dst_apk)


if __name__ == "__main__":
    flag_only = {"--tag-apk"}
    with_value = {"--web-dir", "--web-files"}
    flags, values, positional = set(), {}, []
    argv = sys.argv[1:]
    i = 0
    while i < len(argv):
        token = argv[i]
        if token in flag_only:
            flags.add(token)
        elif token in with_value:
            if i + 1 >= len(argv):
                raise SystemExit(f"{token} needs a value")
            values[token] = argv[i + 1]
            i += 1
        elif token.startswith("--"):
            raise SystemExit(f"unknown flag: {token}")
        else:
            positional.append(token)
        i += 1
    if len(positional) < 2:
        raise SystemExit("usage: bump-version.py SRC DST [CODE] [NAME] [--tag-apk] [--web-dir DIR --web-files 'a b c']")
    src, dst = positional[0], positional[1]
    code = int(positional[2]) if len(positional) > 2 else NEW_CODE
    name = positional[3] if len(positional) > 3 else NEW_NAME
    assets = None
    if "--web-dir" in values or "--web-files" in values:
        if not ("--web-dir" in values and "--web-files" in values):
            raise SystemExit("--web-dir and --web-files must be used together")
        assets = read_web_assets(values["--web-dir"], values["--web-files"].split())
    main(src, dst, code, name, "--tag-apk" in flags, assets)

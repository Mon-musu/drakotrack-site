#!/usr/bin/env bash
# Build the next installable update of the sideloaded DrakoTrack APK.
#
# Every build is signed with the SAME long-lived key and gets a HIGHER
# versionCode, which is what lets Android install it as an update over the
# previous build (no uninstall, no Play Store involved). The build number is
# also stamped into the shell start URL (?apk=<code>) and published in
# apk/version.json, which the in-app update check reads.
#
# Channels (PUBLISH=auto|github|site):
#   github  binary uploaded as a GitHub release asset; the repo keeps only
#           apk/version.json, so git history no longer grows by ~6 MB a release
#   site    binary copied into apk/ and served by Vercel
#   auto    github when GH_TOKEN is set, otherwise site
#
# Usage: ./release-apk.sh
# Overrides: BASE_APK, KEYSTORE, KEY_ALIAS, STOREPASS, PUBLISH, GH_TOKEN,
#            GH_REPO, PUBLIC_BASE, VERSION_NAME (skip the bump, e.g. from a tag)
set -euo pipefail

cd "$(dirname "$0")"

BASE_APK=${BASE_APK:-apk-build/shell-base.apk}
KEYSTORE=${KEYSTORE:-apk-build/keys/drakotrack-sideload.jks}
KEY_ALIAS=${KEY_ALIAS:-drakotrack}
STORE_PASS_FILE=apk-build/keys/.storepass
VERSION_FILE=apk-version.json
OUT_DIR=bundle
APK_DIR=apk
PUBLIC_BASE=${PUBLIC_BASE:-https://drakotrack.vercel.app}
GH_REPO=${GH_REPO:-Mon-musu/drakotrack-site}
GH_API=${GH_API:-https://api.github.com}
GH_UPLOAD=${GH_UPLOAD:-https://uploads.github.com}
PUBLISH=${PUBLISH:-auto}
if [ "$PUBLISH" = "auto" ]; then
  if [ -n "${GH_TOKEN:-}" ]; then PUBLISH=github; else PUBLISH=site; fi
fi

die() { echo "error: $*" >&2; exit 1; }

# --- toolchain ---------------------------------------------------------------
if ! command -v java >/dev/null 2>&1; then
  if [ -x "$HOME/tools/jdk17/bin/java" ]; then
    export JAVA_HOME="$HOME/tools/jdk17" PATH="$HOME/tools/jdk17/bin:$PATH"
  else
    die "no java found; install a JDK 17+ or set JAVA_HOME"
  fi
fi
if ! command -v apksigner >/dev/null 2>&1; then
  if [ -x "$HOME/tools/build-tools/apksigner" ]; then
    export PATH="$HOME/tools/build-tools:$PATH"
  else
    die "no apksigner found; install Android build-tools or add them to PATH"
  fi
fi
for bin in zipalign aapt2 python3 curl; do
  command -v "$bin" >/dev/null 2>&1 || die "missing required tool: $bin"
done

[ -f "$BASE_APK" ] || die "base APK not found: $BASE_APK"
[ -f "$KEYSTORE" ] || die "keystore not found: $KEYSTORE (back this file up: losing it means every install must be uninstalled once)"
[ -f "$VERSION_FILE" ] || die "missing $VERSION_FILE (holds the current versionCode/versionName)"
[ "$PUBLISH" = "github" ] || [ "$PUBLISH" = "site" ] || die "PUBLISH must be auto, github or site"

if [ -z "${STOREPASS:-}" ]; then
  [ -f "$STORE_PASS_FILE" ] || die "no keystore password: set STOREPASS or create $STORE_PASS_FILE"
  STOREPASS=$(tr -d '\r\n' < "$STORE_PASS_FILE")
fi

# --- next version ------------------------------------------------------------
read -r CUR_CODE CUR_NAME < <(python3 - "$VERSION_FILE" <<'PY'
import json, sys
v = json.load(open(sys.argv[1]))
print(v["versionCode"], v["versionName"])
PY
)

NEXT_CODE=$((CUR_CODE + 1))
if [ -n "${VERSION_NAME:-}" ]; then
  NEXT_NAME=$VERSION_NAME          # tag-driven run: the tag names the version
else
  NEXT_NAME=$(python3 - "$CUR_NAME" <<'PY'
import sys
major, minor = (int(x) for x in sys.argv[1].split(".")[:2])
minor += 1
if minor > 9:            # keep the name 3 chars so it patches without a rebuild
    major, minor = major + 1, 0
print(f"{major}.{minor}")
PY
  )
fi
[ "${#NEXT_NAME}" -eq 3 ] || die "versionName must be 3 characters (got '$NEXT_NAME'): it is patched into a fixed-length string"
[ "$NEXT_NAME" != "$CUR_NAME" ] || die "$NEXT_NAME is already the published version; use a new version name"
echo "version: $CUR_NAME ($CUR_CODE) -> $NEXT_NAME ($NEXT_CODE) | channel: $PUBLISH"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# --- patch version (+ start URL tag), align, sign ----------------------------
python3 apk-build/bump-version.py "$BASE_APK" "$WORK/patched.apk" "$NEXT_CODE" "$NEXT_NAME" --tag-apk
zipalign -p -f 4 "$WORK/patched.apk" "$WORK/aligned.apk"
zipalign -c -p 4 "$WORK/aligned.apk" >/dev/null || die "alignment check failed"

mkdir -p "$OUT_DIR"
OUT_APK="$OUT_DIR/drakotrack-$NEXT_NAME.apk"
apksigner sign \
  --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$STOREPASS" --key-pass "pass:$STOREPASS" \
  --min-sdk-version 24 \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT_APK" "$WORK/aligned.apk"

cp -f "$OUT_APK" "$OUT_DIR/drakotrack-latest.apk"

# --- verify ------------------------------------------------------------------
apksigner verify --print-certs "$OUT_APK" >/dev/null || die "signature verification failed"
unzip -tq "$OUT_APK" >/dev/null || die "zip integrity check failed"
PACKAGE_LINE=$(aapt2 dump badging "$OUT_APK" | sed -n 1p)
grep -q "versionCode='$NEXT_CODE'" <<<"$PACKAGE_LINE" || die "versionCode not applied"
grep -q "versionName='$NEXT_NAME'" <<<"$PACKAGE_LINE" || die "versionName not applied"
unzip -p "$OUT_APK" assets/capacitor.config.json | grep -q "apk=$NEXT_CODE" \
  || die "start URL was not tagged with the build number"

# --- publish the APK ---------------------------------------------------------
TAG="apk-$NEXT_NAME"
ASSET="drakotrack-$NEXT_NAME.apk"
mkdir -p "$APK_DIR"
APK_URL=""

if [ "$PUBLISH" = "github" ]; then
  [ -n "${GH_TOKEN:-}" ] || die "PUBLISH=github needs GH_TOKEN with Contents: read and write on $GH_REPO"
  echo "publishing $TAG to $GH_REPO"
  BODY=$(python3 - "$NEXT_CODE" "$NEXT_NAME" <<'PY'
import json, sys
code, name = sys.argv[1:3]
print(json.dumps({
    "tag_name": f"apk-{name}",
    "name": f"APK {name} (build {code})",
    "draft": False,
    "prerelease": False,
    "body": f"DrakoTrack APK {name}, versionCode {code}. Signed with the sideload key, so it installs over previous builds.",
}))
PY
)
  RESP=$(curl -sS -w '\n%{http_code}' -X POST "$GH_API/repos/$GH_REPO/releases" \
    -H "Authorization: Bearer $GH_TOKEN" -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' -H 'Content-Type: application/json' -d "$BODY")
  STATUS=$(printf '%s' "$RESP" | tail -n1)
  JSON=$(printf '%s' "$RESP" | sed '$d')
  if [ "$STATUS" = "422" ]; then        # tag already exists: reuse that release
    RESP=$(curl -sS -w '\n%{http_code}' "$GH_API/repos/$GH_REPO/releases/tags/$TAG" \
      -H "Authorization: Bearer $GH_TOKEN" -H 'Accept: application/vnd.github+json')
    STATUS=$(printf '%s' "$RESP" | tail -n1)
    JSON=$(printf '%s' "$RESP" | sed '$d')
    echo "release $TAG already existed; reusing it"
  fi
  [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ] || die "GitHub release failed (HTTP $STATUS): $JSON"
  RELEASE_ID=$(printf '%s' "$JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))')
  [ -n "$RELEASE_ID" ] || die "GitHub release response had no id: $JSON"

  RESP=$(curl -sS -w '\n%{http_code}' -X POST "$GH_UPLOAD/repos/$GH_REPO/releases/$RELEASE_ID/assets?name=$ASSET" \
    -H "Authorization: Bearer $GH_TOKEN" -H 'Accept: application/vnd.github+json' \
    -H 'Content-Type: application/vnd.android.package-archive' --data-binary "@$OUT_APK")
  STATUS=$(printf '%s' "$RESP" | tail -n1)
  JSON=$(printf '%s' "$RESP" | sed '$d')
  if [ "$STATUS" = "422" ]; then        # asset already uploaded by a previous run
    RESP=$(curl -sS -w '\n%{http_code}' "$GH_API/repos/$GH_REPO/releases/$RELEASE_ID/assets" \
      -H "Authorization: Bearer $GH_TOKEN" -H 'Accept: application/vnd.github+json')
    JSON=$(printf '%s' "$RESP" | sed '$d')
  fi
  printf '%s' "$JSON" > "$WORK/asset.json"
  APK_URL=$(python3 - "$ASSET" "$WORK/asset.json" <<'PY'
import json, sys
asset, path = sys.argv[1], sys.argv[2]
data = json.load(open(path))
items = data if isinstance(data, list) else [data]
for item in items:
    if item.get("name") == asset and item.get("browser_download_url"):
        print(item["browser_download_url"])
        break
PY
)
  [ -n "$APK_URL" ] || die "no download URL for $ASSET in the GitHub response: $JSON"
  rm -f "$APK_DIR"/*.apk        # the repository keeps only version.json
else
  cp -f "$OUT_APK" "$APK_DIR/drakotrack-latest.apk"
  APK_URL="$PUBLIC_BASE/apk/drakotrack-latest.apk"
fi

# --- write the update feed and the version state -----------------------------
python3 - "$NEXT_CODE" "$NEXT_NAME" "$OUT_APK" "$APK_DIR/version.json" "$APK_URL" <<'PY'
import datetime, hashlib, json, sys
code, name, apk_path, out_path, apk_url = sys.argv[1:6]
data = open(apk_path, "rb").read()
info = {
    "versionCode": int(code),
    "versionName": name,
    "apkUrl": apk_url,
    "sizeBytes": len(data),
    "sha256": hashlib.sha256(data).hexdigest(),
    "releasedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"),
    "notes": "Actualiza la app: misma cuenta y mismos datos.",
}
json.dump(info, open(out_path, "w"), indent=2, ensure_ascii=False)
print("feed", out_path, "->", info["versionCode"], info["versionName"], "|", info["apkUrl"])
PY
printf '{\n  "versionCode": %d,\n  "versionName": "%s"\n}\n' "$NEXT_CODE" "$NEXT_NAME" > "$VERSION_FILE"

echo "built:   $OUT_APK"
echo "stable:  $OUT_DIR/drakotrack-latest.apk"
echo "channel: $PUBLISH"
echo "feed:    $APK_DIR/version.json"
echo "sha256:  $(sha256sum "$OUT_APK" | cut -d' ' -f1)"
apksigner verify --print-certs "$OUT_APK" | grep -E 'Signer #1 certificate (DN|SHA-256)' || true

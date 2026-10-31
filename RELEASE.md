# Releasing the Android APK (sideload)

DrakoTrack ships as a **thin client**: the APK is a Capacitor shell that loads
`https://drakotrack.vercel.app`, so web changes go live on their own and only
native-shell changes need a new APK.

## What needs a rebuild — and what doesn't

| Change | New APK? |
| --- | --- |
| Any web code (`app.js`, `styles.css`, `index.html`, `api/**`, programs) | **No** — deploy the site, the app picks it up |
| Changing the start URL (`server.url`), app name/icon, plugins, permissions | **Yes** |
| Bumping the version shown to users | **Yes** |

## Non-negotiables for updates to install in place

Android only installs an update over an existing app when **both** hold:

1. **Same signing key.** Every build must be signed with
   `apk-build/keys/drakotrack-sideload.jks` (alias `drakotrack`; password in
   `apk-build/keys/.storepass` next to it).
2. **Higher `versionCode`.** Android compares this integer, not the version name.

Both are handled by `release-apk.sh`; you never edit versions by hand.

> **Back up the keystore.** It is gitignored on purpose (this repository is
> public) and it is the only key that can update installed copies. If it is
> lost, every user has to uninstall once before installing a build signed with
> a new key. Store the `.jks` and its password file somewhere safe.

Builds from **1.3 (build 4)** onwards are signed with that sideload key. The
original pre-1.3 APK used an older release key that is not in this repository,
so moving to 1.3 required one uninstall; from 1.3 on, every build updates in
place.

## Releasing from CI (push a tag)

`.github/workflows/apk-release.yml` builds, signs and attaches the APK whenever
a tag named `apk-<major>.<minor>` is pushed, so the release machine needs no
toolchain:

```bash
git tag apk-1.4
git push origin apk-1.4
```

The tag name is the version name; the workflow builds `versionCode` = the
current `apk-version.json` value + 1, so the new build always installs over the
previous one. It then creates (or reuses) release `apk-1.4`, attaches
`drakotrack-1.4.apk`, and commits the refreshed `apk/version.json` and
`apk-version.json` back to `main` — that write-back is what keeps the next
`versionCode` moving and the site feed in step.

Pushing an already released name fails on purpose (`… is already the published
version`), because a second build with the same name would carry a lower or
equal `versionCode` than the installed app.

### One-time setup: give CI the signing key

The keystore is gitignored (this repository is public), so the workflow reads it
from two repository secrets — Settings → Secrets and variables → Actions →
**New repository secret**:

| Secret | Value |
| --- | --- |
| `APK_KEYSTORE_BASE64` | output of `base64 -w0 apk-build/keys/drakotrack-sideload.jks` |
| `APK_KEYSTORE_PASSWORD` | the contents of `apk-build/keys/.storepass` |

```bash
base64 -w0 apk-build/keys/drakotrack-sideload.jks   # macOS: base64 -i <file>
```

Until both secrets exist the job fails immediately and says which one is
missing; it never falls back to an unsigned or differently signed build.

The two build inputs CI needs are tracked in the repository for this reason:
`apk-build/shell-base.apk` and `apk-build/bump-version.py`. Everything else
under `apk-build/` (keys, scratch output) stays ignored.

### After the workflow

The release asset is live as soon as the job finishes, but the **site** may
still serve the old feed: deploy so the new `apk/version.json` goes public (if
Vercel deploys from git, its own deploy after the write-back already does it).

## Cutting a release

Requirements: JDK 17+ and Android build-tools (`zipalign`, `apksigner`,
`aapt2`). The script uses `$HOME/tools/jdk17` and `$HOME/tools/build-tools` when
they exist, otherwise whatever is on `PATH`.

```bash
./release-apk.sh
```

It performs, in order:

1. Reads the current version from `apk-version.json` and bumps it — `versionCode`
   +1, and the name `1.1 → 1.2 … 1.9 → 2.0` (names stay three characters long
   because the version name is patched in place).
2. Patches `AndroidManifest.xml` inside the shell APK (`apk-build/bump-version.py`)
   and stamps the build number into the start URL, giving
   `https://drakotrack.vercel.app?apk=<versionCode>` — that query parameter is
   how the web app knows which build is installed.
3. Aligns (`zipalign -p 4`) and signs (`apksigner`, v2 + v3, min SDK 24).
4. Verifies signature, zip integrity, alignment, and that `versionCode`,
   `versionName` and the URL tag were applied — it aborts if any check fails.
5. Writes the artefacts and the update feed.

Outputs:

- `bundle/drakotrack-<version>.apk` — the release
- `bundle/drakotrack-latest.apk` — the same bytes under a stable name
- `apk/version.json` — the feed the site serves (and the APK too, in `site` mode)
- `apk-version.json` — updated version state, commit it

## Where the APK is published

`release-apk.sh` picks the channel from the environment:

| Channel | When | Where the binary goes |
| --- | --- | --- |
| `github` | `GH_TOKEN` set (default when present) | GitHub release asset on tag `apk-<version>`; the repository keeps only `apk/version.json` |
| `site` | no `GH_TOKEN` | copied into `apk/` and served by Vercel (adds ~6 MB per release to git) |

Force one with `PUBLISH=github` or `PUBLISH=site`; the repository defaults to
`Mon-musu/drakotrack-site` and can be overridden with `GH_REPO`.

```bash
GH_TOKEN=... ./release-apk.sh     # publishes release apk-1.4 + asset drakotrack-1.4.apk
```

In `github` mode the feed's `apkUrl` becomes the asset's public download URL
(`https://github.com/Mon-musu/drakotrack-site/releases/download/apk-<version>/drakotrack-<version>.apk`),
any leftover `apk/*.apk` is removed so nothing binary is committed, and an
existing tag is reused, so a re-run only retries the asset upload. A failed
publish aborts before writing the feed or the version state, so the previous
release stays authoritative.

## Deploying

Commit `apk-version.json` and `apk/version.json`, then deploy:

```bash
cd .deploy-stage && npx vercel deploy --prod --yes --token="$VERCEL_TOKEN"
```

In `site` mode also run `cp -r apk .deploy-stage/apk` first. In `github` mode the
site only needs the feed, so `.deploy-stage/apk/` can be removed once the release
is live.

Serving details live in `vercel.json`: `/apk/version.json` is `no-store`, and
`/apk/*.apk` is sent as `application/vnd.android.package-archive` with
`Content-Disposition: attachment` so Android treats the download as a package.

## How users get updated

- `update-check.js` runs on the site. Inside the app it reads `?apk=<code>` and
  compares it with `/apk/version.json`; when the feed is newer it shows a banner
  with the version and a **Descargar** button (it hands the URL to Android's
  share sheet, because `<a download>` does nothing inside this WebView).
  Dismissals are remembered per version in `localStorage`.
- Permanent download links: the APK links in `index.html` are edited by hand
  (they currently serve the Supabase-hosted copy). A release only rewrites the
  in-app feed, so publishing never touches the page markup.
- In a normal browser there is no `?apk=`, so the banner never appears.

## Verifying a build by hand

```bash
apksigner verify --print-certs bundle/drakotrack-latest.apk   # v2 + v3, CN=DrakoTrack Sideload
aapt2 dump badging bundle/drakotrack-latest.apk | head -1     # new versionCode/versionName
unzip -p bundle/drakotrack-latest.apk assets/capacitor.config.json | grep apk=   # ?apk=<code>
sha256sum bundle/drakotrack-latest.apk                        # must equal apk/version.json
```

## Known limits

- `apk-build/shell-base.apk` is the only native source here: there is no
  Gradle/Capacitor project in this repository, so native changes (plugins,
  icons, permissions) need the original Android project and a fresh shell.
- The repository carries no APK binary in `github` mode: releases accumulate on the
  releases page instead, so clone sizes stay stable. In `site` mode each release
  adds ~6 MB to history; prefer `github`.

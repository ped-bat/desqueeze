# Releasing & public download links

The landing page links to **GitHub Release assets**, not CI artifacts.
CI artifacts require a logged-in GitHub account, expire after 14 days, and
are wrapped in a zip — none of which works for a public download button.

## Prerequisite: the repository must be public

Release assets on a **private** repository are not publicly downloadable —
anonymous requests get a 404. Before the landing page can link to them,
either make `ped-bat/desqueeze` public, or host the installers somewhere
else (S3/R2/Cloudflare Pages) and point the buttons there.

> Before going public, purge the personal test image from git history —
> `tests-user/_DSC0356.ARW` is untracked now but still present in earlier
> commits (`git filter-repo --path tests-user --invert-paths`, then a
> force-push).

## Static links for the landing page

GitHub serves a `latest` alias that always redirects to the newest
published release, so these URLs never need updating:

```
https://github.com/ped-bat/desqueeze/releases/latest/download/Desqueeze-macOS-arm64.dmg
https://github.com/ped-bat/desqueeze/releases/latest/download/Desqueeze-Windows-x64.exe
https://github.com/ped-bat/desqueeze/releases/latest/download/Desqueeze-Linux-x86_64.AppImage
```

This works because `artifactName` in `package.json` is pinned to a
**version-less** filename per platform. Don't reintroduce `${version}` into
those patterns — `latest/download/<name>` matches on the exact filename, so
a versioned name would break every link on the next release.

> Note the Linux name is `x86_64`, not `x64`: electron-builder rewrites the
> `${arch}` macro to `x86_64` for AppImage (and `amd64` for deb), while DMG
> and NSIS keep `x64`/`arm64`. Confirm the exact asset names on the release
> page after the first run before wiring up the landing page buttons.

A "just take me to the downloads" link:

```
https://github.com/ped-bat/desqueeze/releases/latest
```

## Cutting a release

```bash
npm version minor          # or patch / major — creates the vX.Y.Z tag
git push --follow-tags
```

The tag push triggers `.github/workflows/release.yml`, which builds all
three platforms, runs the full test suite on each, and publishes the
installers to a GitHub Release named after the tag. If `releases/<tag>.md`
exists it becomes the release notes; otherwise they're auto-generated from
commits.

You can also run it by hand from the Actions tab (**Release** → *Run
workflow*) against an existing tag.

## macOS signing in CI (required for public downloads)

Without signing credentials, the CI-built DMG is unsigned and Gatekeeper
blocks it on other Macs ("app is damaged"). Add these repository secrets
(**Settings → Secrets and variables → Actions**):

| Secret | What it is |
| --- | --- |
| `MAC_CERT_P12_BASE64` | Developer ID cert + key exported as `.p12`, base64-encoded |
| `MAC_CERT_PASSWORD` | The password set when exporting the `.p12` |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Developer team ID |

To export the certificate:

```bash
# Keychain Access → login → My Certificates → "Developer ID Application: …"
# right-click → Export → .p12, then:
base64 -i Desqueeze-DeveloperID.p12 | pbcopy
```

Until those secrets exist, the workflow still succeeds but produces an
**unsigned** macOS DMG. In that case, build the Mac installer locally with
`npm run dist` (which notarizes via the `Desqueeze` keychain profile) and
upload it over the CI one:

```bash
gh release upload v0.1.0 dist/Desqueeze-macOS-arm64.dmg --clobber
```

Verify any DMG before publishing:

```bash
spctl -a -vv dist/mac-arm64/Desqueeze.app   # expect: accepted, Notarized Developer ID
```

A local Mac build re-signs the checked-in binaries in `resources/bin/darwin/`,
so `git status` shows them modified afterwards. Only the signature blob
changes (same size, same linkage) — discard it rather than committing noise:

```bash
git checkout -- resources/bin/darwin
```

## Windows signing

The Windows installer is unsigned, so SmartScreen shows "Windows protected
your PC" until the download builds reputation. Removing that warning needs
an EV/OV code-signing certificate (~€300/year from Sectigo, DigiCert, etc.).
Worth noting on the landing page so the warning doesn't surprise people.

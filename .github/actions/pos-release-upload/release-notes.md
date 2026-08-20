Rolling build of `main`. Asset names are stable, so the download links in each
store's admin never change; the contents are replaced on every merge.

**The tag stays at the commit where this release was first created — it is not
moved.** To find out which commit a given binary came from, read the
`android-build.json` / `ios-build.json` asset next to it.

- `GwinnPOS-latest.apk` — Android debug build, installs directly from the link.
- `GwinnPOS-latest-unsigned.ipa` — unsigned iOS build; must be re-signed with
  AltStore/Sideloadly from a computer before it will install.

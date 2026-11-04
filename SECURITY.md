# Security

Sentiong manages things that matter: which GitHub account your code is pushed with, your SSH
keys, and your Git config. This page explains what it touches, what it deliberately does not,
and how to report a problem.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through
GitHub instead: open the repository's **Security** tab and click **Report a vulnerability**.

Include what you found, how to reproduce it, and which version and OS you used. Sentiong is
maintained by volunteers, so please allow up to 7 days for a first reply. Once a fix is
released, the advisory is published with credit to you, unless you prefer otherwise.

Only the latest release receives security fixes.

## What Sentiong touches

| Where | What | Secrets? |
| --- | --- | --- |
| `~/.gitconfig` | one marked block that includes Sentiong's own file | no |
| `~/.config/sentiong/` | profiles, generated gitconfig files, the guard hooks, backups of `~/.gitconfig` | no |
| `~/.ssh/sentiong_*` | SSH keys you ask the wizard to create | **yes**, private keys |
| GitHub | the public halves of those keys, uploaded with your permission | no |

## What Sentiong never does

- **Store GitHub tokens.** The GitHub CLI (`gh`) keeps them in your system keychain. When Git
  needs one for an HTTPS push, the credential helper asks `gh` for it at that moment, and it
  only ever lives in memory.
- **Send data anywhere but GitHub.** There is no telemetry and no Sentiong server. The app
  talks to your local `git`, `gh` and `ssh-keygen`, and loads avatars from GitHub.
- **Overwrite files it did not create.** New SSH keys get a fresh file name, and changes to
  `~/.gitconfig` stay inside the marked block, after a backup.

## Design decisions you should know about

- **Keys are created without a passphrase**, so Git can use them without prompting. Anyone who
  can read your `~/.ssh/sentiong_*` files can push as that account, so protect your user
  account and disk (FileVault, BitLocker, LUKS). You can add a passphrase yourself later with
  `ssh-keygen -p -f ~/.ssh/sentiong_<profile>`. Git will then ask for it, or your SSH agent
  will (on macOS, add `UseKeychain yes` to `~/.ssh/config`).
- **The wrong-account guard is a safety net, not a lock.** It catches honest mistakes. Anyone
  can skip it with `SENTIONG_SKIP=1`, and a repository that sets its own `core.hooksPath`
  (for example Husky 9) bypasses it.
- **Key upload needs extra GitHub permissions.** Uploading keys requires the
  `admin:public_key` and `admin:ssh_signing_key` scopes on the `gh` token. These scopes also
  allow deleting keys. Sentiong requests them when you sign in an account through it, or
  when you first upload a key from an existing `gh` login, and it only ever adds keys. You
  can review or revoke them at <https://github.com/settings/applications>.
- **The app window is locked down.** A Content Security Policy only allows the app's own
  scripts and styles, plus images from GitHub, so injected markup cannot load or run scripts
  of its own.

## Verifying a download

Every release includes `SHA256SUMS.txt` and a signed
[build provenance attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations),
which proves the installer was built by this repository's release workflow from a specific
commit:

```bash
gh attestation verify Sentiong_x.y.z_universal.dmg --repo ramizbrain/sentiong
shasum -a 256 -c SHA256SUMS.txt --ignore-missing      # Linux: sha256sum -c ...
```

The macOS builds are not signed with an Apple Developer ID or notarized yet, and the Windows
builds are not code-signed. That is why your OS warns on first launch. The attestation above
is the way to confirm that a download is genuine.

# Contributing to Sentiong

Thanks for helping make Sentiong better! This guide covers how to set up the project and what
a pull request needs before it can be merged.

## Getting started

1. Install the prerequisites listed in the [README](README.md#build-from-source).
2. Fork and clone the repository, then run:

   ```bash
   pnpm install
   pnpm tauri dev     # the real app
   pnpm dev           # or just the UI in a browser, with an in-memory demo backend
   ```

> [!IMPORTANT]
> `pnpm tauri dev` uses **your real** `~/.gitconfig` and `~/.ssh`. When you work on anything
> that writes them, prefer the browser demo or the Rust tests, which run in throwaway home
> folders.

## Before you open a pull request

Every one of these should pass (CI runs them too):

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

## Commit messages and versioning

Sentiong follows [Semantic Versioning](https://semver.org). The version number and
`CHANGELOG.md` are generated from commit messages, so please write commits (and pull request
titles, since pull requests are squash-merged) as
[Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<optional scope>): <short summary>
```

| Type | Use it for | Version bump | In the changelog |
| --- | --- | --- | --- |
| `feat` | a new user-facing feature | minor | Features |
| `fix` | a bug fix | patch | Bug Fixes |
| `perf` | a performance improvement | patch | Performance |
| `docs` | documentation only | none | Documentation |
| `refactor`, `test`, `build`, `ci`, `style`, `chore` | everything else | none | hidden |

A breaking change is marked with `!` after the type or a `BREAKING CHANGE:` footer. While
Sentiong is below 1.0.0, a breaking change bumps the minor version instead of the major one.

Examples:

```
feat(guard): warn before pushing to a repository owned by another profile
fix(gitconfig): quote folder rules that contain a double quote
docs: explain how owner rules match HTTPS remotes
```

## How releases work

You don't bump versions by hand. On every push to `main`,
[release-please](https://github.com/googleapis/release-please) keeps a pull request titled
`chore(main): release x.y.z` up to date with the next version and changelog. When a
maintainer merges it, the release workflow tags `vX.Y.Z`, publishes a GitHub Release, and
attaches the macOS, Windows, and Linux installers built by CI.

## Guidelines

- **Keep the core pure.** Rendering config (`gitconfig.rs`), validating profiles
  (`profiles.rs`), and diagnosing repositories (`repos::diagnose`) take data and return data.
  Anything that touches the file system or runs a tool lives at the edges and goes through
  `service.rs`. `commands.rs` stays a thin IPC layer.
- **Never surprise the user's Git config.** Sentiong only edits its own marked block in
  `~/.gitconfig` and files under `~/.config/sentiong/`. Changes to `config_writer.rs` or
  `gitconfig.rs` need tests proving that the rest of `~/.gitconfig` is kept byte for byte, and
  that applying twice changes nothing.
- **Tokens stay in gh.** Never store, log, or send a GitHub token anywhere. Pass it to `gh`
  through `GH_TOKEN` in memory, as `gh.rs` does.
- **Change the contract on both sides.** If you change a type in `src-tauri/src/models.rs`,
  update `src/types/sentiong.ts`, the demo backend, and the contract tests in the same PR.
- **Test behaviour, not implementation.** Rust tests run real `git` in temporary homes
  (`tempfile`). Frontend tests use Testing Library and fake only the backend
  (`src/test/fakeBackend.ts`).
- **Motion is presentation.** Keep timings in `src/lib/timing.ts`, keep logic out of
  animation callbacks, and make sure things still read well with *Reduce motion* on.
- **Small, focused pull requests** are easier to review. Explain *why*, and add a screenshot
  or a short recording for UI changes (`pnpm dev` with `?demo=full` is handy for those).

## Reporting bugs

Please include your OS, your Git and `gh` versions (`git --version`, `gh --version`), how you
installed Sentiong, what you expected, and what happened. For "wrong identity" bugs, the output
of this command in the affected repository helps a lot (it shows no secrets):

```bash
git config --show-origin --show-scope --get-regexp '^(user\.|sentiong\.|core\.(sshcommand|hookspath)|remote\.origin\.url)'
```

## Brand assets

The official artwork lives in [`docs/assets/brand/source/`](docs/assets/brand/source/). Everything
else is traced from it:

| File | Used for |
| --- | --- |
| `src/components/brand/logoPaths.ts` | the mark and wordmark in the app (`BrandMark`, `BrandLogo`) |
| `docs/assets/brand/sentiong-logo{,-dark}.svg` | the README header, for light and dark backgrounds |
| `docs/assets/brand/sentiong-mark{,-dark}.svg` | the mark alone |
| `docs/assets/brand/app-icon.svg` | the source of every icon in `src-tauri/icons/` |
| `docs/assets/brand/tray-template.svg` | `src-tauri/icons/tray-template.png`, the macOS menu bar icon |
| `public/favicon.svg` | the browser tab icon |

The brand colors are blue `#545AFE` and ink `#191C23`, which becomes white on dark backgrounds.

After changing `app-icon.svg`, regenerate the platform icons with
`pnpm tauri icon docs/assets/brand/app-icon.svg` and delete the generated `android/` and
`ios/` folders.

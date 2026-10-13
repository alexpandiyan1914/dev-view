# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-13

First public release.

### Added

- `dev-view local [path]`: analyze a project folder.
- `dev-view remote <url>`: analyze a public Git repository by its `https://` URL, using a
  shallow clone into a temporary folder that is always deleted afterwards.
- `dev-view rules`: list every check.
- Universal checks: README, LICENSE, Git repository, `.gitignore`, tracked `.env` files,
  `.env` files not covered by `.gitignore`, tracked private keys, tracked generated folders
  (`node_modules`, `dist`, `build`, virtual environments, ...) and large tracked files.
- Node.js checks: valid `package.json`, publishing metadata, a real `test` script, test files,
  lockfile, `engines`, published files list, duplicate dependencies.
- Python checks: `requirements.txt` is filled in and pinned, Python version declared, test files.
- Detection of Node.js and Python projects and common frameworks (React, Next.js, Vue, Angular,
  Express, NestJS, FastAPI, Flask, Django) and TypeScript.
- Every warning and error explains why it matters and how to fix it.
- A simple, documented score: 100, minus 10 per error, minus 3 per warning.
- A concise report with `--verbose` for full detail, wrapped to the terminal width.
- Clean Ctrl+C handling: the terminal is restored and temporary files are removed.
- Runs on Node.js 22.12 or newer, tested on Node 22 and 24 on Linux and on Node 22 on Windows.

[First Release]: https://github.com/alexpandiyan1914/dev-view/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alexpandiyan1914/dev-view/commits/main

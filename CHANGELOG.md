# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-11-15

Fix issues with your favorite AI chatbot.

### Added

- `--export md|json` on `dev-view local` and `dev-view remote`: saves the errors and warnings, each
  with why it matters and the suggested fix, as a report you can paste into Claude, ChatGPT, Gemini
  or any other AI chatbot. The Markdown report opens with an instruction for the AI and the project
  context (detected technologies, score). The JSON report is meant for scripts and CI jobs.
- `--out <file>` chooses where the report is saved. The default is `dev-view-report.md` or
  `dev-view-report.json` in the current folder.
- `--stdout` prints only the report, with no banner or colors, so it can be piped or copied.
- `--max-issues <n>` keeps the report short by including only the n most serious issues.
- `--force` replaces an existing report file. Without it, Dev View asks first in a terminal and
  refuses everywhere else, so a report never overwrites a file by accident.
- Many similar findings (for example dozens of large files) are merged into one issue in the report.
- The export options are checked before anything is scanned or cloned, so a mistake fails at once.
- A reminder to add the report to `.gitignore` when it is saved inside a Git project that does not
  ignore it.

### Safety

- A report lists file names, rule names and messages only. It never contains file contents (a
  tracked `.env` is reported by name, never by value) and never contains your full folder path.
- Line breaks and control characters are removed from every line of a report, and the Markdown
  asks the AI to treat the report as information, not as instructions.
- Dev View still never changes your project. The only file it can create is the report you ask for.

## [0.2.0] - 2026-11-03

Java support.

### Added

- Detection of Java projects from `pom.xml`, `build.gradle`, `build.gradle.kts` and
  `settings.gradle(.kts)`, with Maven and Gradle shown as technologies.
- Detection of Spring Boot, Quarkus, Micronaut and Android projects.
- Java checks: test files exist, a Maven or Gradle wrapper is committed, no floating dependency
  versions (`LATEST`, `RELEASE`, `1.+`, `latest.release`), and the Java version is declared.
- A tracked `.gradle` folder is now reported as a generated folder.

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
[0.3.0]: https://github.com/alexpandiyan1914/dev-view/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/alexpandiyan1914/dev-view/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/alexpandiyan1914/dev-view/commits/main

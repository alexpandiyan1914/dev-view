# Security Policy

## Supported versions

Dev View is pre-1.0. Only the latest published version receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.2.x   | Yes       |
| 0.1.x   | No        |

## Reporting a vulnerability

Please do **not** report security problems in a public issue.

Use GitHub's private reporting instead: open the **Security** tab of this repository and choose
**Report a vulnerability**. Include what you found, how to reproduce it, and the version of Dev View
you used. You will get a reply as soon as possible, and credit in the release notes if you want it.

## What is in scope

Dev View reads project folders and, in remote mode, clones repositories from addresses you type.
Reports we especially care about:

- Ways to make remote mode run a command, read a local file, or reach a non-HTTPS address, for example
  by getting a crafted URL past the validation.
- Leaking credentials, for example through logs, error messages, or process lists.
- Temporary folders that are not cleaned up, or that can be tampered with.
- A crafted project that makes Dev View write outside the analysis folder, hang, or crash. This
  includes malformed or very large build files such as `package.json`, `pom.xml`, `build.gradle`
  and `requirements.txt`.
- Any way to make Dev View execute code from the analyzed project, for example a build script or a
  wrapper such as `mvnw` or `gradlew`.

## How Dev View stays safe

- Remote mode accepts only plain `https://` addresses: no SSH, `file://`, other transports, or
  credentials in the URL. Addresses are validated before anything touches the network or the disk.
- Git is started without a shell, with `--` before the address, with terminal prompts and credential
  helpers disabled, and with Git LFS downloads skipped.
- Remote analysis uses a shallow clone in a temporary folder that is always deleted, including on Ctrl+C.
- Dev View only reads. It never writes to the analyzed project and never executes its code.
- Build files (`package.json`, `requirements.txt`, `pyproject.toml`, `pom.xml`, `build.gradle` and
  similar) are read as plain text. Dev View never runs npm, pip, Maven, Gradle or any project
  script. Wrapper scripts such as `mvnw` and `gradlew` are only checked for existence, never run.
- The only program Dev View starts is `git`.
- There is no telemetry, and local mode makes no network requests.

## A note on untrusted folders

In local mode Dev View runs the `git` program inside the folder you point it at, using read-only
commands (`git ls-files`, `git check-ignore`). Like any tool that runs Git, treat a folder from an
untrusted source with the same care you would use before running `git status` in it.
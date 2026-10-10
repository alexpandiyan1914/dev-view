import { describe, expect, it } from "vitest";
import { explainCloneFailure, parseRepoUrl, RemoteError } from "../src/input/remote.js";

describe("parseRepoUrl: accepted input", () => {
  it.each([
    ["https://github.com/alexpandiyan1914/dev-view", "https://github.com/alexpandiyan1914/dev-view.git", "dev-view"],
    ["https://github.com/user/project.git", "https://github.com/user/project.git", "project"],
    ["  https://github.com/user/project/  ", "https://github.com/user/project.git", "project"],
    ["https://www.github.com/user/project", "https://github.com/user/project.git", "project"],
    ["https://github.com/user/project/tree/main/src", "https://github.com/user/project.git", "project"],
    ["https://gitlab.com/group/subgroup/project", "https://gitlab.com/group/subgroup/project.git", "project"],
  ])("cleans up %s", (input, cloneUrl, name) => {
    const repo = parseRepoUrl(input);
    expect(repo.cloneUrl).toBe(cloneUrl);
    expect(repo.name).toBe(name);
  });
});

describe("parseRepoUrl: rejected input", () => {
  it.each([
    ["an empty string", ""],
    ["plain text", "not a url"],
    ["a URL with no scheme", "github.com/user/project"],
    ["an address with no repository", "https://github.com/user"],
    ["plain http", "http://github.com/user/project"],
    ["an SSH address", "git@github.com:user/project.git"],
    ["an ssh:// address", "ssh://git@github.com/user/project.git"],
    ["a file:// address", "file:///etc/passwd"],
    ["a Git ext:: transport", "ext::sh -c touch /tmp/pwned"],
    ["an option pretending to be a URL", "--upload-pack=touch /tmp/pwned"],
    ["a URL with a password", "https://user:secret@github.com/user/project"],
    ["a path with a space", "https://github.com/user/pro ject"],
    ["a path that climbs upward", "https://github.com/user/.."],
  ])("blocks %s", (_label, input) => {
    expect(() => parseRepoUrl(input)).toThrow(RemoteError);
  });

  it("explains what to do, not just what went wrong", () => {
    try {
      parseRepoUrl("not a url");
      expect.unreachable();
    } catch (error) {
      const e = error as RemoteError;
      expect(e.title).toBe("Invalid repository URL");
      expect(e.suggestion).toContain("https://github.com/user/project");
    }
  });
});

describe("explainCloneFailure", () => {
  it("recognizes a missing Git installation", () => {
    expect(explainCloneFailure({ code: "ENOENT" }).title).toBe("Git is not installed");
  });

  it("recognizes a timeout", () => {
    expect(explainCloneFailure({ killed: true, signal: "SIGTERM" }).title).toBe(
      "The repository took too long to fetch",
    );
  });

  it.each([
    ["GitHub: repository not found", "remote: Repository not found.\nfatal: repository 'https://github.com/x/y.git/' not found"],
    ["a private repo asking for a username", "fatal: could not read Username for 'https://github.com': terminal prompts disabled"],
    ["an HTTP 403", "fatal: unable to access 'https://github.com/x/y.git/': The requested URL returned error: 403"],
  ])("treats %s as an access problem", (_label, stderr) => {
    expect(explainCloneFailure({ stderr }).title).toBe("Unable to access repository");
  });

  it("treats DNS failure as a network problem", () => {
    const stderr = "fatal: unable to access 'https://nope.invalid/x/y.git/': Could not resolve host: nope.invalid";
    expect(explainCloneFailure({ stderr }).title).toBe("Network problem while fetching");
  });

  it("falls back to Git's last line for unknown errors", () => {
    const error = explainCloneFailure({ stderr: "something odd\nfatal: weird thing happened" });
    expect(error.title).toBe("Could not fetch the repository");
    expect(error.details).toContain("fatal: weird thing happened");
  });
});
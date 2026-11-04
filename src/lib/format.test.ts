import { describe, expect, it } from "vitest";

import { baseName, initials, plural, shortKey, shortenPath } from "./format";

describe("format", () => {
  it("shortens paths inside the home folder", () => {
    expect(shortenPath("/Users/octo/code/app", "/Users/octo")).toBe("~/code/app");
    expect(shortenPath("/Users/octo", "/Users/octo/")).toBe("~");
    expect(shortenPath("/Users/octopus/app", "/Users/octo")).toBe("/Users/octopus/app");
    expect(shortenPath("C:\\Users\\octo\\code", "C:\\Users\\octo")).toBe("~\\code");
  });

  it("makes avatar initials", () => {
    expect(initials("Work Stuff")).toBe("WS");
    expect(initials("personal")).toBe("PE");
    expect(initials("  ")).toBe("?");
  });

  it("formats small things", () => {
    expect(baseName("/a/b/repo/")).toBe("repo");
    expect(shortKey("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabcdefgh")).toBe("ssh-ed25519 …abcdefgh");
    expect(plural(1, "repository", "repositories")).toBe("1 repository");
    expect(plural(3, "key")).toBe("3 keys");
  });
});

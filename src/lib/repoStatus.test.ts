import { describe, expect, it } from "vitest";

import { profile, report } from "../test/fixtures";
import { countByStatus, explain, needsFix, sortReports } from "./repoStatus";

describe("repo status", () => {
  const reports = [
    report({ name: "b-ok" }),
    report({ name: "a-ok" }),
    report({ name: "override", status: "localOverride" }),
    report({ name: "wrong", status: "wrongProfile" }),
    report({ name: "loose", status: "unmanaged" }),
  ];

  it("puts problems first", () => {
    expect(sortReports(reports).map((r) => r.name)).toEqual(["wrong", "override", "loose", "a-ok", "b-ok"]);
  });

  it("counts every status", () => {
    expect(countByStatus(reports)).toEqual({ ok: 2, localOverride: 1, wrongProfile: 1, unmanaged: 1 });
  });

  it("only offers fixes for real problems", () => {
    expect(reports.filter(needsFix).map((r) => r.name)).toEqual(["override", "wrong"]);
  });

  it("explains a wrong profile with both profile names", () => {
    const profiles = [profile({ id: "personal", label: "Personal" }), profile()];
    const text = explain(
      report({ status: "wrongProfile", effectiveProfileId: "personal", expectedProfileId: "work" }),
      profiles,
    );
    expect(text).toContain("belongs to Work");
    expect(text).toContain("commits as Personal");
  });
});

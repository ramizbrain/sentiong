import type { Profile, RepoReport, RepoStatus } from "../types/sentiong";

export const STATUS_LABELS: Record<RepoStatus, string> = {
  ok: "Good",
  localOverride: "Local override",
  wrongProfile: "Wrong profile",
  unmanaged: "No profile",
};

/** Problems first, then repositories without a profile, then the good ones. */
const ORDER: Record<RepoStatus, number> = { wrongProfile: 0, localOverride: 1, unmanaged: 2, ok: 3 };

export function sortReports(reports: readonly RepoReport[]): RepoReport[] {
  return [...reports].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
}

export function needsFix(report: RepoReport): boolean {
  return report.status === "wrongProfile" || report.status === "localOverride";
}

export function countByStatus(reports: readonly RepoReport[]): Record<RepoStatus, number> {
  const counts: Record<RepoStatus, number> = { ok: 0, localOverride: 0, wrongProfile: 0, unmanaged: 0 };
  reports.forEach((report) => counts[report.status]++);
  return counts;
}

/** One sentence on what is wrong and what the fix will do. */
export function explain(report: RepoReport, profiles: readonly Profile[]): string {
  const label = (id: string | null) => profiles.find((profile) => profile.id === id)?.label ?? "no profile";
  switch (report.status) {
    case "ok":
      return `Commits as ${label(report.effectiveProfileId)}.`;
    case "localOverride":
      return `Its own config sets ${report.email ?? "an email"}, which overrides every profile. Fixing removes it.`;
    case "wrongProfile":
      return `Owned by ${report.owner}, which belongs to ${label(report.expectedProfileId)}, but commits as ${label(report.effectiveProfileId)}. Fixing pins this folder to ${label(report.expectedProfileId)}.`;
    case "unmanaged":
      return "No profile applies here. Set a default profile or add a folder rule.";
  }
}

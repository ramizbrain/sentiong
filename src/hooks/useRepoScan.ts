import { useCallback, useState } from "react";

import { toErrorMessage } from "../lib/errors";
import { api } from "../services/sentiongApi";
import type { RepoFix, RepoReport } from "../types/sentiong";

export type ScanStatus = "idle" | "scanning" | "done" | "error";

/** Scans a folder for repositories and fixes the ones that commit as the wrong profile. */
export function useRepoScan() {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [reports, setReports] = useState<RepoReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState<ReadonlySet<string>>(new Set());

  const scan = useCallback(async (root: string) => {
    setStatus("scanning");
    setReports([]);
    setError(null);
    try {
      await api.scanRepositories(root, (event) => {
        if (event.type === "found") setReports((current) => [...current, event.report]);
      });
      setStatus("done");
    } catch (scanError) {
      setError(toErrorMessage(scanError));
      setStatus("error");
    }
  }, []);

  const fix = useCallback(async (report: RepoReport, repoFix: RepoFix) => {
    setFixing((current) => new Set(current).add(report.path));
    try {
      const updated = await api.fixRepository(report.path, repoFix);
      setReports((current) => current.map((existing) => (existing.path === updated.path ? updated : existing)));
      return null;
    } catch (fixError) {
      return toErrorMessage(fixError);
    } finally {
      setFixing((current) => {
        const next = new Set(current);
        next.delete(report.path);
        return next;
      });
    }
  }, []);

  return { status, reports, error, fixing, scan, fix };
}

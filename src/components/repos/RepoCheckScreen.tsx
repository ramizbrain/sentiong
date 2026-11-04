import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { useRepoScan } from "../../hooks/useRepoScan";
import { plural, shortenPath } from "../../lib/format";
import { countByStatus, needsFix, sortReports } from "../../lib/repoStatus";
import { api } from "../../services/sentiongApi";
import type { Profile, RepoFix, RepoReport, Snapshot } from "../../types/sentiong";
import { ArrowLeftIcon, FolderIcon, RefreshIcon } from "../common/Icons";
import { Spinner } from "../common/Spinner";
import { AnimatedNumber } from "../motion/AnimatedNumber";
import { Burst } from "../motion/Burst";
import { RepoRow } from "./RepoRow";

interface RepoCheckScreenProps {
  snapshot: Snapshot;
  homeDirectory: string;
  onBack: () => void;
  onMessage: (tone: "success" | "error", message: string) => void;
}

function defaultRoot(profiles: Profile[], home: string): string {
  return profiles.flatMap((profile) => profile.folders)[0] ?? home;
}

function fixFor(report: RepoReport): RepoFix {
  return report.status === "wrongProfile" && report.expectedProfileId
    ? { type: "pinToProfile", profileId: report.expectedProfileId }
    : { type: "removeLocalIdentity" };
}

export function RepoCheckScreen({ snapshot, homeDirectory, onBack, onMessage }: RepoCheckScreenProps) {
  const [root, setRoot] = useState(() => defaultRoot(snapshot.profiles, homeDirectory));
  const [celebrations, setCelebrations] = useState(0);
  const scan = useRepoScan();

  const sorted = sortReports(scan.reports);
  const counts = countByStatus(scan.reports);
  const broken = scan.reports.filter(needsFix);

  const chooseRoot = async () => {
    const picked = await api.pickFolder(root);
    if (picked) setRoot(picked);
  };

  const fix = async (report: RepoReport) => {
    const failure = await scan.fix(report, fixFor(report));
    if (failure) onMessage("error", failure);
    return failure === null;
  };

  const fixAll = async () => {
    let fixed = 0;
    for (const report of broken) if (await fix(report)) fixed++;
    if (fixed > 0) {
      setCelebrations((count) => count + 1);
      onMessage("success", `Fixed ${plural(fixed, "repository", "repositories")}`);
    }
  };

  return (
    <motion.main
      className="screen repos"
      initial={{ opacity: 0, x: 60, filter: "blur(10px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: 60, filter: "blur(10px)", transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 140, damping: 22 }}
    >
      <header className="repos__header" data-tauri-drag-region>
        <button type="button" className="button button--ghost button--small" onClick={onBack}>
          <ArrowLeftIcon size={14} />
          Profiles
        </button>
        <h1>Check repositories</h1>
      </header>

      <div className="repos__body">
        <section className="repos__intro panel">
          <div>
            <p className="repos__lead">
              Finds repositories that would commit as the wrong person: ones that set their own email, and ones whose
              organization belongs to another profile.
            </p>
            <div className="repos__controls">
              <button type="button" className="root-chip" onClick={() => void chooseRoot()}>
                <FolderIcon size={14} />
                <span className="mono">{shortenPath(root, homeDirectory)}</span>
                <span className="root-chip__action">Change</span>
              </button>
              <motion.button
                type="button"
                className="button button--primary"
                onClick={() => void scan.scan(root)}
                disabled={scan.status === "scanning"}
                whileTap={{ scale: 0.95 }}
              >
                {scan.status === "scanning" ? <Spinner size={14} /> : <RefreshIcon size={14} />}
                {scan.status === "idle" ? "Scan" : scan.status === "scanning" ? "Scanning…" : "Scan again"}
              </motion.button>
            </div>
          </div>
          <dl className="repos__stats">
            <div data-tone="danger">
              <dt>Need a fix</dt>
              <dd>
                <AnimatedNumber value={broken.length} />
              </dd>
            </div>
            <div data-tone="success">
              <dt>Good</dt>
              <dd>
                <AnimatedNumber value={counts.ok} />
              </dd>
            </div>
            <div>
              <dt>Checked</dt>
              <dd>
                <AnimatedNumber value={scan.reports.length} />
              </dd>
            </div>
          </dl>
        </section>

        {scan.error && (
          <p className="repos__error" role="alert">
            {scan.error}
          </p>
        )}

        <AnimatePresence>
          {broken.length > 1 && (
            <motion.div
              className="repos__fix-all"
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
            >
              <span>{plural(broken.length, "repository", "repositories")} would commit as the wrong person.</span>
              <button type="button" className="button button--primary button--small" onClick={() => void fixAll()}>
                Fix all
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="repos__list-wrap">
          {celebrations > 0 && <Burst burstKey={celebrations} count={20} radius={220} />}
          <ul className="repos__list">
            {sorted.map((report) => (
              <RepoRow
                key={report.path}
                report={report}
                profiles={snapshot.profiles}
                homeDirectory={homeDirectory}
                fixing={scan.fixing.has(report.path)}
                onFix={() => void fix(report)}
                onReveal={() => void api.revealInFileManager(report.path)}
              />
            ))}
          </ul>
          {scan.status === "done" && scan.reports.length === 0 && (
            <p className="repos__empty">No Git repositories in this folder.</p>
          )}
          {scan.status === "idle" && <p className="repos__empty">Pick a folder and press Scan.</p>}
        </div>
      </div>
    </motion.main>
  );
}

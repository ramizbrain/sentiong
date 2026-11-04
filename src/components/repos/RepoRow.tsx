import { AnimatePresence, motion } from "motion/react";

import { shortenPath } from "../../lib/format";
import { accentStyle } from "../../lib/profileColors";
import { explain, needsFix, STATUS_LABELS } from "../../lib/repoStatus";
import type { Profile, RepoReport } from "../../types/sentiong";
import { FolderIcon, WarningIcon } from "../common/Icons";
import { Spinner } from "../common/Spinner";
import { CheckDraw } from "../motion/CheckDraw";

interface RepoRowProps {
  report: RepoReport;
  profiles: Profile[];
  homeDirectory: string;
  fixing: boolean;
  onFix: () => void;
  onReveal: () => void;
}

const STATUS_TONE = { ok: "success", localOverride: "warning", wrongProfile: "danger", unmanaged: "muted" } as const;

export function RepoRow({ report, profiles, homeDirectory, fixing, onFix, onReveal }: RepoRowProps) {
  const profile = profiles.find((candidate) => candidate.id === report.effectiveProfileId);
  const tone = STATUS_TONE[report.status];

  return (
    <motion.li
      className="repo-row"
      data-tone={tone}
      layout
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
      style={profile ? accentStyle(profile.color) : undefined}
    >
      <span className="repo-row__marker" />
      <div className="repo-row__main">
        <div className="repo-row__title">
          <h3>{report.name}</h3>
          {report.owner && <span className="repo-row__owner">{report.owner}</span>}
          <AnimatePresence mode="wait">
            <motion.span
              key={report.status}
              className={`chip chip--${tone === "muted" ? "accent" : tone}`}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
            >
              {report.status === "ok" ? <CheckDraw size={12} /> : <WarningIcon size={12} />}
              <span>{STATUS_LABELS[report.status]}</span>
            </motion.span>
          </AnimatePresence>
          {report.guardBypassed && (
            <span className="chip" title="This repository sets its own core.hooksPath (Husky, Lefthook…), so the guard does not run here.">
              <span>Guard bypassed</span>
            </span>
          )}
        </div>
        <p className="repo-row__explain">{explain(report, profiles)}</p>
        <button type="button" className="repo-row__path mono" onClick={onReveal}>
          <FolderIcon size={12} />
          {shortenPath(report.path, homeDirectory)}
        </button>
      </div>
      <div className="repo-row__action">
        {needsFix(report) ? (
          <motion.button
            type="button"
            className="button button--small button--primary"
            onClick={onFix}
            disabled={fixing}
            whileTap={{ scale: 0.94 }}
          >
            {fixing && <Spinner size={12} />}
            Fix
          </motion.button>
        ) : (
          report.status === "ok" && <span className="repo-row__as">{profile?.label}</span>
        )}
      </div>
    </motion.li>
  );
}

import { motion } from "motion/react";

import { plural } from "../../lib/format";
import type { Environment, GhAccount } from "../../types/sentiong";
import { CheckDraw } from "../motion/CheckDraw";
import { WarningIcon } from "../common/Icons";

interface ToolChecklistProps {
  environment: Environment;
  accounts: GhAccount[];
}

interface Row {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

function rows(environment: Environment, accounts: GhAccount[]): Row[] {
  return [
    {
      name: "Git",
      ok: environment.git.found,
      detail: environment.git.version ? `version ${environment.git.version}` : "not found",
      fix: "Install Git from git-scm.com",
    },
    {
      name: "GitHub CLI",
      ok: environment.gh.found,
      detail: environment.gh.found
        ? accounts.length > 0
          ? `${plural(accounts.length, "account")}: ${accounts.map((account) => `@${account.login}`).join(", ")}`
          : "installed, no accounts yet"
        : "optional, needed for GitHub accounts and key upload",
      fix: "brew install gh · cli.github.com",
    },
    {
      name: "ssh-keygen",
      ok: environment.sshKeygen.found,
      detail: environment.sshKeygen.found ? "ready to create keys" : "not found",
      fix: "Install OpenSSH",
    },
  ];
}

/** What Sentiong found on this machine, each line checking itself off in turn. */
export function ToolChecklist({ environment, accounts }: ToolChecklistProps) {
  return (
    <ul className="tool-checklist">
      {rows(environment, accounts).map((row, index) => (
        <motion.li
          key={row.name}
          className="tool-checklist__row"
          data-ok={row.ok}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.9 + index * 0.15, type: "spring", stiffness: 140, damping: 18 }}
        >
          <span className="tool-checklist__status">
            {row.ok ? <CheckDraw size={20} delay={1 + index * 0.15} /> : <WarningIcon size={18} />}
          </span>
          <span className="tool-checklist__name">{row.name}</span>
          <span className="tool-checklist__detail">{row.ok ? row.detail : `${row.detail} · ${row.fix}`}</span>
        </motion.li>
      ))}
    </ul>
  );
}

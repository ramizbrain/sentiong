import { AnimatePresence, motion } from "motion/react";

import type { LoginState } from "../../hooks/loginReducer";
import type { SetupFailure, TaskStatus } from "../../hooks/useSetupRunner";
import type { SetupTask } from "../../lib/setupPlan";
import { Avatar } from "../common/Avatar";
import { WarningIcon } from "../common/Icons";
import { Spinner } from "../common/Spinner";
import { Burst } from "../motion/Burst";
import { CheckDraw } from "../motion/CheckDraw";
import { DeviceCodePanel } from "./DeviceCodePanel";

interface SetupProgressProps {
  label: string;
  login: string | null;
  tasks: SetupTask[];
  statuses: Record<string, TaskStatus>;
  failure: SetupFailure | null;
  finished: boolean;
  grant: LoginState;
  onRetry: () => void;
  onSkip: () => void;
  onGrant: () => void;
  onCancelGrant: () => void;
  onOpenUrl: (url: string) => void;
}

/** The checklist that plays while Sentiong sets a profile up, ending in a celebration. */
export function SetupProgress({
  label,
  login,
  tasks,
  statuses,
  failure,
  finished,
  grant,
  onRetry,
  onSkip,
  onGrant,
  onCancelGrant,
  onOpenUrl,
}: SetupProgressProps) {
  const needsPermission = failure?.code === "missingScope";
  const granting = grant.status === "starting" || grant.status === "waiting" || grant.status === "failed";
  const canSkip = failure?.taskId === "uploadAuthKey" || failure?.taskId === "uploadSigningKey";

  return (
    <div className="setup">
      <motion.div
        className="setup__avatar"
        animate={finished ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        <span className="setup__orbit" data-finished={finished} aria-hidden="true" />
        <Avatar login={login} label={label} size={84} />
        {finished && <Burst burstKey="done" count={18} radius={150} />}
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.h2
          key={finished ? "done" : "working"}
          className="setup__title"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
        >
          {finished ? `${label} is ready` : `Setting up ${label}…`}
        </motion.h2>
      </AnimatePresence>

      <ol className="setup__tasks">
        {tasks.map((task, index) => {
          const status = statuses[task.id] ?? "pending";
          return (
            <motion.li
              key={task.id}
              className="setup__task"
              data-status={status}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + index * 0.08, type: "spring", stiffness: 200, damping: 20 }}
            >
              <span className="setup__task-icon">
                {status === "done" && <CheckDraw size={22} />}
                {status === "running" && <Spinner size={18} />}
                {status === "failed" && <WarningIcon size={18} />}
                {status === "pending" && <span className="setup__task-dot" />}
              </span>
              <span>{task.title}</span>
              {status === "running" && <motion.span layoutId="setup-running" className="setup__task-glow" />}
            </motion.li>
          );
        })}
      </ol>

      <AnimatePresence>
        {failure && !granting && (
          <motion.div
            className="setup__failure"
            role="alert"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 3, 0] }}
            exit={{ opacity: 0 }}
          >
            <p>
              {needsPermission
                ? `GitHub needs your OK before Sentiong can add keys to @${login}. You'll approve it once in the browser.`
                : failure.message}
            </p>
            <div className="setup__failure-actions">
              {needsPermission ? (
                <button type="button" className="button button--primary button--small" onClick={onGrant}>
                  Grant permission
                </button>
              ) : (
                <button type="button" className="button button--primary button--small" onClick={onRetry}>
                  Try again
                </button>
              )}
              {canSkip && (
                <button type="button" className="button button--ghost button--small" onClick={onSkip}>
                  Skip, I'll add the key myself
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {granting && (
          <DeviceCodePanel
            state={grant}
            title={`Allow Sentiong to add keys to @${login}`}
            onOpen={onOpenUrl}
            onCancel={onCancelGrant}
            onRetry={onGrant}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

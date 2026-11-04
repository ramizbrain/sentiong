import { useCallback, useRef, useState } from "react";

import { errorCode, toErrorMessage } from "../lib/errors";
import type { ProfileDraft } from "../lib/profileDraft";
import { toProfileInput } from "../lib/profileDraft";
import type { SetupTask, SetupTaskId } from "../lib/setupPlan";
import { SETUP_TASK_MIN_MS } from "../lib/timing";
import { api } from "../services/sentiongApi";

export type TaskStatus = "pending" | "running" | "done" | "failed";

export interface SetupFailure {
  taskId: SetupTaskId;
  code: string | null;
  message: string;
}

export interface SetupJob {
  tasks: SetupTask[];
  draft: ProfileDraft;
  email: string;
  /** Set when editing an existing profile. */
  profileId: string | null;
  knownProfileIds: string[];
}

/** Values one task hands to the next (the new key's path, the saved profile's id). */
interface Context {
  keyPath: string | null;
  profileId: string | null;
}

const atLeast = <T,>(promise: Promise<T>, ms: number) =>
  Promise.all([promise, new Promise((resolve) => setTimeout(resolve, ms))]).then(([value]) => value);

/**
 * Runs a profile's setup tasks one by one. A failed task can be retried, and the run
 * picks up where it stopped (a key created before the failure is not created again).
 */
export function useSetupRunner() {
  const [statuses, setStatuses] = useState<Record<string, TaskStatus>>({});
  const [failure, setFailure] = useState<SetupFailure | null>(null);
  const [finished, setFinished] = useState(false);
  const context = useRef<Context>({ keyPath: null, profileId: null });

  const execute = useCallback(async (taskId: SetupTaskId, job: SetupJob) => {
    const { draft } = job;
    const ctx = context.current;
    const title = `Sentiong · ${draft.label.trim()}`;
    switch (taskId) {
      case "generateKey":
        ctx.keyPath = (await api.generateSshKey(draft.label, job.email)).privateKeyPath;
        return;
      case "uploadAuthKey":
        await api.uploadSshKey(draft.githubLogin!, ctx.keyPath!, "authentication", title);
        return;
      case "uploadSigningKey":
        await api.uploadSshKey(draft.githubLogin!, ctx.keyPath!, "signing", title);
        return;
      case "saveProfile": {
        const snapshot = await api.saveProfile(job.profileId, toProfileInput(draft, job.email, ctx.keyPath));
        ctx.profileId =
          job.profileId ?? snapshot.profiles.find((profile) => !job.knownProfileIds.includes(profile.id))?.id ?? null;
        return;
      }
      case "makeDefault":
        if (ctx.profileId) await api.activateProfile(ctx.profileId);
        return;
    }
  }, []);

  const runFrom = useCallback(
    async (job: SetupJob, startIndex: number) => {
      setFailure(null);
      for (const task of job.tasks.slice(startIndex)) {
        setStatuses((current) => ({ ...current, [task.id]: "running" }));
        try {
          await atLeast(execute(task.id, job), SETUP_TASK_MIN_MS);
          setStatuses((current) => ({ ...current, [task.id]: "done" }));
        } catch (error) {
          setStatuses((current) => ({ ...current, [task.id]: "failed" }));
          setFailure({ taskId: task.id, code: errorCode(error), message: toErrorMessage(error) });
          return false;
        }
      }
      setFinished(true);
      return true;
    },
    [execute],
  );

  const start = useCallback(
    (job: SetupJob) => {
      context.current = {
        keyPath: job.draft.keyChoice === "existing" ? job.draft.existingKeyPath : null,
        profileId: job.profileId,
      };
      setFinished(false);
      setStatuses(Object.fromEntries(job.tasks.map((task) => [task.id, "pending" as TaskStatus])));
      return runFrom(job, 0);
    },
    [runFrom],
  );

  /** Tries the failed task again, then continues. */
  const retry = useCallback(
    (job: SetupJob) => {
      const index = job.tasks.findIndex((task) => statuses[task.id] === "failed");
      return runFrom(job, Math.max(index, 0));
    },
    [runFrom, statuses],
  );

  /** Gives up on the failed task (for example an upload) and continues with the rest. */
  const skip = useCallback(
    (job: SetupJob) => {
      const index = job.tasks.findIndex((task) => statuses[task.id] === "failed");
      if (index < 0) return Promise.resolve(false);
      setStatuses((current) => ({ ...current, [job.tasks[index].id]: "done" }));
      return runFrom(job, index + 1);
    },
    [runFrom, statuses],
  );

  return { statuses, failure, finished, start, retry, skip };
}

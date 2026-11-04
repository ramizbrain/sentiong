import type { ProfileDraft } from "./profileDraft";

export type SetupTaskId = "generateKey" | "uploadAuthKey" | "uploadSigningKey" | "saveProfile" | "makeDefault";

export interface SetupTask {
  id: SetupTaskId;
  title: string;
}

/** The steps that turn a finished draft into a working profile, in order. */
export function planSetup(draft: ProfileDraft, alreadyDefault: boolean): SetupTask[] {
  const tasks: SetupTask[] = [];
  const hasKey = draft.keyChoice !== "none";
  const uploads = hasKey && draft.githubLogin !== null && draft.uploadKey;

  if (draft.keyChoice === "generate") tasks.push({ id: "generateKey", title: "Create a new SSH key" });
  if (uploads) tasks.push({ id: "uploadAuthKey", title: `Add the key to @${draft.githubLogin}` });
  if (uploads && draft.signing) tasks.push({ id: "uploadSigningKey", title: "Register it for signed commits" });
  tasks.push({ id: "saveProfile", title: "Write your Git config" });
  if (draft.makeDefault && !alreadyDefault) tasks.push({ id: "makeDefault", title: "Make it the default profile" });
  return tasks;
}

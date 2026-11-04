import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { useGithubLogin } from "../../hooks/useGithubLogin";
import type { SetupJob } from "../../hooks/useSetupRunner";
import { useSetupRunner } from "../../hooks/useSetupRunner";
import { toErrorMessage } from "../../lib/errors";
import type { ProfileDraft } from "../../lib/profileDraft";
import {
  draftFromProfile,
  newDraft,
  resolveEmail,
  stepProblem,
  WIZARD_STEPS,
  withGithubUser,
  withoutGithub,
} from "../../lib/profileDraft";
import { accentStyle } from "../../lib/profileColors";
import { planSetup } from "../../lib/setupPlan";
import { SETUP_CELEBRATION_MS } from "../../lib/timing";
import { api } from "../../services/sentiongApi";
import type { Environment, GhAccount, GithubUser, Profile, Snapshot, SshKey } from "../../types/sentiong";
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon } from "../common/Icons";
import { AccountStep } from "./AccountStep";
import { IdentityStep } from "./IdentityStep";
import { RulesStep } from "./RulesStep";
import { SecurityStep } from "./SecurityStep";
import { SetupProgress } from "./SetupProgress";
import { StepRail } from "./StepRail";

interface WizardOverlayProps {
  /** The profile being edited, or `null` to create one. */
  editing: Profile | null;
  snapshot: Snapshot;
  environment: Environment;
  accounts: GhAccount[];
  onRefreshAccounts: () => Promise<{ accounts: GhAccount[] }>;
  onClose: () => void;
  onDone: (message: string) => void;
}

const slide = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 48, filter: "blur(4px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -48,
    filter: "blur(4px)",
    transition: { duration: 0.16, ease: "easeIn" as const },
  }),
};

export function WizardOverlay({
  editing,
  snapshot,
  environment,
  accounts,
  onRefreshAccounts,
  onClose,
  onDone,
}: WizardOverlayProps) {
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    editing ? draftFromProfile(editing, snapshot.activeProfileId) : newDraft(snapshot.profiles),
  );
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [user, setUser] = useState<GithubUser | null>(null);
  const [loadingLogin, setLoadingLogin] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [job, setJob] = useState<SetupJob | null>(null);
  // Choosing "no GitHub account" is explicit, so an untouched account step asks first.
  const [gitOnly, setGitOnly] = useState(editing !== null && editing.githubLogin === null);

  const login = useGithubLogin();
  const grant = useGithubLogin();
  const runner = useSetupRunner();

  const patch = useCallback((changes: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setProblem(null);
  }, []);

  const selectAccount = useCallback(async (loginName: string) => {
    setLoadingLogin(loginName);
    try {
      const found = await api.getGithubUser(loginName);
      setUser(found);
      setGitOnly(false);
      setDraft((current) => withGithubUser(current, found));
      setProblem(null);
    } catch (error) {
      setProblem(toErrorMessage(error));
    } finally {
      setLoadingLogin(null);
    }
  }, []);

  // Editing a profile with an account: load it for the email and owner suggestions.
  useEffect(() => {
    if (editing?.githubLogin) {
      api.getGithubUser(editing.githubLogin).then(setUser, () => undefined);
    }
  }, [editing]);

  useEffect(() => {
    api.listSshKeys().then(setKeys, () => setKeys([]));
  }, []);

  // Esc closes the wizard, except while the setup is writing files.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !job) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [job, onClose]);

  const connectNew = async () => {
    setProblem(null);
    const connected = await login.start({ kind: "newAccount" });
    if (!connected) return;
    await onRefreshAccounts();
    login.reset();
    await selectAccount(connected);
  };

  const goTo = (index: number) => {
    setDirection(index > step ? 1 : -1);
    setStep(index);
    setProblem(null);
  };

  const next = () => {
    const current = WIZARD_STEPS[step];
    const found =
      current === "account" && draft.githubLogin === null && !gitOnly
        ? "Pick an account, or choose to go without GitHub."
        : stepProblem(current, draft, user);
    if (found) {
      setProblem(found);
      return;
    }
    if (step < WIZARD_STEPS.length - 1) {
      goTo(step + 1);
      return;
    }
    const setup: SetupJob = {
      tasks: planSetup(draft, editing !== null && editing.id === snapshot.activeProfileId),
      draft,
      email: resolveEmail(draft, user),
      profileId: editing?.id ?? null,
      knownProfileIds: snapshot.profiles.map((profile) => profile.id),
    };
    setJob(setup);
    void runner.start(setup);
  };

  useEffect(() => {
    if (!runner.finished) return;
    const timer = setTimeout(
      () => onDone(editing ? `${draft.label} updated` : `${draft.label} is ready to use`),
      SETUP_CELEBRATION_MS,
    );
    return () => clearTimeout(timer);
  }, [runner.finished, onDone, editing, draft.label]);

  const grantPermission = async () => {
    if (!job || !draft.githubLogin) return;
    const granted = await grant.start({ kind: "grantKeyPermissions", login: draft.githubLogin });
    if (!granted) return;
    grant.reset();
    await onRefreshAccounts();
    await runner.retry(job);
  };

  const pickFolder = async () => {
    const folder = await api.pickFolder(draft.folders[0] ?? environment.homeDirectory);
    if (folder && !draft.folders.includes(folder)) patch({ folders: [...draft.folders, folder] });
  };

  const usedBy = Object.fromEntries(
    snapshot.profiles
      .filter((profile) => profile.githubLogin && profile.id !== editing?.id)
      .map((profile) => [profile.githubLogin!, profile.label]),
  );

  const currentStep = WIZARD_STEPS[step];
  const isLast = step === WIZARD_STEPS.length - 1;

  return (
    <motion.div
      className="wizard-overlay"
      data-tauri-drag-region
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      <motion.div
        className="wizard panel"
        style={accentStyle(draft.color)}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Edit ${editing.label}` : "New profile"}
        initial={{ opacity: 0, y: 40, scale: 0.95, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: 30, scale: 0.96, filter: "blur(8px)" }}
        transition={{ type: "spring", stiffness: 160, damping: 22 }}
      >
        <div className="wizard__glow" aria-hidden="true" />
        <header className="wizard__header">
          <p className="wizard__kicker">{editing ? `Edit ${editing.label}` : "New profile"}</p>
          {job ? <span /> : <StepRail current={step} onJump={goTo} />}
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose} disabled={job !== null && !runner.failure}>
            <CloseIcon />
          </button>
        </header>

        <div className="wizard__body">
          {job ? (
            <SetupProgress
              label={draft.label}
              login={draft.githubLogin}
              tasks={job.tasks}
              statuses={runner.statuses}
              failure={runner.failure}
              finished={runner.finished}
              grant={grant.state}
              onRetry={() => void runner.retry(job)}
              onSkip={() => void runner.skip(job)}
              onGrant={() => void grantPermission()}
              onCancelGrant={grant.cancel}
              onOpenUrl={(url) => void api.openUrl(url)}
            />
          ) : (
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={currentStep}
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
              >
                {currentStep === "account" && (
                  <AccountStep
                    ghFound={environment.gh.found}
                    accounts={accounts}
                    selectedLogin={draft.githubLogin}
                    loadingLogin={loadingLogin}
                    usedBy={usedBy}
                    login={login.state}
                    onSelect={(loginName) => void selectAccount(loginName)}
                    gitOnly={gitOnly}
                    onGitOnly={() => {
                      setUser(null);
                      setGitOnly(true);
                      setProblem(null);
                      setDraft((current) => withoutGithub(current));
                    }}
                    onConnectNew={() => void connectNew()}
                    onCancelLogin={login.cancel}
                    onOpenUrl={(url) => void api.openUrl(url)}
                  />
                )}
                {currentStep === "identity" && <IdentityStep draft={draft} user={user} onChange={patch} />}
                {currentStep === "rules" && (
                  <RulesStep
                    draft={draft}
                    user={user}
                    homeDirectory={environment.homeDirectory}
                    ownerRulesSupported={environment.supportsOwnerRules}
                    canBeDefault={!(editing && editing.id === snapshot.activeProfileId)}
                    onChange={patch}
                    onPickFolder={() => void pickFolder()}
                  />
                )}
                {currentStep === "security" && (
                  <SecurityStep draft={draft} keys={keys} canGenerate={environment.sshKeygen.found} onChange={patch} />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {!job && (
          <footer className="wizard__footer">
            <AnimatePresence>
              {problem && (
                <motion.p
                  className="wizard__problem"
                  role="alert"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 3, 0] }}
                  exit={{ opacity: 0 }}
                >
                  {problem}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="wizard__nav">
              {step > 0 && (
                <button type="button" className="button button--ghost" onClick={() => goTo(step - 1)}>
                  <ArrowLeftIcon />
                  Back
                </button>
              )}
              <motion.button
                type="button"
                className="button button--primary"
                onClick={next}
                disabled={loadingLogin !== null}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
              >
                {isLast ? (editing ? "Save changes" : "Create profile") : "Continue"}
                <ArrowRightIcon />
              </motion.button>
            </div>
          </footer>
        )}
      </motion.div>
    </motion.div>
  );
}

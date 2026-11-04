import { AnimatePresence, MotionConfig } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "./components/brand/BrandMark";
import { Toasts } from "./components/common/Toasts";
import { DashboardScreen } from "./components/dashboard/DashboardScreen";
import type { BackdropMood } from "./components/motion/Backdrop";
import { Backdrop } from "./components/motion/Backdrop";
import { OnboardingScreen } from "./components/onboarding/OnboardingScreen";
import { RepoCheckScreen } from "./components/repos/RepoCheckScreen";
import { WizardOverlay } from "./components/wizard/WizardOverlay";
import { useEnvironment } from "./hooks/useEnvironment";
import { useSnapshot } from "./hooks/useSnapshot";
import { useToasts } from "./hooks/useToasts";
import { toErrorMessage } from "./lib/errors";
import { PROFILE_COLORS } from "./lib/profileColors";
import { api } from "./services/sentiongApi";
import type { Profile, Snapshot } from "./types/sentiong";

type View = "dashboard" | "repos";

/** How long the world glows brighter after switching profiles. */
const CELEBRATE_MS = 1400;

export default function App() {
  const { snapshot, loadError, apply } = useSnapshot();
  const { environment, accounts, refresh } = useEnvironment();
  const { toasts, show, dismiss } = useToasts();
  const [view, setView] = useState<View>("dashboard");
  const [wizard, setWizard] = useState<{ editing: Profile | null } | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchCount, setSwitchCount] = useState(0);
  const [celebrating, setCelebrating] = useState(false);

  // Celebrate every change of default profile, wherever it came from (app or tray).
  const activeId = snapshot?.activeProfileId ?? null;
  const previousActive = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (snapshot === null) return;
    if (previousActive.current !== undefined && previousActive.current !== activeId && activeId !== null) {
      setSwitchCount((count) => count + 1);
      setCelebrating(true);
      const timer = setTimeout(() => setCelebrating(false), CELEBRATE_MS);
      previousActive.current = activeId;
      return () => clearTimeout(timer);
    }
    previousActive.current = activeId;
  }, [activeId, snapshot]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void api.onTrayError((message) => show("error", message)).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [show]);

  const run = useCallback(
    async (change: () => Promise<Snapshot>, success?: string) => {
      try {
        await apply(change);
        if (success) show("success", success);
      } catch (error) {
        show("error", toErrorMessage(error));
      }
    },
    [apply, show],
  );

  const activate = async (profile: Profile) => {
    setSwitchingId(profile.id);
    await run(() => api.activateProfile(profile.id), `Now committing as ${profile.label}`);
    setSwitchingId(null);
  };

  const closeWizard = useCallback(() => setWizard(null), []);
  const finishWizard = useCallback(
    (message: string) => {
      setWizard(null);
      show("success", message);
    },
    [show],
  );

  const active = snapshot?.profiles.find((profile) => profile.id === activeId);
  const world = PROFILE_COLORS[active?.color ?? "iris"];
  const ready = snapshot !== null && environment !== null;
  const mood: BackdropMood = celebrating ? "celebrate" : wizard ? "focus" : "calm";

  return (
    // Users who ask their OS for reduced motion get fades instead of movement.
    <MotionConfig reducedMotion="user">
      <div className="app" style={{ ["--world" as string]: world.accent, ["--world-rgb" as string]: world.rgb }}>
        <Backdrop mood={mood} />

        <AnimatePresence mode="wait">
          {loadError ? (
            <main key="error" className="screen splash">
              <div className="titlebar" data-tauri-drag-region />
              <BrandMark size={56} />
              <p className="splash__error" role="alert">
                {loadError}
              </p>
            </main>
          ) : !ready ? (
            <main key="loading" className="screen splash" aria-busy="true">
              <div className="titlebar" data-tauri-drag-region />
              <BrandMark size={64} animated />
            </main>
          ) : snapshot.profiles.length === 0 ? (
            <OnboardingScreen
              key="onboarding"
              environment={environment}
              accounts={accounts}
              onStart={() => setWizard({ editing: null })}
              onRefresh={() => void refresh()}
            />
          ) : view === "repos" ? (
            <RepoCheckScreen
              key="repos"
              snapshot={snapshot}
              homeDirectory={environment.homeDirectory}
              onBack={() => setView("dashboard")}
              onMessage={show}
            />
          ) : (
            <DashboardScreen
              key="dashboard"
              snapshot={snapshot}
              switchingId={switchingId}
              switchCount={switchCount}
              ownerRulesSupported={environment.supportsOwnerRules}
              onNewProfile={() => setWizard({ editing: null })}
              onEditProfile={(profile) => setWizard({ editing: profile })}
              onDeleteProfile={(profile) => void run(() => api.deleteProfile(profile.id), `${profile.label} deleted`)}
              onActivate={(profile) => void activate(profile)}
              onToggleGuard={(enabled) =>
                void run(() => api.setGuardEnabled(enabled), enabled ? "Guard is on" : "Guard is off")
              }
              onToggleConnected={(connected) =>
                void run(() => api.setConnected(connected), connected ? "Reconnected to Git" : "Disconnected from Git")
              }
              onOpenRepos={() => setView("repos")}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {wizard && snapshot && environment && (
            <WizardOverlay
              key="wizard"
              editing={wizard.editing}
              snapshot={snapshot}
              environment={environment}
              accounts={accounts}
              onRefreshAccounts={refresh}
              onClose={closeWizard}
              onDone={finishWizard}
            />
          )}
        </AnimatePresence>

        <Toasts toasts={toasts} onDismiss={dismiss} />
      </div>
    </MotionConfig>
  );
}

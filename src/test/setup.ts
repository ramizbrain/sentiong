import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach } from "vitest";

// Tests check behaviour, not motion: finish every animation instantly.
MotionGlobalConfig.skipAnimations = true;

// Without Vitest globals, Testing Library can't register its own cleanup.
afterEach(cleanup);

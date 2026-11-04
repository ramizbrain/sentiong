import type { BackendError } from "../types/sentiong";

export function isBackendError(error: unknown): error is BackendError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as BackendError).code === "string" &&
    typeof (error as BackendError).message === "string"
  );
}

/** A readable message from anything a backend call can reject with. */
export function toErrorMessage(error: unknown): string {
  if (isBackendError(error)) return error.message;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

/** The backend's error code (like `"missingScope"`), or `null`. */
export function errorCode(error: unknown): string | null {
  return isBackendError(error) ? error.code : null;
}

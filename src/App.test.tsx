import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SentiongBackend } from "./services/backend";
import { snapshot } from "./test/fixtures";
import { fakeBackend } from "./test/fakeBackend";

const backend = vi.hoisted(() => ({ current: null as SentiongBackend | null }));

vi.mock("./services/sentiongApi", () => ({
  get api() {
    return backend.current;
  },
  isDemo: false,
}));

import App from "./App";

describe("App", () => {
  beforeEach(() => {
    backend.current = fakeBackend();
  });

  it("welcomes a new user and opens the profile wizard", async () => {
    backend.current = fakeBackend(snapshot({ profiles: [], activeProfileId: null }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Create your first profile" }));

    expect(await screen.findByRole("dialog", { name: "New profile" })).toBeInTheDocument();
    expect(screen.getByText("@octo")).toBeInTheDocument();
  });

  it("shows the default profile and switches to another one", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Personal", level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Make default" }));

    await waitFor(() => expect(backend.current!.activateProfile).toHaveBeenCalledWith("work"));
    expect(await screen.findByRole("heading", { name: "Work", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("Now committing as Work")).toBeInTheDocument();
  });

  it("asks before deleting a profile", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Delete Work" }));
    expect(backend.current!.deleteProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(backend.current!.deleteProfile).toHaveBeenCalledWith("work"));
  });

  it("shows backend errors instead of failing silently", async () => {
    backend.current!.setGuardEnabled = vi.fn(async () => Promise.reject({ code: "guardConflict", message: "hooksPath taken" }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("switch", { name: "Wrong-account guard" }));

    expect(await screen.findByText("hooksPath taken")).toBeInTheDocument();
  });

  it("creates a Git-only profile through the wizard", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Add a profile/ }));
    const wizard = await screen.findByRole("dialog", { name: "New profile" });

    await user.click(within(wizard).getByRole("button", { name: "Continue" }));
    expect(await within(wizard).findByRole("alert")).toHaveTextContent("Pick an account, or choose to go without GitHub.");

    await user.click(within(wizard).getByRole("button", { name: /No GitHub account/ }));
    await user.click(within(wizard).getByRole("button", { name: "Continue" }));

    await user.type(await within(wizard).findByPlaceholderText("Your Name"), "Octo Cat");
    await user.type(within(wizard).getByPlaceholderText("you@company.com"), "octo@school.example");
    await user.click(within(wizard).getByRole("button", { name: "Continue" }));
    await user.click(await within(wizard).findByRole("button", { name: "Continue" }));
    await user.click(await within(wizard).findByRole("button", { name: /No SSH key/ }));
    await user.click(within(wizard).getByRole("button", { name: "Create profile" }));

    await waitFor(() =>
      expect(backend.current!.saveProfile).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          label: "Freelance",
          githubLogin: null,
          gitName: "Octo Cat",
          gitEmail: "octo@school.example",
          sshKeyPath: null,
          signing: false,
        }),
      ),
    );
    expect(backend.current!.generateSshKey).not.toHaveBeenCalled();
  });
});

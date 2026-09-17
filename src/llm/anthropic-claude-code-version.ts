import {
  deferAnthropicClaudeCodeIdentityUntil,
  setAnthropicClaudeCodeVersion,
} from "@openclaw/ai/providers";
import { runCommandWithTimeout } from "../process/exec.js";

/**
 * Report the installed Claude Code's version on the Anthropic OAuth path.
 *
 * The subscription path presents itself as Claude Code, and Anthropic gates
 * its newest models on the version it sees: with the pinned fallback a
 * Fable 5.1 request is refused ("version 2.1.251 or newer is required")
 * while the same login works through the Claude Code that is installed
 * beside OpenClaw. So, once per process, ask that install what it is and
 * report it — only when it is newer than the pinned version, and never a
 * number the machine did not print itself. Best effort: no Claude Code, a
 * slow one, or one that prints something unexpected leaves the fallback.
 */

const CANDIDATE_COMMANDS = ["claude", "claude-code"] as const;
const PROBE_TIMEOUT_MS = 3_000;
const PROBE_MAX_OUTPUT_BYTES = 16 * 1024;

export type ClaudeCodeVersionProbe = (command: string) => Promise<string | null>;

// The shared command runner owns the launcher rules a bare spawn does not have:
// npm installs Claude Code as a `claude.cmd` shim, which only its trusted
// cmd.exe wrapping can start, and it also hides the console window.
const defaultProbe: ClaudeCodeVersionProbe = async (command) => {
  try {
    const result = await runCommandWithTimeout([command, "--version"], {
      timeoutMs: PROBE_TIMEOUT_MS,
      maxOutputBytes: PROBE_MAX_OUTPUT_BYTES,
      outputCapture: "head",
    });
    if (result.code !== 0) {
      return null;
    }
    return result.stdout.trim().split(/\r?\n/u)[0] ?? null;
  } catch {
    // A missing or failing install rejects here; the probe is best effort and
    // never fails startup.
    return null;
  }
};

/** The version string Claude Code prints: `2.1.273 (Claude Code)` → `2.1.273`. */
export function parseClaudeCodeVersionOutput(output: string | null | undefined): string | null {
  const first = (output ?? "").trim().split(/\s+/u)[0] ?? "";
  return /^\d+\.\d+\.\d+$/u.test(first) ? first : null;
}

let adoption: Promise<string | null> | null = null;

/**
 * Resolves with the adopted version, or null when nothing newer was found.
 * Concurrent and repeat callers share one probe.
 *
 * The probe is registered as identity startup work in `@openclaw/ai`, so every
 * OAuth request built while it is still running waits for it (bounded) before
 * it reads the version — the user-agent header and the billing block of one
 * request are always the same number, and the first request of a fresh
 * process never reports the pinned fallback while a newer install is still
 * being detected.
 */
export function adoptInstalledClaudeCodeVersion(params?: {
  probe?: ClaudeCodeVersionProbe;
}): Promise<string | null> {
  if (!adoption) {
    const probe = params?.probe ?? defaultProbe;
    adoption = (async () => {
      for (const command of CANDIDATE_COMMANDS) {
        const output = await probe(command).catch(() => null);
        const version = parseClaudeCodeVersionOutput(output);
        if (!version) {
          continue;
        }
        return setAnthropicClaudeCodeVersion(version) ? version : null;
      }
      return null;
    })();
    deferAnthropicClaudeCodeIdentityUntil(adoption);
  }
  return adoption;
}

/** Test seam. */
export function resetInstalledClaudeCodeVersionAdoptionForTests(): void {
  adoption = null;
}

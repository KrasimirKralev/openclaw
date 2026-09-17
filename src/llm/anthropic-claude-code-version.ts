import { execFile } from "node:child_process";
import { setAnthropicClaudeCodeVersion } from "@openclaw/ai/providers";

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

export type ClaudeCodeVersionProbe = (command: string) => Promise<string | null>;

const defaultProbe: ClaudeCodeVersionProbe = (command) =>
  new Promise((resolve) => {
    execFile(
      command,
      ["--version"],
      { encoding: "utf8", timeout: PROBE_TIMEOUT_MS, maxBuffer: 16 * 1024, windowsHide: true },
      (error, stdout) => {
        resolve(error ? null : ((stdout ?? "").trim().split(/\r?\n/u)[0] ?? null));
      },
    );
  });

/** The version string Claude Code prints: `2.1.273 (Claude Code)` → `2.1.273`. */
export function parseClaudeCodeVersionOutput(output: string | null | undefined): string | null {
  const first = (output ?? "").trim().split(/\s+/u)[0] ?? "";
  return /^\d+\.\d+\.\d+$/u.test(first) ? first : null;
}

let adoption: Promise<string | null> | null = null;

/**
 * Resolves with the adopted version, or null when nothing newer was found.
 * Concurrent and repeat callers share one probe.
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
  }
  return adoption;
}

/** Test seam. */
export function resetInstalledClaudeCodeVersionAdoptionForTests(): void {
  adoption = null;
}

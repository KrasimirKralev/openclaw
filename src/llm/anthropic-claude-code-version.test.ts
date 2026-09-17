import {
  ANTHROPIC_CLAUDE_CODE_VERSION,
  getAnthropicClaudeCodeVersion,
  resetAnthropicClaudeCodeVersionForTests,
  setAnthropicClaudeCodeVersion,
} from "@openclaw/ai/providers";
import { afterEach, describe, expect, it } from "vitest";
import {
  adoptInstalledClaudeCodeVersion,
  parseClaudeCodeVersionOutput,
  resetInstalledClaudeCodeVersionAdoptionForTests,
} from "./anthropic-claude-code-version.js";

afterEach(() => {
  resetAnthropicClaudeCodeVersionForTests();
  resetInstalledClaudeCodeVersionAdoptionForTests();
});

describe("setAnthropicClaudeCodeVersion", () => {
  it("adopts a newer version and reports it", () => {
    expect(setAnthropicClaudeCodeVersion("2.1.273")).toBe(true);
    expect(getAnthropicClaudeCodeVersion()).toBe("2.1.273");
  });

  it("never adopts an older, equal or malformed version", () => {
    expect(setAnthropicClaudeCodeVersion("2.1.10")).toBe(false);
    expect(setAnthropicClaudeCodeVersion(ANTHROPIC_CLAUDE_CODE_VERSION)).toBe(false);
    expect(setAnthropicClaudeCodeVersion("latest")).toBe(false);
    expect(setAnthropicClaudeCodeVersion("")).toBe(false);
    expect(getAnthropicClaudeCodeVersion()).toBe(ANTHROPIC_CLAUDE_CODE_VERSION);
  });

  it("keeps the newest it has seen", () => {
    setAnthropicClaudeCodeVersion("2.1.300");
    expect(setAnthropicClaudeCodeVersion("2.1.273")).toBe(false);
    expect(getAnthropicClaudeCodeVersion()).toBe("2.1.300");
  });
});

describe("parseClaudeCodeVersionOutput", () => {
  it("reads the version off what the CLI prints", () => {
    expect(parseClaudeCodeVersionOutput("2.1.273 (Claude Code)")).toBe("2.1.273");
    expect(parseClaudeCodeVersionOutput("  2.1.74\n")).toBe("2.1.74");
    expect(parseClaudeCodeVersionOutput("Claude Code 2.1.273")).toBeNull();
    expect(parseClaudeCodeVersionOutput("")).toBeNull();
    expect(parseClaudeCodeVersionOutput(null)).toBeNull();
  });
});

describe("adoptInstalledClaudeCodeVersion", () => {
  it("reports the installed version when it is newer than the pinned one", async () => {
    const adopted = await adoptInstalledClaudeCodeVersion({
      probe: async (command) => (command === "claude" ? "2.1.273 (Claude Code)" : null),
    });
    expect(adopted).toBe("2.1.273");
    expect(getAnthropicClaudeCodeVersion()).toBe("2.1.273");
  });

  it("leaves the pinned version when nothing is installed, or what is installed is older", async () => {
    expect(await adoptInstalledClaudeCodeVersion({ probe: async () => null })).toBeNull();
    expect(getAnthropicClaudeCodeVersion()).toBe(ANTHROPIC_CLAUDE_CODE_VERSION);
    resetInstalledClaudeCodeVersionAdoptionForTests();
    expect(
      await adoptInstalledClaudeCodeVersion({ probe: async () => "2.0.1 (Claude Code)" }),
    ).toBeNull();
    expect(getAnthropicClaudeCodeVersion()).toBe(ANTHROPIC_CLAUDE_CODE_VERSION);
  });

  it("falls through to the next command name and survives a probe that throws", async () => {
    const adopted = await adoptInstalledClaudeCodeVersion({
      probe: async (command) => {
        if (command === "claude") {
          throw new Error("ENOENT");
        }
        return "2.1.260";
      },
    });
    expect(adopted).toBe("2.1.260");
  });

  it("probes once per process", async () => {
    let calls = 0;
    const probe = async () => {
      calls += 1;
      return "2.1.273";
    };
    await Promise.all([
      adoptInstalledClaudeCodeVersion({ probe }),
      adoptInstalledClaudeCodeVersion({ probe }),
    ]);
    await adoptInstalledClaudeCodeVersion({ probe });
    expect(calls).toBe(1);
  });
});

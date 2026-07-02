// Characterizes semver parse/precedence rules used by update and plugin version ordering.
import { describe, expect, it } from "vitest";
import {
  compareComparableSemver,
  comparePrereleaseIdentifiers,
  normalizeLegacyDotBetaVersion,
  parseComparableSemver,
} from "./semver-compare.js";

function compareVersions(a: string, b: string): number | null {
  return compareComparableSemver(
    parseComparableSemver(a, { normalizeLegacyDotBeta: true }),
    parseComparableSemver(b, { normalizeLegacyDotBeta: true }),
  );
}

describe("normalizeLegacyDotBetaVersion", () => {
  it.each([
    ["1.2.3.beta.2", "1.2.3-beta.2"],
    ["1.2.3.beta", "1.2.3-beta"],
    ["v2026.6.5.beta.1", "v2026.6.5-beta.1"],
    ["  1.2.3.beta.2  ", "1.2.3-beta.2"],
  ])("rewrites legacy dot-beta tag %s to %s", (input, expected) => {
    expect(normalizeLegacyDotBetaVersion(input)).toBe(expected);
  });

  it.each([
    ["1.2.3", "1.2.3"],
    ["1.2.3-beta.2", "1.2.3-beta.2"],
    ["1.2.3.alpha.1", "1.2.3.alpha.1"],
    ["  1.2.3  ", "1.2.3"],
  ])("passes %s through unchanged apart from trimming", (input, expected) => {
    expect(normalizeLegacyDotBetaVersion(input)).toBe(expected);
  });
});

describe("parseComparableSemver", () => {
  it("parses release versions with an optional v prefix", () => {
    expect(parseComparableSemver("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
    expect(parseComparableSemver("v10.20.30")).toEqual({
      major: 10,
      minor: 20,
      patch: 30,
      prerelease: null,
    });
  });

  it("splits prerelease identifiers and drops build metadata", () => {
    expect(parseComparableSemver("1.2.3-rc.1+build.99")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ["rc", "1"],
    });
    expect(parseComparableSemver("1.2.3+build.99")?.prerelease).toBeNull();
  });

  it.each([[null], [undefined], [""], ["1.2"], ["1.2.3.4"], ["not-a-version"]])(
    "returns null for unparseable input %s",
    (input) => {
      expect(parseComparableSemver(input)).toBeNull();
    },
  );

  it("parses legacy dot-beta tags only when normalizeLegacyDotBeta is set", () => {
    expect(parseComparableSemver("2026.6.5.beta.2")).toBeNull();
    expect(parseComparableSemver("2026.6.5.beta.2", { normalizeLegacyDotBeta: true })).toEqual({
      major: 2026,
      minor: 6,
      patch: 5,
      prerelease: ["beta", "2"],
    });
  });
});

describe("comparePrereleaseIdentifiers", () => {
  it("ranks a stable release above any prerelease", () => {
    expect(comparePrereleaseIdentifiers(null, ["alpha"])).toBe(1);
    expect(comparePrereleaseIdentifiers(["alpha"], null)).toBe(-1);
    expect(comparePrereleaseIdentifiers(null, null)).toBe(0);
    expect(comparePrereleaseIdentifiers([], [])).toBe(0);
  });

  it("compares numeric identifiers numerically, not lexically", () => {
    expect(comparePrereleaseIdentifiers(["2"], ["10"])).toBe(-1);
    expect(comparePrereleaseIdentifiers(["beta", "11"], ["beta", "2"])).toBe(1);
  });

  it("ranks numeric identifiers below alphanumeric ones", () => {
    expect(comparePrereleaseIdentifiers(["1"], ["alpha"])).toBe(-1);
    expect(comparePrereleaseIdentifiers(["alpha"], ["1"])).toBe(1);
  });

  it("compares alphanumeric identifiers in ASCII order", () => {
    expect(comparePrereleaseIdentifiers(["alpha"], ["beta"])).toBe(-1);
    expect(comparePrereleaseIdentifiers(["beta"], ["alpha"])).toBe(1);
  });

  it("ranks a shorter identifier set below one it prefixes", () => {
    expect(comparePrereleaseIdentifiers(["alpha"], ["alpha", "1"])).toBe(-1);
    expect(comparePrereleaseIdentifiers(["alpha", "1"], ["alpha"])).toBe(1);
  });
});

describe("compareComparableSemver", () => {
  it("returns null when either side is unparseable", () => {
    expect(compareVersions("nonsense", "1.2.3")).toBeNull();
    expect(compareVersions("1.2.3", "nonsense")).toBeNull();
  });

  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.3.0", "1.2.9")).toBe(1);
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("ignores build metadata when comparing", () => {
    expect(compareVersions("1.2.3+linux", "1.2.3+darwin")).toBe(0);
  });

  it("follows the semver.org precedence chain for prereleases", () => {
    const ascending = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];
    for (let i = 1; i < ascending.length; i += 1) {
      const lower = ascending[i - 1];
      const higher = ascending[i];
      expect(compareVersions(lower, higher), `${lower} < ${higher}`).toBe(-1);
      expect(compareVersions(higher, lower), `${higher} > ${lower}`).toBe(1);
    }
  });

  it("orders legacy dot-beta release-train tags below their stable release", () => {
    expect(compareVersions("2026.6.5.beta.2", "2026.6.5")).toBe(-1);
    expect(compareVersions("2026.6.5.beta.2", "2026.6.5-beta.11")).toBe(-1);
    expect(compareVersions("2026.6.5.beta.2", "2026.6.4")).toBe(1);
  });
});

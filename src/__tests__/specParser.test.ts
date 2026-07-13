import { describe, expect, it } from "vitest";
import { FbdlSpecParseError, parseFbdlReference } from "../specParser.js";
import { FIXTURE_JSON } from "./fixtures/loadFixtureSpec.js";

describe("specParser", () => {
  it("parses entities and actions from a real API response", () => {
    const { entities, actions } = parseFbdlReference(FIXTURE_JSON);
    expect(entities.length).toBeGreaterThan(0);
    expect(actions.length).toBeGreaterThan(0);
  });

  it("filters out helper test-user setup entries", () => {
    const { entities } = parseFbdlReference(FIXTURE_JSON);
    const names = new Set(entities.map((e) => e.type));
    expect(names.has("OculusThirdPartyTestDeveloper")).toBe(false);
    expect(names.has("WhitehatTestUser")).toBe(false);
    expect(names.has("WearablesTestDeveloper")).toBe(false);
  });

  it("preserves API order for the standard setup entities", () => {
    const { entities } = parseFbdlReference(FIXTURE_JSON);
    expect(entities.map((e) => e.type)).toEqual([
      "User",
      "Page",
      "Group",
      "Album",
      "Friendship",
      "Business",
      "App",
      "Event",
    ]);
  });

  it("derives hasLabel from the presence of data[]", () => {
    const { entities } = parseFbdlReference(FIXTURE_JSON);
    const friendship = entities.find((e) => e.type === "Friendship");
    expect(friendship?.hasLabel).toBe(false);
    const page = entities.find((e) => e.type === "Page");
    expect(page?.hasLabel).toBe(true);
  });

  it("derives required from !optional", () => {
    const { entities } = parseFbdlReference(FIXTURE_JSON);
    const group = entities.find((e) => e.type === "Group");
    const owner = group?.params.find((p) => p.name === "owner");
    expect(owner?.required).toBe(true);
    const members = group?.params.find((p) => p.name === "members");
    expect(members?.required).toBe(false);
  });

  it("derives values from values_json (object values, API order preserved)", () => {
    const { entities } = parseFbdlReference(FIXTURE_JSON);
    const group = entities.find((e) => e.type === "Group");
    const privacy = group?.params.find((p) => p.name === "privacy");
    expect(privacy?.values).toEqual(["public", "private", "public_legacy"]);
  });

  it("synthesizes ['false', 'true'] for bool params with no values_json", () => {
    const { entities } = parseFbdlReference(FIXTURE_JSON);
    const biz = entities.find((e) => e.type === "Business");
    const quarantine = biz?.params.find((p) => p.name === "quarantine");
    expect(quarantine?.values).toEqual(["false", "true"]);
  });

  it("flags vec<...> params as isList", () => {
    const { entities } = parseFbdlReference(FIXTURE_JSON);
    const group = entities.find((e) => e.type === "Group");
    const members = group?.params.find((p) => p.name === "members");
    expect(members?.isList).toBe(true);
  });

  it("derives supportsVoiceSwitcher from target_types containing PAGE", () => {
    const { actions } = parseFbdlReference(FIXTURE_JSON);
    const block = actions.find((a) => a.name === "block");
    expect(block?.supportsVoiceSwitcher).toBe(true);
    const friendUser = actions.find((a) => a.name === "friend_user");
    expect(friendUser?.supportsVoiceSwitcher).toBe(false);
  });

  it("extracts signature and at least one example from action info", () => {
    const { actions } = parseFbdlReference(FIXTURE_JSON);
    const makePostText = actions.find((a) => a.name === "make_post_text");
    expect(makePostText?.signature).toContain("make_post_text");
    expect(makePostText?.examples.length).toBeGreaterThanOrEqual(1);
    expect(makePostText?.examples[0]).toContain("make_post_text");
  });

  it("flattens multi-line setup examples to a single line", () => {
    const { entities } = parseFbdlReference(FIXTURE_JSON);
    const page = entities.find((e) => e.type === "Page");
    expect(page?.example).not.toContain("\n");
    expect(page?.example).toMatch(/^\[setup\]/);
  });

  it("rejects non-object input", () => {
    expect(() => parseFbdlReference(null)).toThrow(FbdlSpecParseError);
    expect(() => parseFbdlReference("string")).toThrow(FbdlSpecParseError);
  });

  it("rejects missing hints", () => {
    expect(() => parseFbdlReference({})).toThrow(/hints/);
  });

  it("rejects malformed hints.setup", () => {
    expect(() => parseFbdlReference({ hints: { setup: "nope", action: [] } })).toThrow(/arrays/);
  });
});

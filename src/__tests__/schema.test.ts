import { beforeAll, describe, expect, it } from "vitest";
import { getAction, getActions, getSetupEntities, getSetupEntity } from "../spec.js";
import { installFixtureSpec } from "./fixtures/loadFixtureSpec.js";

beforeAll(() => {
  installFixtureSpec();
});

describe("spec: setup entities", () => {
  it("has all 8 entity types in API order", () => {
    const types = getSetupEntities().map((e) => e.type);
    expect(types).toEqual([
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

  it("User has no params and has label", () => {
    const user = getSetupEntity("User");
    expect(user).toBeDefined();
    expect(user?.params).toEqual([]);
    expect(user?.hasLabel).toBe(true);
  });

  it("Friendship has no label", () => {
    const friendship = getSetupEntity("Friendship");
    expect(friendship?.hasLabel).toBe(false);
  });

  it("Page has owner as required param", () => {
    const page = getSetupEntity("Page");
    const owner = page?.params.find((p) => p.name === "owner");
    expect(owner?.required).toBe(true);
  });

  it("Group has privacy with the expected enum values", () => {
    const group = getSetupEntity("Group");
    const privacy = group?.params.find((p) => p.name === "privacy");
    expect(privacy?.required).toBe(true);
    expect(new Set(privacy?.values ?? [])).toEqual(new Set(["public", "private", "public_legacy"]));
  });

  it("Album type has the expected enum values", () => {
    const album = getSetupEntity("Album");
    const type = album?.params.find((p) => p.name === "type");
    expect(new Set(type?.values ?? [])).toEqual(new Set(["user", "shared", "page", "group"]));
  });

  it("Business quarantine has boolean values", () => {
    const biz = getSetupEntity("Business");
    const q = biz?.params.find((p) => p.name === "quarantine");
    expect(new Set(q?.values ?? [])).toEqual(new Set(["false", "true"]));
  });

  it("every entity with params has at least one required param", () => {
    for (const entity of getSetupEntities()) {
      if (entity.type === "User") continue;
      const hasRequired = entity.params.some((p) => p.required);
      expect(hasRequired).toBe(true);
    }
  });

  it("every entity has a non-empty example", () => {
    for (const entity of getSetupEntities()) {
      expect(entity.example.length).toBeGreaterThan(0);
    }
  });

  it("excludes API helper test-user types (OculusThirdPartyTestDeveloper etc.)", () => {
    const types = new Set(getSetupEntities().map((e) => e.type));
    expect(types.has("OculusThirdPartyTestDeveloper")).toBe(false);
    expect(types.has("WhitehatTestUser")).toBe(false);
    expect(types.has("WearablesTestDeveloper")).toBe(false);
  });
});

describe("spec: actions", () => {
  it("has at least 60 actions", () => {
    expect(getActions().length).toBeGreaterThanOrEqual(60);
  });

  it("every action has a name and a description", () => {
    for (const action of getActions()) {
      expect(action.name.length).toBeGreaterThan(0);
      expect(action.description.length).toBeGreaterThan(0);
    }
  });

  it("most actions have a signature and at least one example extracted from API info", () => {
    const actions = getActions();
    const withSignature = actions.filter((a) => a.signature.length > 0).length;
    const withExamples = actions.filter((a) => a.examples.length > 0).length;
    expect(withSignature / actions.length).toBeGreaterThan(0.8);
    expect(withExamples / actions.length).toBeGreaterThan(0.8);
  });

  it("every action has at least one target type", () => {
    for (const action of getActions()) {
      expect(action.targetTypes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("action names are unique", () => {
    const names = getActions().map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("getAction returns the named action", () => {
    const action = getAction("make_post_text");
    expect(action?.name).toBe("make_post_text");
    expect(action?.supportsVoiceSwitcher).toBe(true);
  });

  it("getAction returns undefined for unknown action", () => {
    expect(getAction("nonexistent")).toBeUndefined();
  });

  it("getSetupEntity returns undefined for unknown type", () => {
    expect(getSetupEntity("FakeType")).toBeUndefined();
  });

  it("voice-switcher actions are derived from target_types including PAGE", () => {
    const voiceActions = getActions()
      .filter((a) => a.supportsVoiceSwitcher)
      .map((a) => a.name);
    expect(voiceActions).toContain("make_post_text");
    expect(voiceActions).toContain("block");
    expect(voiceActions).toContain("make_comment");
  });

  it("non-voice-switcher actions include deactivate_account and friend_user", () => {
    const noVoice = getActions()
      .filter((a) => !a.supportsVoiceSwitcher)
      .map((a) => a.name);
    expect(noVoice).toContain("deactivate_account");
    expect(noVoice).toContain("friend_user");
  });

  it("make_post_poll exposes a type param with the expected enum values", () => {
    const poll = getAction("make_post_poll");
    const type = poll?.keywordParams.find((p) => p.name === "type");
    expect(new Set(type?.values ?? [])).toEqual(new Set(["text", "photo"]));
  });

  it("change_post_audience exposes the expected audience values", () => {
    const action = getAction("change_post_audience");
    const audience = action?.keywordParams.find((p) => p.name === "audience");
    expect(new Set(audience?.values ?? [])).toEqual(
      new Set(["public", "friends", "only_me", "specific_friends", "friends_except"]),
    );
  });

  it("banhammer_user exposes the expected type values", () => {
    const action = getAction("banhammer_user");
    const type = action?.keywordParams.find((p) => p.name === "type");
    expect(new Set(type?.values ?? [])).toEqual(new Set(["ale", "political", "preharm"]));
  });
});

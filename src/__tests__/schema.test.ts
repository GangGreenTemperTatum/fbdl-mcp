import { describe, it, expect } from "vitest";
import { SETUP_ENTITIES, ACTIONS, getSetupEntity, getAction } from "../schema.js";

describe("schema: setup entities", () => {
  it("has all 8 entity types", () => {
    const types = SETUP_ENTITIES.map((e) => e.type);
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

  it("Group has privacy with correct enum values", () => {
    const group = getSetupEntity("Group");
    const privacy = group?.params.find((p) => p.name === "privacy");
    expect(privacy?.required).toBe(true);
    expect(privacy?.values).toEqual(["public", "private", "public_legacy"]);
  });

  it("Album type has correct enum values", () => {
    const album = getSetupEntity("Album");
    const type = album?.params.find((p) => p.name === "type");
    expect(type?.values).toEqual(["user", "shared", "page", "group"]);
  });

  it("Business quarantine has boolean values", () => {
    const biz = getSetupEntity("Business");
    const q = biz?.params.find((p) => p.name === "quarantine");
    expect(q?.values).toEqual(["false", "true"]);
  });

  it("every entity with params has at least one required param", () => {
    for (const entity of SETUP_ENTITIES) {
      if (entity.type === "User") continue;
      const hasRequired = entity.params.some((p) => p.required);
      expect(hasRequired).toBe(true);
    }
  });

  it("every entity has a non-empty example", () => {
    for (const entity of SETUP_ENTITIES) {
      expect(entity.example.length).toBeGreaterThan(0);
    }
  });
});

describe("schema: actions", () => {
  it("has at least 60 actions", () => {
    expect(ACTIONS.length).toBeGreaterThanOrEqual(60);
  });

  it("every action has a name, description, and at least one example", () => {
    for (const action of ACTIONS) {
      expect(action.name.length).toBeGreaterThan(0);
      expect(action.description.length).toBeGreaterThan(0);
      expect(action.examples.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every action has at least one target type", () => {
    for (const action of ACTIONS) {
      expect(action.targetTypes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("action names are unique", () => {
    const names = ACTIONS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("getAction returns correct action", () => {
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

  it("voice switcher actions include make_post_text, block, make_comment", () => {
    const voiceActions = ACTIONS.filter((a) => a.supportsVoiceSwitcher).map((a) => a.name);
    expect(voiceActions).toContain("make_post_text");
    expect(voiceActions).toContain("block");
    expect(voiceActions).toContain("make_comment");
  });

  it("non-voice-switcher actions include deactivate_account, friend_user", () => {
    const noVoice = ACTIONS.filter((a) => !a.supportsVoiceSwitcher).map((a) => a.name);
    expect(noVoice).toContain("deactivate_account");
    expect(noVoice).toContain("friend_user");
  });

  it("make_post_poll has type param with text|photo", () => {
    const poll = getAction("make_post_poll");
    const type = poll?.keywordParams.find((p) => p.name === "type");
    expect(type?.values).toEqual(["text", "photo"]);
  });

  it("change_post_audience has correct audience values", () => {
    const action = getAction("change_post_audience");
    const audience = action?.keywordParams.find((p) => p.name === "audience");
    expect(audience?.values).toEqual([
      "public",
      "friends",
      "only_me",
      "specific_friends",
      "friends_except",
    ]);
  });

  it("banhammer_user has correct type values", () => {
    const action = getAction("banhammer_user");
    const type = action?.keywordParams.find((p) => p.name === "type");
    expect(type?.values).toEqual(["ale", "political", "preharm"]);
  });
});

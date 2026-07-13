import { beforeAll, describe, expect, it } from "vitest";
import { validate } from "../validator.js";
import { installFixtureSpec } from "./fixtures/loadFixtureSpec.js";

beforeAll(() => {
  installFixtureSpec();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a block-grammar FBDL script: `[setup]` lines, then optional `[action]` lines. */
function script(setup: string[], actions: string[] = []): string {
  const lines = ["[setup]", ...setup.map((s) => `  ${s}`)];
  if (actions.length > 0) {
    lines.push("[action]", ...actions.map((a) => `  ${a}`));
  }
  return lines.join("\n");
}

function expectValid(src: string) {
  const result = validate(src);
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
  return result;
}

function expectErrors(src: string, count?: number) {
  const result = validate(src);
  expect(result.valid).toBe(false);
  if (count !== undefined) {
    expect(result.errors).toHaveLength(count);
  }
  return result;
}

// ── Setup validation ────────────────────────────────────────────────────────

describe("validate: setup block", () => {
  it("accepts a simple User setup", () => {
    const r = expectValid(script(["User UserOne"]));
    expect(r.definedLabels).toContain("UserOne");
  });

  it("accepts multiple Users, one per line", () => {
    const r = expectValid(script(["User UserOne", "User UserTwo", "User UserThree"]));
    expect(r.definedLabels).toEqual(expect.arrayContaining(["UserOne", "UserTwo", "UserThree"]));
  });

  it("accepts Page with required owner", () => {
    expectValid(script(["User UserOne", "Page PageOne with {owner: UserOne}"]));
  });

  it("accepts Group with all required params", () => {
    expectValid(
      script(["User OwnerOne", "Group GroupOne with {owner: OwnerOne, privacy: private}"]),
    );
  });

  it("accepts Group with optional params", () => {
    expectValid(
      script([
        "User OwnerOne",
        "User MemberOne",
        "Group GroupOne with {owner: OwnerOne, privacy: public, members: [MemberOne], visibility: anyone}",
      ]),
    );
  });

  it("accepts Album with required params", () => {
    expectValid(
      script(["User UserOne", "Album AlbumOne with {owner: UserOne, type: user, place: UserOne}"]),
    );
  });

  it("accepts Friendship (no label)", () => {
    expectValid(
      script([
        "User UserOne",
        "User UserTwo",
        "Friendship with {sender: UserOne, receivers: [UserTwo]}",
      ]),
    );
  });

  it("accepts Business with required and optional params", () => {
    expectValid(
      script(["User OwnerOne", "Business BizOne with {owner: OwnerOne, quarantine: true}"]),
    );
  });

  it("accepts App with type and live params", () => {
    expectValid(
      script([
        "User OwnerOne",
        "App AppOne with {owner: OwnerOne, live: false, type: instant_games}",
      ]),
    );
  });

  it("accepts Event with all params", () => {
    expectValid(
      script([
        "User OwnerOne",
        "User MemberOne",
        "Group GroupOne with {owner: OwnerOne, privacy: public}",
        "Event EventOne with {owner: OwnerOne, place: GroupOne, post_permission: anyone, post_approval: on}",
      ]),
    );
  });

  it("accepts a complex multi-entity setup", () => {
    expectValid(
      script([
        "User MemberOne",
        "User MemberTwo",
        "User OwnerOne",
        "User AdminOne",
        "Group GroupOne with {owner: OwnerOne, privacy: private, members:[MemberOne, MemberTwo], admins: [AdminOne]}",
      ]),
    );
  });

  it("rejects empty setup block", () => {
    const r = expectErrors("[setup]", 1);
    expect(r.errors[0]?.message).toContain("Empty setup block");
  });

  it("rejects unknown entity type", () => {
    const r = expectErrors(script(["FakeEntity FooBar"]), 1);
    expect(r.errors[0]?.message).toContain("Unknown setup entity type");
  });

  it("rejects Page without required owner", () => {
    const r = expectErrors(script(["User UserOne", "Page PageOne"]), 1);
    expect(r.errors[0]?.message).toContain("missing required params");
    expect(r.errors[0]?.message).toContain("owner");
  });

  it("rejects Group without required owner and privacy", () => {
    const r = expectErrors(script(["User UserOne", "Group GroupOne"]), 1);
    expect(r.errors[0]?.message).toContain("missing required params");
  });

  it("rejects Page with unknown param", () => {
    const r = expectErrors(
      script(["User UserOne", "Page PageOne with {owner: UserOne, fake_param: yes}"]),
    );
    expect(r.errors.some((e) => e.message.includes('unknown param "fake_param"'))).toBe(true);
  });

  it("rejects invalid enum value in Group privacy", () => {
    const r = expectErrors(
      script(["User OwnerOne", "Group GroupOne with {owner: OwnerOne, privacy: secret}"]),
    );
    expect(r.errors.some((e) => e.message.includes('invalid value "secret"'))).toBe(true);
  });

  it("rejects malformed keyword block (missing braces)", () => {
    const r = expectErrors(script(["User UserOne", "Page PageOne with owner: UserOne"]));
    expect(r.errors.some((e) => e.message.includes("Malformed keyword block"))).toBe(true);
  });

  it("rejects Page without label", () => {
    const r = expectErrors(script(["Page with {owner: UserOne}"]));
    expect(r.errors.some((e) => e.message.includes("requires a label"))).toBe(true);
  });

  it("rejects User without label", () => {
    const r = expectErrors(script(["User"]));
    expect(r.errors.some((e) => e.message.includes("requires a label"))).toBe(true);
  });

  it("accepts Album with all privacy values", () => {
    for (const privacy of [
      "public",
      "friends_only",
      "only_me",
      "contributors_only",
      "friends_of_contributors",
    ]) {
      expectValid(
        script([
          "User UserOne",
          `Album AlbumOne with {owner: UserOne, type: user, place: UserOne, privacy: ${privacy}}`,
        ]),
      );
    }
  });

  it("accepts App with all type values", () => {
    for (const appType of [
      "business",
      "workplace",
      "consumer",
      "instant_games",
      "gaming",
      "none",
    ]) {
      expectValid(script(["User OwnerOne", `App AppOne with {owner: OwnerOne, type: ${appType}}`]));
    }
  });
});

// ── Action validation ───────────────────────────────────────────────────────

describe("validate: actions", () => {
  it("accepts simple action (like_post)", () => {
    expectValid(
      script(
        ["User UserOne", "User UserTwo"],
        ["UserOne make_post_text PostOne with {place: UserOne}", "UserTwo like_post PostOne"],
      ),
    );
  });

  it("accepts action with voice switcher", () => {
    expectValid(
      script(
        ["User UserOne", "Page PageOne with {owner: UserOne}"],
        ["UserOne as PageOne make_post_text PostOne with {place: PageOne}"],
      ),
    );
  });

  it("accepts block action (no keyword params)", () => {
    expectValid(script(["User UserOne", "User UserTwo"], ["UserOne block UserTwo"]));
  });

  it("accepts make_comment with all optional params", () => {
    expectValid(
      script(
        ["User UserOne", "User UserTwo"],
        [
          "UserOne make_post_text PostOne with {place: UserOne}",
          "UserTwo make_comment CommentOne with {place: PostOne, text: 'Hello', tagged_object: UserOne}",
        ],
      ),
    );
  });

  it("accepts comment reply", () => {
    expectValid(
      script(
        ["User UserOne", "User UserTwo"],
        [
          "UserOne make_post_text PostOne with {place: UserOne}",
          "UserTwo make_comment CommentOne with {place: PostOne, text: 'First'}",
          "UserOne make_comment ReplyOne with {place: PostOne, replied_comment: CommentOne, text: 'Reply'}",
        ],
      ),
    );
  });

  it("accepts send_message with voice switcher", () => {
    expectValid(
      script(
        ["User UserOne", "User UserTwo", "Page PageTwo with {owner: UserTwo}"],
        ["UserTwo as PageTwo send_message UserOne with {text: 'Hey'}"],
      ),
    );
  });

  it("accepts change_post_audience with specific_friends", () => {
    expectValid(
      script(
        ["User UserOne", "User UserTwo", "User UserThree"],
        [
          "UserOne make_post_text PostOne with {place: UserOne}",
          "UserOne change_post_audience PostOne with {audience: specific_friends, friends: [UserTwo, UserThree]}",
        ],
      ),
    );
  });

  it("accepts gen_token with first-party app", () => {
    expectValid(script(["User UserOne"], ["UserOne gen_token TokenOne with {app: fb4a}"]));
  });

  it("accepts gen_token with an APP label as the app argument", () => {
    expectValid(
      script(
        ["User UserOne", "App AppOne with {owner: UserOne}"],
        ["UserOne gen_token TokenOne with {app: AppOne}"],
      ),
    );
  });

  it("accepts deactivate_account", () => {
    expectValid(script(["User UserTwo"], ["UserTwo deactivate_account UserTwo"]));
  });

  it("accepts friend_user", () => {
    expectValid(script(["User UserOne", "User UserTwo"], ["UserTwo friend_user UserOne"]));
  });

  it("accepts share_post with voice switcher", () => {
    expectValid(
      script(
        ["User UserOne", "Page PageOne with {owner: UserOne}"],
        [
          "UserOne make_post_text PostOne with {place: UserOne}",
          "UserOne as PageOne share_post SharedPost with {post: PostOne, place: PageOne}",
        ],
      ),
    );
  });

  it("accepts create_chat_group", () => {
    expectValid(
      script(
        ["User UserOne", "User UserTwo", "User UserThree"],
        [
          "UserOne create_chat_group ChatOne with {text: 'Welcome!', members: [UserTwo, UserThree]}",
        ],
      ),
    );
  });

  it("accepts make_post_poll", () => {
    expectValid(
      script(
        ["User UserOne", "Page PageOne with {owner: UserOne}"],
        [
          "UserOne as PageOne make_post_poll PollPost with {place: PageOne, type: photo, attachment_label: PollOne}",
        ],
      ),
    );
  });

  it("accepts business actions chain", () => {
    expectValid(
      script(
        ["User UserOne", "User UserTwo", "Page PageOne with {owner: UserOne}"],
        [
          "UserOne create_business BizOne with {primary_page: PageOne}",
          "UserOne add_biz_employees BizOne with {new_roles: [UserTwo]}",
        ],
      ),
    );
  });

  it("accepts group admin/member actions", () => {
    expectValid(
      script(
        ["User UserOne", "User UserTwo", "User UserThree"],
        [
          "UserOne create_group GroupOne with {privacy: private}",
          "UserOne add_group_members GroupOne with {new_roles: [UserTwo, UserThree]}",
          "UserOne add_group_admins GroupOne with {new_roles: [UserTwo]}",
        ],
      ),
    );
  });

  it("rejects unknown action", () => {
    const r = expectErrors(script(["User UserOne"], ["UserOne fly_to_moon SomeLabel"]));
    expect(r.errors[0]?.message).toContain("Unknown action");
  });

  it("rejects voice switcher on unsupported action", () => {
    const r = expectErrors(
      script(["User UserOne", "User UserTwo"], ["UserOne as UserTwo deactivate_account UserOne"]),
    );
    expect(r.errors.some((e) => e.message.includes("does not support voice switcher"))).toBe(true);
  });

  it("rejects action missing required keyword params", () => {
    const r = expectErrors(script(["User UserOne"], ["UserOne make_post_text PostOne"]));
    expect(r.errors.some((e) => e.message.includes("missing required params"))).toBe(true);
    expect(r.errors.some((e) => e.message.includes("place"))).toBe(true);
  });

  it("rejects action with unknown keyword param", () => {
    const r = expectErrors(
      script(
        ["User UserOne"],
        ["UserOne make_post_text PostOne with {place: UserOne, mood: happy}"],
      ),
    );
    expect(r.errors.some((e) => e.message.includes('unknown param "mood"'))).toBe(true);
  });

  it("rejects invalid enum value in action", () => {
    const r = expectErrors(
      script(["User UserOne"], ["UserOne change_post_audience PostOne with {audience: everyone}"]),
    );
    expect(r.errors.some((e) => e.message.includes('invalid value "everyone"'))).toBe(true);
  });

  it("rejects action line that is too short", () => {
    const r = expectErrors(script(["User UserOne"], ["UserOne"]));
    expect(r.errors.some((e) => e.message.includes("Action line too short"))).toBe(true);
  });

  it("rejects malformed keyword block in action", () => {
    const r = expectErrors(
      script(["User UserOne"], ["UserOne make_post_text PostOne with place: UserOne"]),
    );
    expect(r.errors.some((e) => e.message.includes("Malformed keyword block"))).toBe(true);
  });
});

// ── Strict block grammar ─────────────────────────────────────────────────────

describe("validate: strict block grammar", () => {
  it("accepts a setup-only block (the create-N-users case)", () => {
    const r = expectValid(script(["User UserOne", "User UserTwo", "User UserThree"]));
    expect(r.definedLabels).toEqual(expect.arrayContaining(["UserOne", "UserTwo", "UserThree"]));
  });

  it("rejects the legacy single-line setup form", () => {
    const r = expectErrors("[setup] User UserOne User UserTwo");
    expect(r.errors.some((e) => e.message.includes("own line"))).toBe(true);
  });

  it("rejects even a single entity on the [setup] header line", () => {
    const r = expectErrors("[setup] User UserOne");
    expect(r.errors.some((e) => e.message.includes("own line"))).toBe(true);
  });

  it("rejects more than one entity declaration on a setup line", () => {
    const r = expectErrors(script(["User UserOne User UserTwo"]));
    expect(r.errors.some((e) => e.message.includes("one entity declaration"))).toBe(true);
  });

  it("rejects a line that is outside any block", () => {
    const r = expectErrors("UserOne block UserTwo");
    expect(r.errors.some((e) => e.message.includes("outside any block"))).toBe(true);
  });

  it("ignores comment lines", () => {
    expectValid(
      [
        "# Example: two friends",
        "[setup]",
        "  User UserOne",
        "  User UserTwo",
        "  # friendship is required before friend actions",
        "  Friendship with {sender: UserOne, receivers: [UserTwo]}",
      ].join("\n"),
    );
  });

  it("reports the right source line for a block-grammar error", () => {
    const r = expectErrors(script(["User UserOne", "Page PageOne"]));
    // "Page PageOne" is the third source line.
    expect(r.errors[0]?.line).toBe(3);
  });

  it("flags an unknown action inside the [action] block", () => {
    const r = expectErrors(script(["User UserOne"], ["UserOne fly_to_moon X"]));
    expect(r.errors.some((e) => e.message.includes("Unknown action"))).toBe(true);
  });
});

// ── Label tracking ──────────────────────────────────────────────────────────

describe("validate: label tracking", () => {
  it("collects labels from setup and actions", () => {
    const r = expectValid(
      script(
        ["User UserOne", "User UserTwo"],
        [
          "UserOne make_post_text PostOne with {place: UserOne}",
          "UserTwo make_comment CommentOne with {place: PostOne}",
        ],
      ),
    );
    expect(r.definedLabels).toEqual(
      expect.arrayContaining(["UserOne", "UserTwo", "PostOne", "CommentOne"]),
    );
  });

  it("collects Friendship labels (no label for Friendship itself)", () => {
    const r = expectValid(
      script([
        "User UserOne",
        "User UserTwo",
        "Friendship with {sender: UserOne, receivers: [UserTwo]}",
      ]),
    );
    expect(r.definedLabels).toContain("UserOne");
    expect(r.definedLabels).toContain("UserTwo");
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe("validate: edge cases", () => {
  it("handles empty script", () => {
    const r = validate("");
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.definedLabels).toEqual([]);
  });

  it("handles whitespace-only script", () => {
    const r = validate("   \n  \n  ");
    expect(r.valid).toBe(true);
  });

  it("handles text with quoted strings containing commas", () => {
    expectValid(
      script(
        ["User UserOne"],
        ["UserOne make_post_text PostOne with {place: UserOne, text: 'Hello, world!'}"],
      ),
    );
  });

  it("handles text with quoted strings containing spaces", () => {
    expectValid(
      script(
        ["User UserOne", "User UserTwo"],
        ["UserOne send_message UserTwo with {text: 'This is a long message'}"],
      ),
    );
  });

  it("reports errors on correct line numbers", () => {
    const r = expectErrors(
      script(
        ["User UserOne"],
        ["UserOne make_post_text PostOne with {place: UserOne}", "UserOne fly_to_moon SomeLabel"],
      ),
    );
    // Lines: 1 [setup], 2 User, 3 [action], 4 make_post_text, 5 fly_to_moon.
    expect(r.errors[0]?.line).toBe(5);
  });

  it("reports multiple errors across lines", () => {
    const r = validate(script(["FakeType Foo", "AlsoFake Bar"]));
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
    expect(r.errors[0]?.line).toBe(2);
    expect(r.errors[1]?.line).toBe(3);
  });

  it("handles nested brackets in list values", () => {
    expectValid(
      script(
        ["User UserOne", "User UserTwo", "User UserThree"],
        ["UserOne create_chat_group ChatOne with {members: [UserTwo, UserThree], text: 'Hey all'}"],
      ),
    );
  });

  it("handles no-space before brace in keyword block", () => {
    expectValid(
      script(["User OwnerOne", "Group GroupOne with {owner: OwnerOne, privacy: private}"]),
    );
  });

  it("handles action with empty keyword block", () => {
    // create_page has only optional params — empty block should be valid
    expectValid(script(["User UserOne"], ["UserOne create_page PageOne with {}"]));
  });

  it("handles multiple actions on separate lines", () => {
    const r = expectValid(
      script(
        ["User UserOne", "User UserTwo"],
        [
          "UserOne make_post_text PostOne with {place: UserOne}",
          "UserTwo like_post PostOne",
          "UserOne follow UserTwo",
          "UserTwo follow UserOne",
        ],
      ),
    );
    expect(r.definedLabels).toContain("PostOne");
  });
});

// ── Full scenario tests (from FBDL docs) ───────────────────────────────────

describe("validate: full doc scenarios", () => {
  it("validates the Group example from docs", () => {
    expectValid(
      script([
        "User MemberOne",
        "User MemberTwo",
        "User OwnerOne",
        "User AdminOne",
        "Group GroupOne with {owner: OwnerOne, privacy: private, members:[MemberOne, MemberTwo], admins: [AdminOne]}",
      ]),
    );
  });

  it("validates the Business example from docs", () => {
    expectValid(
      script([
        "User OwnerOne",
        "User WorkerOne",
        "User WorkerTwo",
        "Page BizPageOne with {owner: OwnerOne}",
        "Business BizOne with {owner: OwnerOne, employees:[WorkerOne, WorkerTwo], primary_page: BizPageOne}",
      ]),
    );
  });

  it("validates the Event in Group example from docs", () => {
    expectValid(
      script([
        "User OwnerOne",
        "User MemberOne",
        "Group GroupOne with {owner: OwnerOne, privacy: public, members:[MemberOne]}",
        "Event EventOne with {owner: OwnerOne, place: GroupOne, post_permission:anyone, post_approval:on}",
      ]),
    );
  });

  it("validates a complex multi-step scenario", () => {
    expectValid(
      script(
        [
          "User UserOne",
          "User UserTwo",
          "Page PageOne with {owner: UserOne}",
          "Friendship with {sender: UserOne, receivers: [UserTwo]}",
        ],
        [
          "UserOne as PageOne make_post_text PostOne with {place: PageOne, text: 'Hello from the page'}",
          "UserTwo make_comment CommentOne with {place: PostOne, text: 'Nice post!', tagged_object: UserOne}",
          "UserOne as PageOne make_comment ReplyOne with {place: PostOne, replied_comment: CommentOne, text: 'Thanks!'}",
          "UserTwo like_post PostOne",
          "UserTwo share_post SharedPost with {post: PostOne, place: UserTwo}",
        ],
      ),
    );
  });

  it("validates album workflow", () => {
    expectValid(
      script(
        [
          "User UserOne",
          "User UserTwo",
          "Album AlbumOne with {owner: UserOne, type: shared, place: UserOne, privacy: friends_only, contributors: [UserTwo]}",
        ],
        [
          "UserOne add_photo PhotoOne with {album: AlbumOne, place: UserOne}",
          "UserTwo add_photo PhotoTwo with {album: AlbumOne, place: UserOne}",
          "UserOne tag_photo PhotoOne with {taggee: UserTwo}",
        ],
      ),
    );
  });
});

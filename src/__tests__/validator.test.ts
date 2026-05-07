import { describe, it, expect } from "vitest";
import { validate } from "../validator.js";

// ── Helper ──────────────────────────────────────────────────────────────────

function expectValid(script: string) {
  const result = validate(script);
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
  return result;
}

function expectErrors(script: string, count?: number) {
  const result = validate(script);
  expect(result.valid).toBe(false);
  if (count !== undefined) {
    expect(result.errors).toHaveLength(count);
  }
  return result;
}

// ── Setup validation ────────────────────────────────────────────────────────

describe("validate: setup block", () => {
  it("accepts a simple User setup", () => {
    const r = expectValid("[setup] User UserOne");
    expect(r.definedLabels).toContain("UserOne");
  });

  it("accepts multiple Users on one setup line", () => {
    const r = expectValid("[setup] User UserOne User UserTwo User UserThree");
    expect(r.definedLabels).toEqual(expect.arrayContaining(["UserOne", "UserTwo", "UserThree"]));
  });

  it("accepts Page with required owner", () => {
    expectValid("[setup] User UserOne Page PageOne with {owner: UserOne}");
  });

  it("accepts Group with all required params", () => {
    expectValid("[setup] User OwnerOne Group GroupOne with {owner: OwnerOne, privacy: private}");
  });

  it("accepts Group with optional params", () => {
    expectValid(
      "[setup] User OwnerOne User MemberOne Group GroupOne with {owner: OwnerOne, privacy: public, members: [MemberOne], visibility: anyone}",
    );
  });

  it("accepts Album with required params", () => {
    expectValid(
      "[setup] User UserOne Album AlbumOne with {owner: UserOne, type: user, place: UserOne}",
    );
  });

  it("accepts Friendship (no label)", () => {
    expectValid(
      "[setup] User UserOne User UserTwo Friendship with {sender: UserOne, receivers: [UserTwo]}",
    );
  });

  it("accepts Business with required and optional params", () => {
    expectValid("[setup] User OwnerOne Business BizOne with {owner: OwnerOne, quarantine: true}");
  });

  it("accepts App with type and live params", () => {
    expectValid(
      "[setup] User OwnerOne App AppOne with {owner: OwnerOne, live: false, type: instant_games}",
    );
  });

  it("accepts Event with all params", () => {
    expectValid(
      "[setup] User OwnerOne User MemberOne Group GroupOne with {owner: OwnerOne, privacy: public} Event EventOne with {owner: OwnerOne, place: GroupOne, post_permission: anyone, post_approval: on}",
    );
  });

  it("accepts complex multi-entity setup line from docs", () => {
    expectValid(
      "[setup] User MemberOne User MemberTwo User OwnerOne User AdminOne Group GroupOne with {owner: OwnerOne, privacy: private, members:[MemberOne, MemberTwo], admins: [AdminOne]}",
    );
  });

  it("rejects empty setup block", () => {
    const r = expectErrors("[setup]", 1);
    expect(r.errors[0]?.message).toContain("Empty setup block");
  });

  it("rejects unknown entity type", () => {
    const r = expectErrors("[setup] FakeEntity FooBar", 1);
    expect(r.errors[0]?.message).toContain("Unknown setup entity type");
  });

  it("rejects Page without required owner", () => {
    const r = expectErrors("[setup] User UserOne Page PageOne", 1);
    expect(r.errors[0]?.message).toContain("missing required params");
    expect(r.errors[0]?.message).toContain("owner");
  });

  it("rejects Group without required owner and privacy", () => {
    const r = expectErrors("[setup] User UserOne Group GroupOne", 1);
    expect(r.errors[0]?.message).toContain("missing required params");
  });

  it("rejects Page with unknown param", () => {
    const r = expectErrors(
      "[setup] User UserOne Page PageOne with {owner: UserOne, fake_param: yes}",
    );
    expect(r.errors.some((e) => e.message.includes('unknown param "fake_param"'))).toBe(true);
  });

  it("rejects invalid enum value in Group privacy", () => {
    const r = expectErrors(
      "[setup] User OwnerOne Group GroupOne with {owner: OwnerOne, privacy: secret}",
    );
    expect(r.errors.some((e) => e.message.includes('invalid value "secret"'))).toBe(true);
  });

  it("rejects malformed keyword block (missing braces)", () => {
    const r = expectErrors("[setup] User UserOne Page PageOne with owner: UserOne");
    expect(r.errors.some((e) => e.message.includes("Malformed keyword block"))).toBe(true);
  });

  it("rejects Page without label", () => {
    const r = expectErrors("[setup] Page with {owner: UserOne}");
    expect(r.errors.some((e) => e.message.includes("requires a label"))).toBe(true);
  });

  it("rejects User without label", () => {
    const r = expectErrors("[setup] User");
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
        `[setup] User UserOne Album AlbumOne with {owner: UserOne, type: user, place: UserOne, privacy: ${privacy}}`,
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
      expectValid(`[setup] User OwnerOne App AppOne with {owner: OwnerOne, type: ${appType}}`);
    }
  });
});

// ── Action validation ───────────────────────────────────────────────────────

describe("validate: actions", () => {
  it("accepts simple action (like_post)", () => {
    expectValid(
      "[setup] User UserOne User UserTwo\nUserOne make_post_text PostOne with {place: UserOne}\nUserTwo like_post PostOne",
    );
  });

  it("accepts action with voice switcher", () => {
    expectValid(
      "[setup] User UserOne Page PageOne with {owner: UserOne}\nUserOne as PageOne make_post_text PostOne with {place: PageOne}",
    );
  });

  it("accepts block action (no keyword params)", () => {
    expectValid("[setup] User UserOne User UserTwo\nUserOne block UserTwo");
  });

  it("accepts make_comment with all optional params", () => {
    expectValid(
      "[setup] User UserOne User UserTwo\nUserOne make_post_text PostOne with {place: UserOne}\nUserTwo make_comment CommentOne with {place: PostOne, text: 'Hello', tagged_object: UserOne}",
    );
  });

  it("accepts comment reply", () => {
    expectValid(
      "[setup] User UserOne User UserTwo\nUserOne make_post_text PostOne with {place: UserOne}\nUserTwo make_comment CommentOne with {place: PostOne, text: 'First'}\nUserOne make_comment ReplyOne with {place: PostOne, replied_comment: CommentOne, text: 'Reply'}",
    );
  });

  it("accepts send_message with voice switcher", () => {
    expectValid(
      "[setup] User UserOne User UserTwo Page PageTwo with {owner: UserTwo}\nUserTwo as PageTwo send_message UserOne with {text: 'Hey'}",
    );
  });

  it("accepts change_post_audience with specific_friends", () => {
    expectValid(
      "[setup] User UserOne User UserTwo User UserThree\nUserOne make_post_text PostOne with {place: UserOne}\nUserOne change_post_audience PostOne with {audience: specific_friends, friends: [UserTwo, UserThree]}",
    );
  });

  it("accepts gen_token with first-party app", () => {
    expectValid("[setup] User UserOne\nUserOne gen_token TokenOne with {app: fb4a}");
  });

  it("accepts gen_token with scopes", () => {
    expectValid(
      "[setup] User UserOne App AppOne with {owner: UserOne}\nUserOne gen_token TokenOne with {app: AppOne, scopes: [ads_management, ads_read]}",
    );
  });

  it("accepts deactivate_account", () => {
    expectValid("[setup] User UserTwo\nUserTwo deactivate_account UserTwo");
  });

  it("accepts friend_user", () => {
    expectValid("[setup] User UserOne User UserTwo\nUserTwo friend_user UserOne");
  });

  it("accepts share_post with voice switcher", () => {
    expectValid(
      "[setup] User UserOne Page PageOne with {owner: UserOne}\nUserOne make_post_text PostOne with {place: UserOne}\nUserOne as PageOne share_post SharedPost with {post: PostOne, place: PageOne}",
    );
  });

  it("accepts create_chat_group", () => {
    expectValid(
      "[setup] User UserOne User UserTwo User UserThree\nUserOne create_chat_group ChatOne with {text: 'Welcome!', members: [UserTwo, UserThree]}",
    );
  });

  it("accepts make_post_poll", () => {
    expectValid(
      "[setup] User UserOne Page PageOne with {owner: UserOne}\nUserOne as PageOne make_post_poll PollPost with {place: PageOne, type: photo, attachment_label: PollOne}",
    );
  });

  it("accepts business actions chain", () => {
    expectValid(
      "[setup] User UserOne User UserTwo Page PageOne with {owner: UserOne}\nUserOne create_business BizOne with {primary_page: PageOne}\nUserOne add_biz_employees BizOne with {new_roles: [UserTwo]}",
    );
  });

  it("accepts group admin/member actions", () => {
    expectValid(
      "[setup] User UserOne User UserTwo User UserThree\nUserOne create_group GroupOne with {privacy: private}\nUserOne add_group_members GroupOne with {new_roles: [UserTwo, UserThree]}\nUserOne add_group_admins GroupOne with {new_roles: [UserTwo]}",
    );
  });

  it("rejects unknown action", () => {
    const r = expectErrors("[setup] User UserOne\nUserOne fly_to_moon SomeLabel");
    expect(r.errors[0]?.message).toContain("Unknown action");
  });

  it("rejects voice switcher on unsupported action", () => {
    const r = expectErrors(
      "[setup] User UserOne User UserTwo\nUserOne as UserTwo deactivate_account UserOne",
    );
    expect(r.errors.some((e) => e.message.includes("does not support voice switcher"))).toBe(true);
  });

  it("rejects action missing required keyword params", () => {
    const r = expectErrors("[setup] User UserOne\nUserOne make_post_text PostOne");
    expect(r.errors.some((e) => e.message.includes("missing required params"))).toBe(true);
    expect(r.errors.some((e) => e.message.includes("place"))).toBe(true);
  });

  it("rejects action with unknown keyword param", () => {
    const r = expectErrors(
      "[setup] User UserOne\nUserOne make_post_text PostOne with {place: UserOne, mood: happy}",
    );
    expect(r.errors.some((e) => e.message.includes('unknown param "mood"'))).toBe(true);
  });

  it("rejects invalid enum value in action", () => {
    const r = expectErrors(
      "[setup] User UserOne\nUserOne change_post_audience PostOne with {audience: everyone}",
    );
    expect(r.errors.some((e) => e.message.includes('invalid value "everyone"'))).toBe(true);
  });

  it("rejects action line that is too short", () => {
    const r = expectErrors("[setup] User UserOne\nUserOne");
    expect(r.errors[0]?.message).toContain("Action line too short");
  });

  it("rejects malformed keyword block in action", () => {
    const r = expectErrors(
      "[setup] User UserOne\nUserOne make_post_text PostOne with place: UserOne",
    );
    expect(r.errors.some((e) => e.message.includes("Malformed keyword block"))).toBe(true);
  });
});

// ── Label tracking ──────────────────────────────────────────────────────────

describe("validate: label tracking", () => {
  it("collects labels from setup and actions", () => {
    const r = expectValid(
      "[setup] User UserOne User UserTwo\nUserOne make_post_text PostOne with {place: UserOne}\nUserTwo make_comment CommentOne with {place: PostOne}",
    );
    expect(r.definedLabels).toEqual(
      expect.arrayContaining(["UserOne", "UserTwo", "PostOne", "CommentOne"]),
    );
  });

  it("collects Friendship labels (no label for Friendship itself)", () => {
    const r = expectValid(
      "[setup] User UserOne User UserTwo Friendship with {sender: UserOne, receivers: [UserTwo]}",
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
      "[setup] User UserOne\nUserOne make_post_text PostOne with {place: UserOne, text: 'Hello, world!'}",
    );
  });

  it("handles text with quoted strings containing spaces", () => {
    expectValid(
      "[setup] User UserOne User UserTwo\nUserOne send_message UserTwo with {text: 'This is a long message'}",
    );
  });

  it("reports errors on correct line numbers", () => {
    const r = expectErrors(
      "[setup] User UserOne\nUserOne make_post_text PostOne with {place: UserOne}\nUserOne fly_to_moon SomeLabel",
    );
    expect(r.errors[0]?.line).toBe(3);
  });

  it("reports multiple errors across lines", () => {
    const r = validate("[setup] FakeType Foo\nBadAction");
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
    expect(r.errors[0]?.line).toBe(1);
    expect(r.errors[1]?.line).toBe(2);
  });

  it("handles nested brackets in list values", () => {
    expectValid(
      "[setup] User UserOne User UserTwo User UserThree\nUserOne create_chat_group ChatOne with {members: [UserTwo, UserThree], text: 'Hey all'}",
    );
  });

  it("handles no-space before brace in keyword block", () => {
    expectValid("[setup] User OwnerOne Group GroupOne with {owner: OwnerOne, privacy: private}");
  });

  it("handles action with empty keyword block", () => {
    // create_page has only optional params — empty block should be valid
    expectValid("[setup] User UserOne\nUserOne create_page PageOne with {}");
  });

  it("handles multiple actions on separate lines", () => {
    const r = expectValid(`[setup] User UserOne User UserTwo
UserOne make_post_text PostOne with {place: UserOne}
UserTwo like_post PostOne
UserOne follow UserTwo
UserTwo follow UserOne`);
    expect(r.definedLabels).toContain("PostOne");
  });
});

// ── Full scenario tests (from FBDL docs) ───────────────────────────────────

describe("validate: full doc scenarios", () => {
  it("validates the Group example from docs", () => {
    expectValid(
      "[setup] User MemberOne User MemberTwo User OwnerOne User AdminOne Group GroupOne with {owner: OwnerOne, privacy: private, members:[MemberOne, MemberTwo], admins: [AdminOne]}",
    );
  });

  it("validates the Business example from docs", () => {
    expectValid(
      "[setup] User OwnerOne User WorkerOne User WorkerTwo Page BizPageOne with {owner: OwnerOne} Business BizOne with {owner: OwnerOne, employees:[WorkerOne, WorkerTwo], primary_page: BizPageOne}",
    );
  });

  it("validates the Event in Group example from docs", () => {
    expectValid(
      "[setup] User OwnerOne User MemberOne Group GroupOne with {owner: OwnerOne, privacy: public, members:[MemberOne]} Event EventOne with {owner: OwnerOne, place: GroupOne, post_permission:anyone, post_approval:on}",
    );
  });

  it("validates a complex multi-step scenario", () => {
    expectValid(`[setup] User UserOne User UserTwo Page PageOne with {owner: UserOne} Friendship with {sender: UserOne, receivers: [UserTwo]}
UserOne as PageOne make_post_text PostOne with {place: PageOne, text: 'Hello from the page'}
UserTwo make_comment CommentOne with {place: PostOne, text: 'Nice post!', tagged_object: UserOne}
UserOne as PageOne make_comment ReplyOne with {place: PostOne, replied_comment: CommentOne, text: 'Thanks!'}
UserTwo like_post PostOne
UserTwo share_post SharedPost with {post: PostOne, place: UserTwo}`);
  });

  it("validates album workflow", () => {
    expectValid(`[setup] User UserOne User UserTwo Album AlbumOne with {owner: UserOne, type: shared, place: UserOne, privacy: friends_only, contributors: [UserTwo]}
UserOne add_photo PhotoOne with {album: AlbumOne, place: UserOne}
UserTwo add_photo PhotoTwo with {album: AlbumOne, place: UserOne}
UserOne tag_photo PhotoOne with {taggee: UserTwo}`);
  });
});

# FBDL MCP Server

You have access to tools for working with FBDL (Facebook Developer Language) -- a DSL used in Meta's bug bounty program (MMBRC) to create reproducible test scenarios with whitehat test users, pages, groups, and other Facebook entities.

## When to use these tools

Use the FBDL tools when the user wants to:
- Create test scenarios for Meta's bug bounty program
- Generate FBDL scripts from natural language descriptions
- Validate existing FBDL scripts for correctness
- Understand what an FBDL script does
- Look up available FBDL entities, actions, or their parameters

## Tool chaining pattern

Always follow this workflow when generating FBDL:

1. **Understand** -- Use `list_entities` and `list_actions` to check available constructs if unsure
2. **Generate** -- Write the FBDL script (use the `generate_fbdl` prompt for complex scenarios)
3. **Validate** -- Always call `validate_fbdl` on the generated script before presenting it
4. **Explain** -- Use `explain_fbdl` if the user wants to understand what a script does

Never present an FBDL script to the user without validating it first.

## FBDL language reference

### Script structure

An FBDL script has two blocks, each introduced by a header on its own line:
1. A **`[setup]` block** that creates test entities — one declaration per line
2. An **`[action]` block** that performs operations on those entities — one action per line

The `[action]` block is optional: a setup-only script (just create entities) is valid.
Lines beginning with `#` are comments.

### Setup block syntax

```
[setup]
  Type Label [with {key: value, ...}]
  Type Label [with {key: value, ...}]
```

The `[setup]` header sits alone on its line, and **each entity goes on its own
line** below it (indentation is optional but conventional). Do NOT put multiple
entities, or any entity, on the `[setup]` header line — the FBDL API rejects that.

**Entity types and their required params:**

| Type | Required params | Key optional params |
|------|----------------|-------------------|
| User | (none) | (none) |
| Page | owner | admins, editors, moderators, is_parent_location |
| Group | owner, privacy (public/private/public_legacy) | members, admins, visibility, allow_anonymous_posts |
| Album | owner, type (user/shared/page/group), place | privacy, contributors |
| Friendship | sender, receivers | (none -- also has NO label) |
| Business | owner | admins, employees, primary_page, tier, quarantine |
| App | owner | live (true/false), type (business/consumer/instant_games/etc) |
| Event | owner, place | privacy, is_past, post_permission, post_approval, co_hosts |

### Action line syntax

Actions live under an `[action]` header, one per line:

```
[action]
  Subject [as VoiceSwitcher] action_name Label [with {key: value, ...}]
```

- **Subject**: The user performing the action (must exist in setup)
- **as VoiceSwitcher**: Optional -- lets a user act as a Page they own (only on actions that support it)
- **Label**: The label for the created/targeted object
- **with {...}**: Keyword parameters

### Key rules

1. **Setup before use**: Every entity referenced in actions MUST be created in the setup block first
2. **Users first**: Users must exist before being assigned as owners, members, or roles
3. **Friendships before friend-dependent actions**: Establish friendships before actions like `group_invite_friends` or `page_invite_friend`
4. **Block format**: A `[setup]` header then (optionally) an `[action]` header, each on its own line; put one entity declaration and one action per line. Never place entities on the `[setup]` header line.
5. **One action per line**: Each action goes on its own line under the `[action]` header
6. **PascalCase labels**: Labels should be descriptive PascalCase (UserOne, PageOne, PostOne)
7. **Voice switcher**: Only use `as` on actions that support it (check with `list_actions`)

### Common action categories

**Posts**: make_post_text, make_post_photo, make_post_video, make_post_poll, make_post_violation, share_post
**Comments**: make_comment (supports replies via replied_comment)
**Social**: friend_user, friend_request, follow, unfollow, block, like_post, like_page
**Groups**: create_group, add_group_members, add_group_admins, add_group_moderators, remove_member, mute_member, pause_group
**Pages**: create_page, publish_page, unpublish_page, add_page_facebook_access, add_page_task_access
**Events**: create_event, add_event_cohosts, event_invite, cancel_event, going_event
**Business**: create_business, add_biz_employees, add_biz_admins, create_ad_account, create_shop
**Account**: deactivate_account, lock_profile, enable_professional_mode, set_privacy_jurisdiction
**Messaging**: send_message, create_chat_group
**Media**: add_cover_photo, add_story, create_album, add_photo, add_video, tag_photo

## Example scenarios

### Just create three test users (setup-only, no actions)

```
[setup]
  User UserOne
  User UserTwo
  User UserThree
```

### Two friends, one posts on their page, the other comments

```
[setup]
  User Alice
  User Bob
  Page AlicePage with {owner: Alice}
  Friendship with {sender: Alice, receivers: [Bob]}
[action]
  Alice as AlicePage make_post_text PagePost with {place: AlicePage, text: 'Check out my new page!'}
  Bob make_comment BobComment with {place: PagePost, text: 'Looks great!', tagged_object: Alice}
  Alice as AlicePage make_comment AliceReply with {place: PagePost, replied_comment: BobComment, text: 'Thanks Bob!'}
```

### Private group with moderation

```
[setup]
  User Admin
  User ModOne
  User MemberOne
  User MemberTwo
  Group TestGroup with {owner: Admin, privacy: private, members: [MemberOne, MemberTwo], moderators: [ModOne]}
[action]
  MemberOne make_post_text Post1 with {place: TestGroup, text: 'Hello group!'}
  MemberTwo make_comment Comment1 with {place: Post1, text: 'Welcome!'}
  ModOne mute_member TestGroup with {member: MemberTwo}
  Admin set_post_permission TestGroup with {value: admin}
```

### Business with page, shop, and employees

```
[setup]
  User Owner
  User Employee
  Page BizPage with {owner: Owner}
  Business Biz with {owner: Owner, employees: [Employee], primary_page: BizPage}
[action]
  Owner create_shop Shop with {page: BizPage, business: Biz}
  Owner create_shop_item Item1 with {shop: Shop, approved: true}
  Owner create_ad_account AdAcct with {business: Biz}
  Owner add_ad_advertisers AdAcct with {new_roles: [Employee]}
```

### Event with cohosts and invites

```
[setup]
  User Host
  User Cohost
  User Guest1
  User Guest2
  Page EventPage with {owner: Host}
  Friendship with {sender: Host, receivers: [Guest1, Guest2]}
[action]
  Host create_event BigEvent with {place: EventPage, privacy: public, post_permission: anyone}
  Host add_event_cohosts BigEvent with {new_roles: [Cohost, EventPage]}
  Host event_invite BigEvent with {invitees: [Guest1, Guest2]}
  Guest1 going_event BigEvent
  Guest1 make_post_text EventPost with {place: BigEvent, text: 'Excited to attend!'}
```

### Bug bounty: testing post audience controls

```
[setup]
  User Poster
  User FriendOne
  User FriendTwo
  User Stranger
  Friendship with {sender: Poster, receivers: [FriendOne, FriendTwo]}
[action]
  Poster make_post_text PublicPost with {place: Poster, text: 'Public post'}
  Poster change_post_audience PublicPost with {audience: specific_friends, friends: [FriendOne]}
  Poster make_post_text FriendsPost with {place: Poster, text: 'Friends only'}
  Poster change_post_audience FriendsPost with {audience: friends}
  Poster make_post_text PrivatePost with {place: Poster, text: 'Only me'}
  Poster change_post_audience PrivatePost with {audience: only_me}
```

## Development

This project uses strict TypeScript, ESLint with strict type checking, Prettier, and Vitest.

```
npm run check    # typecheck + lint + format + tests (run before committing)
npm run build    # compile to dist/
npm run test     # run tests only
```

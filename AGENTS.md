# FBDL MCP Server -- Agent Instructions

## What is FBDL?

FBDL (Facebook Developer Language) is a domain-specific language used in Meta's MMBRC (bug bounty program). It creates reproducible test environments with whitehat test users, pages, groups, and other Facebook entities. Researchers use FBDL scripts to set up specific scenarios for security testing.

Scripts are executed inside Meta's bug bounty platform -- this MCP server generates and validates them locally. The server fetches the FBDL grammar from `https://api.facebook.com/bug_bounty/fbdl_reference/` at startup so it stays current, which requires `FBDL_API_TOKEN` in the environment.

## Available tools

| Tool | When to use |
|------|------------|
| `validate_fbdl` | After generating or receiving any FBDL script. Always validate before presenting to user. |
| `list_entities` | To check what setup entities exist and their parameters. Filter by type (User, Page, Group, etc). |
| `list_actions` | To find available actions. Filter by name or category (post, group, page, business, event, app). |
| `explain_fbdl` | To describe what an existing FBDL script does in plain English. |

There is also a `generate_fbdl` prompt template that provides the full FBDL grammar for script generation.

## Workflow

```
1. list_entities / list_actions  -->  discover what's available
2. write the FBDL script          -->  follow the grammar below
3. validate_fbdl                  -->  catch errors before presenting
4. (optional) explain_fbdl        -->  verify it does what's intended
```

Never skip step 3. Always validate.

## FBDL grammar

### Setup block (single line)

```
[setup] Type Label [with {key: value}] [Type Label with {key: value}] ...
```

Everything in the setup block is on ONE line. Entities are declared sequentially.

**Entity types:**

- **User** -- No params needed. Just `User LabelName`.
- **Page** -- Requires `owner`. Optional: admins, editors, moderators, is_parent_location.
- **Group** -- Requires `owner`, `privacy` (public|private|public_legacy). Optional: members, admins, visibility.
- **Album** -- Requires `owner`, `type` (user|shared|page|group), `place`.
- **Friendship** -- Requires `sender`, `receivers` (list). Has NO label.
- **Business** -- Requires `owner`. Optional: employees, admins, primary_page, quarantine.
- **App** -- Requires `owner`. Optional: live (true|false), type.
- **Event** -- Requires `owner`, `place`. Optional: privacy, is_past, post_permission, post_approval.

### Action lines (one per line)

```
Subject [as VoiceSwitcher] action_name Label [with {key: value}]
```

- `Subject` -- user performing the action
- `as VoiceSwitcher` -- optional, lets user act as a Page (only on supported actions)
- `Label` -- target or created object label
- `with {...}` -- keyword params

### Critical rules

1. Setup comes first. Every entity used in actions must be created in `[setup]`.
2. Users must exist before they can own things or be assigned roles.
3. Friendships must exist before friend-dependent actions (invites, chat groups).
4. Setup is always a single line. Actions are one per line after it.
5. Labels are PascalCase and unique across the script.
6. Voice switcher (`as`) only works on actions that explicitly support it.
7. List params use bracket syntax: `[ItemOne, ItemTwo]`.
8. String values use single quotes: `text: 'Hello world'`.

## Common patterns

### Basic: user posts and gets engagement

```
[setup] User Poster User Viewer Friendship with {sender: Poster, receivers: [Viewer]}
Poster make_post_text MyPost with {place: Poster, text: 'Hello'}
Viewer like_post MyPost
Viewer make_comment MyComment with {place: MyPost, text: 'Nice!'}
```

### Page with voice switcher

```
[setup] User Admin Page MyPage with {owner: Admin}
Admin as MyPage make_post_text PagePost with {place: MyPage, text: 'Official update'}
```

### Group with roles and moderation

```
[setup] User Owner User Mod User Member Group MyGroup with {owner: Owner, privacy: private, members: [Member], moderators: [Mod]}
Member make_post_text GroupPost with {place: MyGroup}
Mod mute_member MyGroup with {member: Member}
```

### Business setup

```
[setup] User BizOwner User Worker Page BizPage with {owner: BizOwner} Business MyBiz with {owner: BizOwner, employees: [Worker], primary_page: BizPage}
BizOwner create_ad_account AdAcct with {business: MyBiz}
```

### Testing access controls (common bug bounty pattern)

```
[setup] User Owner User NonFriend Page OwnerPage with {owner: Owner}
Owner as OwnerPage make_post_text SecretPost with {place: OwnerPage, text: 'Restricted content'}
Owner change_post_audience SecretPost with {audience: only_me}
```

## Action reference (by category)

**Posts**: make_post_text, make_post_photo, make_post_video, make_post_poll, make_post_violation, share_post, change_post_audience
**Comments**: make_comment (reply via `replied_comment` param)
**Social**: friend_user, friend_request, follow, unfollow, block, like_post, like_page, going_event
**Messaging**: send_message, create_chat_group
**Groups**: create_group, add_group_members, add_group_admins, add_group_moderators, remove_member, mute_member, pause_group, unpause_group, set_post_permission, set_admin_approval
**Pages**: create_page, publish_page, unpublish_page, add_page_facebook_access, add_page_task_access, set_age_restriction
**Events**: create_event, add_event_cohosts, event_invite, cancel_event
**Business**: create_business, add_biz_employees, add_biz_admins, create_ad_account, create_shop, create_shop_item, create_pixel
**Apps**: add_app_admins, add_app_developers, add_app_testers, gen_token
**Account**: deactivate_account, lock_profile, enable_professional_mode, set_privacy_jurisdiction, banhammer_user, add_checkpoint
**Media**: add_cover_photo, add_story, create_album, add_photo, add_video, tag_photo
**Collections**: create_collection, add_collection_contributors, save_to_collection

Use `list_actions` with a `name` or `category` filter to get full parameter details for any action.

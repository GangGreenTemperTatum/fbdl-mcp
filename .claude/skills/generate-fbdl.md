# Generate FBDL

Generate a valid FBDL (Facebook Developer Language) script from the user's natural language description. FBDL is used in Meta's bug bounty program (MMBRC) to create reproducible test scenarios.

## Instructions

1. Read the user's description carefully
2. Identify what entities need to be created (Users, Pages, Groups, etc)
3. Identify what actions need to happen and in what order
4. Generate a valid script following the grammar below
5. If the `validate_fbdl` MCP tool is available, call it to verify correctness
6. Present the script with a brief explanation of what it sets up

## FBDL grammar

### Setup block (single line)

```
[setup] Type Label [with {key: value}] [Type Label with {key: value}] ...
```

The ENTIRE setup is ONE line. Multiple entities are declared sequentially.

### Entity types

**User** -- `User LabelName` (no params needed)

**Page** -- `Page Label with {owner: UserLabel}`
- Optional: admins (list), editors (list), moderators (list), is_parent_location (true|false)

**Group** -- `Group Label with {owner: UserLabel, privacy: public|private|public_legacy}`
- Optional: members (list), admins (list), moderators (list), visibility (anyone|members_only), allow_anonymous_posts (true|false)

**Album** -- `Album Label with {owner: UserLabel, type: user|shared|page|group, place: Label}`
- Optional: privacy (public|friends_only|only_me|contributors_only|friends_of_contributors), contributors (list)

**Friendship** -- `Friendship with {sender: UserLabel, receivers: [UserLabel, ...]}`
- NO label. Creates friendships between users.

**Business** -- `Business Label with {owner: UserLabel}`
- Optional: admins (list), employees (list), primary_page (PageLabel), tier (tier_0-3), quarantine (true|false)

**App** -- `App Label with {owner: UserLabel}`
- Optional: live (true|false), type (business|workplace|consumer|instant_games|gaming|none)

**Event** -- `Event Label with {owner: UserLabel, place: Label}`
- Optional: privacy (public|private), is_past (true|false), post_permission (admin|anyone), post_approval (on|off), co_hosts (list)

### Action lines (one per line after setup)

```
Subject [as VoiceSwitcher] action_name Label [with {key: value}]
```

### Available actions

**Posts**
- `make_post_text Label with {place: Label, ?text: 'msg', ?tagged_object: Label}` -- voice switcher: yes
- `make_post_photo Label with {place: Label, ?text: 'msg', ?attachment_label: Label}` -- voice switcher: yes
- `make_post_video Label with {place: Label, ?text: 'msg', ?attachment_label: Label}` -- voice switcher: yes
- `make_post_poll Label with {place: Label, type: text|photo}` -- voice switcher: yes
- `make_post_violation Label with {place: Label, type: hate|nudity|...}` -- voice switcher: yes
- `share_post Label with {post: Label, place: Label, ?text: 'msg'}` -- voice switcher: yes
- `change_post_audience Label with {audience: public|friends|only_me|specific_friends|friends_except, ?friends: [list]}` -- no voice switcher
- `make_anonymous_post Label with {group: Label, approved_by: UserLabel}` -- no voice switcher

**Comments**
- `make_comment Label with {place: Label, ?text: 'msg', ?tagged_object: Label, ?replied_comment: Label}` -- voice switcher: yes

**Social**
- `friend_user Label` -- auto-accepted
- `friend_request Label` -- not auto-accepted
- `follow Label` / `unfollow Label`
- `block Label` -- voice switcher: yes
- `like_post Label` / `like_page Label`
- `going_event Label`

**Messaging**
- `send_message Label with {text: 'msg'}` -- voice switcher: yes
- `create_chat_group Label with {members: [list], ?text: 'msg'}`

**Groups**
- `create_group Label with {?privacy: public|private, ?visibility: anyone|members_only}`
- `add_group_members Label with {new_roles: [list], ?accept_invite: true|false}` -- voice switcher: yes
- `add_group_admins Label with {new_roles: [list]}` -- voice switcher: yes
- `add_group_moderators Label with {new_roles: [list]}` -- voice switcher: yes
- `remove_member Label with {member: Label, ?block: true|false}` -- voice switcher: yes
- `mute_member Label with {member: Label}` -- voice switcher: yes
- `pause_group Label` / `unpause_group Label`
- `set_post_permission Label with {value: anyone|admin}` -- voice switcher: yes
- `set_admin_approval Label with {value: on|off}` -- voice switcher: yes
- `create_linked_group Label with {?page: Label, ?privacy: private|public, ?members: [list]}`
- `group_link_page Label with {page: Label}` / `group_unlink_page Label with {page: Label}`
- `group_invite_friends Label with {invitees: [list]}`
- `create_learning_unit Label with {group: Label}` -- voice switcher: yes
- `create_doc Label with {group: Label, ?can_edit: true|false}` -- voice switcher: yes
- `create_quiz Label with {group: Label, unit: Label}`

**Pages**
- `create_page Label with {?is_parent_location: true|false}`
- `publish_page Label` / `unpublish_page Label`
- `add_page_facebook_access Label with {new_roles: [list], ?full: true|false}`
- `add_page_task_access Label with {new_role: Label, tasks: [content|messages|community|ads|insights]}`
- `set_age_restriction Label with {age: 0|17|18|19|21}`
- `add_business_location Label with {page: Label}`
- `add_page_community_managers Label with {new_roles: [list]}`
- `page_link_group Label with {group: Label}`
- `page_invite_friend Label with {invitees: [list]}`
- `request_crossposting Label with {mode: automatic|manual, ?accept_request: true|false}` -- voice switcher: yes
- `create_ar_permission_group Label with {page: Label, users: [list]}`

**Events**
- `create_event Label with {place: Label, ?privacy: public|private, ?is_past: true|false, ?post_permission: admin|anyone, ?post_approval: on|off}`
- `add_event_cohosts Label with {new_roles: [list], ?accept_invite: true|false}`
- `event_invite Label with {invitees: [list]}`
- `cancel_event Label`

**Business**
- `create_business Label with {?primary_page: Label}`
- `add_biz_employees Label with {new_roles: [list]}`
- `add_biz_admins Label with {new_roles: [list]}`
- `add_biz_pages Label with {pages: [list]}`
- `biz_assign_page_role Label with {business: Label, role: admin|editor|moderator|advertiser|analyst, page: Label}`
- `biz_assign_partner_asset Label with {partner: Label, asset: Label, type: app|page|ad_account}`
- `biz_link_app Label with {app: Label}`
- `biz_request_page_access Label with {page: Label, ?permissions: [manage|create_content|moderate|advertise|analyze|manage_jobs]}`
- `create_ad_account Label with {?business: Label}`
- `add_ad_admins/advertisers/analysts Label with {new_roles: [list]}`
- `create_shop Label with {page: Label, business: Label}`
- `create_shop_item Label with {shop: Label, ?approved: true|false}`
- `create_pixel Label with {business: Label}`

**Apps**
- `add_app_admins/developers/testers/analytics_users Label with {new_roles: [list]}`
- `gen_token Label with {app: fb4a|fbios|fbwww|ig|bm|pct|AppLabel, ?scopes: [list]}`

**Account**
- `deactivate_account Label` (label = same user)
- `lock_profile Label` (label = same user)
- `enable_professional_mode Label`
- `create_additional_profile Label`
- `create_messenger_kids_account Label`
- `add_guardians Label with {guardians: [list]}`
- `set_privacy_jurisdiction Label with {jurisdiction: EU|BR|US|IN|...}`
- `banhammer_user Label with {type: ale|political|preharm}`
- `add_checkpoint Label with {checkpoint: Epsilon|UFAC}`

**Media**
- `add_cover_photo Label with {place: Label}` -- voice switcher: yes
- `add_story Label` -- voice switcher: yes
- `create_album Label with {type: user|shared|page|group, place: Label}` -- voice switcher: yes
- `add_photo Label with {album: Label, place: Label}` -- voice switcher: yes
- `add_video Label with {album: Label, place: Label}` -- voice switcher: yes
- `tag_photo Label with {taggee: Label}` -- voice switcher: yes
- `add_contributors Label with {new_roles: [list]}`

**Roles**
- `remove_role Label with {old_role: Label}` -- voice switcher: yes

**Collections**
- `create_collection Label`
- `add_collection_contributors Label with {new_roles: [list]}`
- `save_to_collection Label with {new_posts: [list]}`

## Rules

1. **Setup first**: All entities must be created in `[setup]` before being referenced in actions
2. **Single setup line**: The `[setup]` block is always ONE line
3. **One action per line**: Each action is its own line after setup
4. **Users before roles**: Users must exist before being owners, members, admins
5. **Friendships before invites**: Establish friendships before friend-dependent actions
6. **Voice switcher**: Only use `as PageLabel` on actions marked "voice switcher: yes"
7. **PascalCase labels**: Use descriptive unique labels (UserOne, TestPage, MainGroup)
8. **Lists use brackets**: `[Item1, Item2, Item3]`
9. **Strings use single quotes**: `text: 'Hello world'`

## Output format

Present the script in a code block. Add a brief explanation of what the script sets up and what each action does.

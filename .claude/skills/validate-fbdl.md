# Validate FBDL

Validate an FBDL script for correctness. Check the script against the FBDL grammar rules and report any errors found.

## Instructions

1. If the `validate_fbdl` MCP tool is available, use it for programmatic validation
2. Otherwise, manually check the script against every rule below
3. Report errors with line numbers and specific explanations
4. If the script is valid, confirm it and briefly describe what it does
5. If there are errors, show the corrected version

## Validation checklist

### Structure checks
- [ ] Script starts with `[setup]` on the first line
- [ ] The entire setup block is on a single line
- [ ] Each action is on its own line after the setup block
- [ ] No blank lines or comments within the setup block

### Entity checks
- [ ] Every entity type is one of: User, Page, Group, Album, Friendship, Business, App, Event
- [ ] Every entity (except Friendship) has a label
- [ ] Friendship has NO label
- [ ] All required params are present:
  - Page: owner
  - Group: owner, privacy
  - Album: owner, type, place
  - Friendship: sender, receivers
  - Business: owner
  - App: owner
  - Event: owner, place
- [ ] Enum params have valid values:
  - Group privacy: public | private | public_legacy
  - Group visibility: anyone | members_only
  - Album type: user | shared | page | group
  - Album privacy: public | friends_only | only_me | contributors_only | friends_of_contributors
  - App live: true | false
  - App type: business | workplace | consumer | instant_games | gaming | none
  - Event privacy: public | private
  - Event post_permission: admin | anyone
  - Event post_approval: on | off

### Action checks
- [ ] Every action name is a known FBDL action
- [ ] The subject (actor) of each action was defined in setup
- [ ] Voice switcher (`as`) is only used on actions that support it
- [ ] All required keyword params are present for each action
- [ ] Enum param values are valid for each action

### Reference checks
- [ ] Every label referenced in action params was defined earlier (in setup or a prior action)
- [ ] Users exist before being assigned as owners, members, or roles
- [ ] Friendships are established before friend-dependent actions (group_invite_friends, page_invite_friend, create_chat_group)

### Syntax checks
- [ ] Keyword blocks use `{key: value}` syntax with curly braces
- [ ] Lists use `[item1, item2]` bracket syntax
- [ ] String values use single quotes: `'text here'`
- [ ] Labels are PascalCase with no spaces
- [ ] No duplicate labels in the script

## Actions that support voice switcher

make_post_text, make_post_photo, make_post_video, make_post_poll, make_post_violation,
make_comment, block, remove_role, share_post, send_message, add_cover_photo, add_story,
create_album, add_photo, add_video, tag_photo, add_group_admins, add_group_moderators,
add_group_members, remove_member, mute_member, set_post_permission, set_admin_approval,
create_learning_unit, create_doc, create_event, request_crossposting, gen_token,
group_link_page, group_unlink_page, like_post, like_page

## Actions that do NOT support voice switcher

friend_user, friend_request, follow, unfollow, change_post_audience, deactivate_account,
lock_profile, going_event, create_collection, save_to_collection, add_collection_contributors,
create_page, unpublish_page, publish_page, set_age_restriction, create_group,
create_linked_group, add_page_facebook_access, add_page_task_access, create_business,
add_biz_employees, add_biz_admins, create_ad_account, create_shop, create_shop_item,
create_pixel, cancel_event, event_invite, add_event_cohosts, enable_professional_mode,
create_additional_profile, set_privacy_jurisdiction, banhammer_user, add_checkpoint,
add_contributors, add_business_location, add_page_community_managers, page_link_group,
page_invite_friend, group_invite_friends, make_anonymous_post, create_chat_group,
add_app_admins, add_app_developers, add_app_testers, add_app_analytics_users,
add_guardians, create_messenger_kids_account, create_quiz, pause_group, unpause_group,
add_biz_pages, biz_assign_page_role, biz_assign_partner_asset, biz_link_app,
biz_request_page_access, add_ad_admins, add_ad_advertisers, add_ad_analysts,
create_ar_permission_group

## Output format

If valid:
> Script is valid. It creates [brief description of setup] and performs [brief description of actions].

If errors found:
> Found N error(s):
> - Line X: [description of error]
> - Line Y: [description of error]
>
> Corrected script:
> ```
> [corrected script here]
> ```

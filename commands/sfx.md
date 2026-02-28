---
description: Manage sound effect themes
---

Help the user manage SFX sound themes. User arguments: $ARGUMENTS

Use these tools based on the argument:
- (no args) or 'list': sfx_list_themes - list all themes
- 'view [name]': sfx_view_theme - view theme details
- 'change <name>': sfx_change_theme - switch theme
- 'reload': sfx_reload_themes - reload from YAML
- 'test': sfx_test_sound - play announce sound
- 'sounds [filter]': sfx_list_sounds - list sound files
- 'play <file>': sfx_preview_sound - preview a sound
- 'create': Tell the user to run `opencode-sfx create` in their terminal for the interactive wizard with sound previews. If they want to stay in-session, use mcp_question to ask the user for: theme name, description, announce sound, question sound, idle sounds (multiple), error sounds (multiple). First use sfx_list_sounds to show available files. After gathering all info, call sfx_create_theme with the collected parameters.

Be concise. Show results clearly.

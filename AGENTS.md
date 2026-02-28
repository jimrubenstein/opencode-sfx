# AI Agent Installation Guide

This file helps AI coding agents install the OpenCode SFX plugin.

## What This Is

A sound effects plugin for AI coding agents (OpenCode, Claude Code, Gemini CLI, Codex) that plays audio notifications when the agent finishes a task, needs user input, or encounters an error. It includes built-in notification sounds that work out of the box.

## Automated Install

Run the installer with `--yes` to skip all interactive prompts:

```bash
git clone https://github.com/jimrubenstein/opencode-sfx.git ~/.config/opencode/plugins/opencode-sfx
cd ~/.config/opencode/plugins/opencode-sfx && ./install.sh --yes
```

This will:
1. Install npm dependencies
2. Add the plugin to `~/.config/opencode/opencode.json` (OpenCode)
3. Configure hooks in `~/.claude/settings.json` (Claude Code, if detected)
4. Configure hooks in `~/.gemini/settings.json` (Gemini CLI, if detected)
5. Configure notify in `~/.codex/config.toml` (Codex, if detected)
6. Install the `/sfx` command globally (OpenCode)

The user must restart their AI coding agent after installation.

## Manual Install (if the script fails)

1. Clone to any directory:
   ```bash
   git clone https://github.com/jimrubenstein/opencode-sfx.git ~/.config/opencode/plugins/opencode-sfx
   ```

2. Install dependencies:
   ```bash
   cd ~/.config/opencode/plugins/opencode-sfx && npm install
   ```

3. Add to `~/.config/opencode/opencode.json`:
   ```json
   {
     "plugin": [
       "~/.config/opencode/plugins/opencode-sfx/plugin.ts"
     ]
   }
   ```

4. Copy the slash command:
   ```bash
   cp ~/.config/opencode/plugins/opencode-sfx/commands/sfx.md ~/.config/opencode/commands/
   ```

## Requirements

- Node.js (for npm)
- git
- python3 (used by the installer to update JSON/TOML config files)
- At least one supported AI coding agent installed
- A system audio player (macOS `afplay`, Linux `paplay`/`aplay`, or Windows PowerShell)

## Post-Install

After the user restarts their agent, a startup chime should play. In OpenCode, the user can run `/sfx test` to verify.

To create a custom sound theme, the user can run `opencode-sfx create` in their terminal for an interactive wizard.

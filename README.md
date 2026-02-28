# OpenCode SFX

Sound effects for [OpenCode](https://opencode.ai). Get audio notifications when your AI agent finishes a task, needs your input, or hits an error — so you can context-switch without constantly checking your terminal.

Works out of the box with built-in notification sounds. Ships with 15 StarCraft-themed sound packs if you bring your own audio files.

## Install

**One-liner** (clones and configures everything):

```bash
curl -fsSL https://raw.githubusercontent.com/jimrubenstein/opencode-sfx/main/install.sh | bash
```

**Or clone and install manually:**

```bash
git clone https://github.com/jimrubenstein/opencode-sfx.git ~/.config/opencode/plugins/opencode-sfx
cd ~/.config/opencode/plugins/opencode-sfx
./install.sh
```

**Non-interactive** (for scripts and AI agents):

```bash
curl -fsSL https://raw.githubusercontent.com/jimrubenstein/opencode-sfx/main/install.sh | bash -s -- --yes
```

Restart OpenCode after installing. You'll hear a chime — that means it's working.

## What It Does

| Event | Sound | When |
|-------|-------|------|
| **Task complete** | Idle notification | Agent finished working (main agent only, not sub-agents) |
| **Permission needed** | Question ding | Agent needs your approval to proceed |
| **Error** | Error tone | Something went wrong |
| **Startup** | Announce chime | Plugin loaded, theme selected |

Sounds only play when **you're not looking at the terminal** (focus detection for WezTerm, tmux, and macOS). If you're already watching the agent work, it stays silent.

## Themes

A "default" theme with simple notification tones is included. No setup needed.

For more personality, the plugin ships with 15 StarCraft-themed sound packs:

| Theme | Unit |
|-------|------|
| `marine` | Terran infantry |
| `ghost` | Psionic operative |
| `siege-tank` | Arclite siege tank |
| `battlecruiser` | Capital ship |
| `wraith` | Terran starfighter |
| `scv` | Construction vehicle |
| `firebat` | Flame trooper |
| `goliath` | Assault walker |
| `vulture` | Hoverbike rider |
| `dropship` | Transport pilot |
| `science-vessel` | Research vessel |
| `advisor` | Base announcements |
| `raynor` | Jim Raynor |
| `kerrigan` | Sarah Kerrigan |
| `duke` | General Duke |

Each OpenCode instance gets a random theme. Multiple instances avoid picking the same one.

### Using StarCraft Themes

StarCraft sound files are not included (copyright). To use them:

1. Source your own StarCraft MP3 files (soundboard sites, game rips, etc.)
2. Place them in `~/sounds/starcraft/mp3_trimmed/` (or set `OCSFX_SOUNDS_PATH`)
3. Filenames must match those in the `themes/*.yaml` files

Once the sounds are in place, the plugin automatically rotates through StarCraft themes instead of using the default.

### Creating Custom Themes

**Interactive wizard** (recommended) — browse sounds, preview them, and build a theme:

```bash
opencode-sfx create
```

The wizard walks you through picking sounds for each event type (announce, question, idle, error), previews them inline, and writes the YAML file.

**Or create a YAML file manually** in `themes/`:

```yaml
name: My Theme
description: A custom sound theme

sounds:
  announce: startup_sound.mp3
  question: waiting_for_input.mp3
  idle:
    - task_complete_1.mp3
    - task_complete_2.mp3
  error:
    - error_sound.mp3
```

## CLI

The `opencode-sfx` command is available after installation:

```
opencode-sfx create    Interactive theme creation wizard
opencode-sfx help      Show help
```

## In-Session Commands

The `/sfx` command manages themes from inside OpenCode:

```
/sfx                  Show help and current theme
/sfx list             List all available themes
/sfx view [theme]     View theme details
/sfx change <theme>   Switch to a different theme
/sfx reload           Reload themes from YAML files
/sfx test             Play the current theme's announce sound
/sfx sounds [filter]  List sound files
/sfx play <file>      Preview a sound file
```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OCSFX_THEME` | Force a specific theme (e.g., `marine`) |
| `OCSFX_SOUNDS_PATH` | Custom path to sound files directory |
| `OCSFX_ALERT` | Custom tmux alert prefix (default: `!! `) |

### Theme Selection Priority

1. `OCSFX_THEME` environment variable
2. `.ocsfx` file in current directory (just the theme name)
3. TTY-to-profile mapping (persists per terminal session)
4. Random selection (prefers `default` if no custom sounds found)

### Manual Configuration

Add the plugin to your OpenCode config (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": [
    "/path/to/opencode-sfx/plugin.ts"
  ]
}
```

Copy the `/sfx` command globally:

```bash
cp /path/to/opencode-sfx/commands/sfx.md ~/.config/opencode/commands/
```

<details>
<summary><strong>Tmux Integration</strong></summary>

### Window Alerts

When a sound plays in a background tmux pane, the window name is prefixed with `!! ` (configurable via `OCSFX_ALERT`). This is cleared when:
- You switch to that pane
- You send a message or run a command in that pane

#### Keybinding: Clear Alert

Add to `~/.tmux.conf` to clear the alert prefix with `prefix + Enter`:

```tmux
bind-key Enter run-shell 'name="$(tmux display-message -p "##{window_name}")"; tmux rename-window "${name#!! }"'
```

### Status Bar: Agent Detection

Color-code tmux window tabs based on AI agent status:

| Color | Meaning |
|-------|---------|
| Blue (`#89b4fa`) | No agent present |
| Lavender (`#cba6f7`) | Agent idle (waiting for input) |
| Green (`#a6e3a1`) | Agent actively working |

Save as `~/.tmux/agent-status.sh` and `chmod +x`:

```sh
#!/bin/sh
# Detect AI agent status in a tmux window's panes and output a tmux
# style tag for a specific position in the tab.
#
# Usage: agent-status.sh <position> <window_id>
#   position: 1 = mid-separator, 2 = number bg, 3 = right-separator
#   window_id: tmux window identifier (e.g., @0)

position="$1"
window_id="$2"

if [ -z "$window_id" ] || [ -z "$position" ]; then
  echo ""
  exit 0
fi

gray="#313244"
cache_file="/tmp/tmux-agent-status-${window_id#@}"

if [ -f "$cache_file" ]; then
  cache_age=$(( $(date +%s) - $(stat -f %m "$cache_file" 2>/dev/null || echo 0) ))
  if [ "$cache_age" -lt 2 ]; then
    accent=$(cat "$cache_file")
  fi
fi

if [ -z "$accent" ]; then
  agent_status=0  # 0=none, 1=idle, 2=active

  for pane_id in $(tmux list-panes -t "$window_id" -F '#{pane_id}' 2>/dev/null); do
    last_lines=$(tmux capture-pane -p -t "$pane_id" 2>/dev/null | tail -5)

    case "$last_lines" in
      *"esc interrupt"*|*"esc to interrupt"*)
        agent_status=2
        break
        ;;
    esac

    case "$last_lines" in
      *"ctrl+p commands"*)
        agent_status=1
        ;;
    esac
  done

  case "$agent_status" in
    2) accent="#a6e3a1" ;;  # green — active
    1) accent="#cba6f7" ;;  # lavender — idle
    *) accent="#89b4fa" ;;  # blue — none
  esac

  printf '%s' "$accent" > "$cache_file"
fi

case "$position" in
  1) printf '#[fg=%s,bg=%s,nobold,nounderscore,noitalics]' "$accent" "$gray" ;;
  2) printf '#[fg=%s,bg=%s]' "$gray" "$accent" ;;
  3) printf '#[fg=%s,bg=default]' "$accent" ;;
esac
```

Wire into your tab format (after TPM initializes for Catppuccin):

```tmux
run-shell 'tmux setw -g window-status-format "#[fg=#313244,bg=default,nobold,nounderscore,noitalics]#[fg=#cdd6f4,bg=#313244]##W##(~/.tmux/agent-status.sh 1 ##{window_id}) █##(~/.tmux/agent-status.sh 2 ##{window_id})##I##(~/.tmux/agent-status.sh 3 ##{window_id}) "'
```

Cache is per-window for 2 seconds to avoid redundant detection.

</details>

<details>
<summary><strong>How Focus Detection Works</strong></summary>

The plugin detects if you're looking at the terminal to avoid playing sounds unnecessarily:

1. **WezTerm**: Checks if the specific WezTerm window and pane are focused
2. **Tmux**: Checks if the specific tmux session/window/pane is active
3. **Fallback (macOS)**: Checks if any terminal app is the frontmost application

Sounds only play when the pane is NOT active.

</details>

## License

MIT

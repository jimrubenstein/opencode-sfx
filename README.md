# OpenCode SFX

Sound effects plugin for [OpenCode](https://opencode.ai) with StarCraft-themed audio notifications.

Plays sound effects when:
- **Session becomes idle** - Agent finished working (main agent only, not sub-agents)
- **Permission requested** - Agent needs approval to proceed
- **Session error** - Something went wrong

Also features:
- Per-terminal theme persistence (same terminal always gets same theme)
- Tmux window alerts (`!! ` prefix) when sounds play in background panes
- Focus detection to avoid playing sounds when you're already looking at the terminal

## Setup

### Quick Install

```bash
git clone https://github.com/jimrubenstein/opencode-sfx.git
cd opencode-sfx
./install.sh
```

The installer will:
1. Install npm dependencies
2. Find your OpenCode config and add the plugin
3. Optionally install the `/sfx` command globally

### Sound Files

Sound files are not included in this repository. You need to provide your own StarCraft sound files.

Place MP3 files in `~/sounds/starcraft/mp3_trimmed/` (or set `OCSFX_SOUNDS_PATH` to a custom path).

The filenames should match those referenced in the `themes/*.yaml` files.

### Manual Install

If you prefer to configure manually, add the plugin to your OpenCode config (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": [
    "/path/to/opencode-sfx/plugin.ts"
  ]
}
```

Then copy the `/sfx` command to your global commands directory:

```bash
cp /path/to/opencode-sfx/commands/sfx.md ~/.config/opencode/commands/
```

## Themes

Each theme is defined in a YAML file under `themes/`. Available themes:

| Theme | Description |
|-------|-------------|
| `goliath` | Heavy assault walker |
| `siege-tank` | Arclite siege tank commander |
| `marine` | Terran infantry |
| `ghost` | Psionic operative |
| `wraith` | Terran starfighter |
| `battlecruiser` | Capital ship commander |
| `scv` | Space construction vehicle |
| `firebat` | Flame trooper |
| `dropship` | Transport pilot |
| `advisor` | Base announcements |
| `raynor` | Jim Raynor - Mar Sara marshal |
| `kerrigan` | Sarah Kerrigan - Ghost operative |
| `duke` | General Duke - Confederate general |
| `science-vessel` | Research vessel |
| `vulture` | Hoverbike rider |

### Theme Selection Priority

1. `OCSFX_THEME` environment variable
2. `.ocsfx` file in current directory (just the theme name)
3. TTY-to-profile mapping (persists per terminal session)
4. Random selection (avoiding themes used by other running instances)

### Creating Custom Themes

Create a new YAML file in `themes/`:

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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OCSFX_THEME` | Force a specific theme (e.g., `marine`) |
| `OCSFX_SOUNDS_PATH` | Custom path to sound files directory |
| `OCSFX_ALERT` | Custom tmux alert prefix (default: `!! `) |

## Commands

### `/sfx` - Theme Management

Manage sound effect themes at runtime.

```
/sfx                  - Show help and current theme
/sfx list             - List all available themes
/sfx view [theme]     - View theme details (default: current)
/sfx change <theme>   - Switch to a different theme
/sfx reload           - Reload themes from YAML files
/sfx test             - Play the current theme's announce sound
/sfx create           - Start interactive theme creation wizard
/sfx sounds [dir]     - List sound files in directory
/sfx play <file>      - Preview a sound file
```

**Examples:**
```
/sfx list              # See all themes (* marks current)
/sfx view marine       # See details of the marine theme
/sfx change ghost      # Switch to ghost theme
/sfx reload            # Pick up changes to YAML files
/sfx create            # Start wizard to create a new theme
/sfx sounds            # List available sound files
/sfx play startup.mp3  # Preview a specific sound
```

### Theme Creation Wizard

The `/sfx create` command starts an interactive wizard that guides you through creating a new theme. The AI assistant will:

1. Ask you to name the theme
2. Ask for a description
3. Show available sound files and let you select:
   - **Announce sound** - Played on startup
   - **Question sound** - Played when waiting for input
   - **Idle sounds** - Played when tasks complete (multiple)
   - **Error sounds** - Played on errors (multiple)
4. Create the YAML file and reload themes

Each sound is previewed when selected so you can hear what you're choosing.

## How It Works

### Theme Caching

Themes are loaded from YAML on first run and cached to `.cache/themes.json`. The cache is automatically invalidated when any theme file is modified.

### Focus Detection

The plugin detects if you're currently looking at the terminal:

1. **WezTerm**: Checks if the specific WezTerm window is focused
2. **Tmux**: Checks if the specific tmux pane is active
3. **Fallback**: Checks if any terminal app is frontmost

Sounds only play when the pane is NOT active (you're looking elsewhere).

### Tmux Alerts

When a sound plays in a background tmux pane, the window name is prefixed with `!! ` (configurable via `OCSFX_ALERT`) to visually indicate attention is needed. This is cleared when:
- You switch to that pane
- You send a message or run a command in that pane
- A new event fires while you're viewing the pane

#### Keybinding: Clear Alert

Add this to your `~/.tmux.conf` to clear the alert prefix with `prefix + Enter`:

```tmux
bind-key Enter run-shell 'name="$(tmux display-message -p "##{window_name}")"; tmux rename-window "${name#!! }"'
```

If you've customized `OCSFX_ALERT`, replace `!! ` with your prefix.

#### Status Bar: Agent Detection

The script below color-codes tmux window tabs based on AI agent status by inspecting pane content:

| Color | Meaning |
|-------|---------|
| Blue (`#89b4fa`) | No agent present |
| Lavender (`#cba6f7`) | Agent idle (waiting for input) |
| Green (`#a6e3a1`) | Agent actively working |

Save this as `~/.tmux/agent-status.sh` and make it executable (`chmod +x`):

```sh
#!/bin/sh
# Detect AI agent status in a tmux window's panes and output a tmux
# style tag (#[fg=X,bg=Y,...]) for a specific position in the tab.
#
# Detection is content-based — checks pane content for TUI status text:
#   "esc interrupt" / "esc to interrupt" = agent actively working
#   "ctrl+p commands" = agent idle, waiting for input (OpenCode)
#
# Usage: agent-status.sh <position> <window_id>
#   position: 1 = mid-separator style (fg=accent, bg=gray)
#             2 = number background style (fg=gray, bg=accent)
#             3 = right-separator style (fg=accent, bg=default)
#   window_id: tmux window identifier (e.g., @0)
#
# Accent colors (Catppuccin Mocha):
#   Blue     (#89b4fa) = no agent
#   Lavender (#cba6f7) = agent idle
#   Green    (#a6e3a1) = agent active
#
# Results are cached per window in /tmp/tmux-agent-status-<window_id>
# so that all 3 position calls share one detection pass.

position="$1"
window_id="$2"

if [ -z "$window_id" ] || [ -z "$position" ]; then
  echo ""
  exit 0
fi

# --- Catppuccin Mocha constants ---
gray="#313244"

# --- Cache: reuse detection result within the same status-interval ---
cache_file="/tmp/tmux-agent-status-${window_id#@}"

if [ -f "$cache_file" ]; then
  cache_age=$(( $(date +%s) - $(stat -f %m "$cache_file" 2>/dev/null || echo 0) ))
  if [ "$cache_age" -lt 2 ]; then
    accent=$(cat "$cache_file")
  fi
fi

if [ -z "$accent" ]; then
  # --- Detect agent status ---
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

  # --- Pick accent color ---
  case "$agent_status" in
    2) accent="#a6e3a1" ;;  # green — active
    1) accent="#cba6f7" ;;  # lavender — idle
    *) accent="#89b4fa" ;;  # blue — none
  esac

  printf '%s' "$accent" > "$cache_file"
fi

# --- Output style tag for the requested position ---
case "$position" in
  1) printf '#[fg=%s,bg=%s,nobold,nounderscore,noitalics]' "$accent" "$gray" ;;
  2) printf '#[fg=%s,bg=%s]' "$gray" "$accent" ;;
  3) printf '#[fg=%s,bg=default]' "$accent" ;;
esac
```

Then wire it into your tab format. This example is for Catppuccin — add it **after** TPM initializes so it overrides the theme's default format:

```tmux
# Must come after: run '~/.tmux/plugins/tpm/tpm'
run-shell 'tmux setw -g window-status-format "#[fg=#313244,bg=default,nobold,nounderscore,noitalics]#[fg=#cdd6f4,bg=#313244]##W##(~/.tmux/agent-status.sh 1 ##{window_id}) █##(~/.tmux/agent-status.sh 2 ##{window_id})##I##(~/.tmux/agent-status.sh 3 ##{window_id}) "'
```

The script caches results per window for 2 seconds to avoid redundant detection across the 3 position calls within each status interval.

## License

MIT

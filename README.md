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

### 1. Install dependencies

```bash
cd ~/work/opencode-sfx
npm install
```

### 2. Add sound files

Sound files are not included in this repository. You need to provide your own StarCraft sound files.

Place MP3 files in `~/sounds/starcraft/mp3_trimmed/` (or set `OC_SFX_SOUNDS_DIR` to a custom path).

The filenames should match those referenced in the `themes/*.yaml` files.

### 3. Configure OpenCode

Add the plugin to your OpenCode config (`~/.config/opencode/config.json`):

```json
{
  "plugins": [
    "~/work/opencode-sfx/plugin.ts"
  ]
}
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

1. `OCSFX_PROFILE` environment variable
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
| `OCSFX_PROFILE` | Force a specific theme (e.g., `marine`) |
| `OC_SFX_SOUNDS_DIR` | Custom path to sound files directory |

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

### `/ak` - Acknowledge

Clear the tmux alert prefix (`!! `) from the window name.

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

When a sound plays in a background tmux pane, the window name is prefixed with `!! ` to visually indicate attention is needed. This is cleared when:
- You switch to that pane
- You run the `/ak` command
- A new event fires while you're viewing the pane

## License

MIT

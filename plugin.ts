import type { Plugin } from "@opencode-ai/plugin"
import { homedir } from "os"
import { join } from "path"
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs"
import { execSync } from "child_process"
import { loadThemes, getThemeNames, getTheme, reloadThemes, type SoundTheme } from "./lib/themes.js"
import { playSound as playSoundLib, isDebugMode, isTestMode } from "./lib/sound-player.js"

// =============================================================================
// CONFIGURATION
// =============================================================================

// Default sounds directory - can be overridden via OC_SFX_SOUNDS_DIR env var
const DEFAULT_SOUNDS_DIR = join(homedir(), "sounds/starcraft/mp3_trimmed")
const SOUNDS_DIR = process.env.OC_SFX_SOUNDS_DIR || DEFAULT_SOUNDS_DIR

// State directory for instance tracking and TTY profiles
const STATE_DIR = join(homedir(), ".config/opencode/.opencode-sfx")
const INSTANCE_ID = process.pid.toString()

// Environment variable for explicit profile selection
const ENV_PROFILE = "OCSFX_PROFILE"
// Per-directory profile file (optional, for per-project explicit config)
const PROFILE_FILE = ".ocsfx"
// TTY-to-profile mapping stored in home directory
const TTY_PROFILES_FILE = join(STATE_DIR, "tty-profiles.json")

// =============================================================================
// WINDOW FOCUS DETECTION & TMUX ALERT
// =============================================================================

// Cached window info captured at startup
let cachedWindowId: number | null = null
let cachedWindowTitle: string | null = null
let cachedTmuxWindowName: string | null = null
let hasAlert = false

const ALERT_PREFIX = "!! "

// Capture our window info at startup (call this once during plugin init)
function captureWindowInfo(): void {
  // Capture WezTerm window info
  if (process.env.WEZTERM_PANE !== undefined) {
    try {
      const paneInfo = execSync(`wezterm cli list --format json`, {
        encoding: "utf-8",
        timeout: 1000,
      })
      const panes = JSON.parse(paneInfo)
      const ourPane = panes.find(
        (p: any) => p.pane_id === parseInt(process.env.WEZTERM_PANE || "0")
      )
      if (ourPane) {
        cachedWindowId = ourPane.window_id
        cachedWindowTitle = ourPane.window_title
      }
    } catch {
      // Ignore errors during capture
    }
  }

  // Capture tmux window name
  if (process.env.TMUX && process.env.TMUX_PANE) {
    try {
      cachedTmuxWindowName = execSync(
        `tmux display-message -t "${process.env.TMUX_PANE}" -p '#{window_name}'`,
        { encoding: "utf-8", timeout: 1000 }
      ).trim()
    } catch {
      // Ignore errors
    }
  }
}

// Add alert prefix to tmux window name
function setTmuxAlert(): void {
  if (!process.env.TMUX || !process.env.TMUX_PANE || hasAlert) return

  try {
    const currentName = execSync(
      `tmux display-message -t "${process.env.TMUX_PANE}" -p '#{window_name}'`,
      { encoding: "utf-8", timeout: 1000 }
    ).trim()

    // Don't add if already has alert prefix
    if (currentName.startsWith(ALERT_PREFIX)) return

    execSync(
      `tmux rename-window -t "${process.env.TMUX_PANE}" "${ALERT_PREFIX}${currentName}"`,
      { encoding: "utf-8", timeout: 1000 }
    )
    hasAlert = true
  } catch {
    // Ignore errors
  }
}

// Remove alert prefix from tmux window name
function clearTmuxAlert(): void {
  if (!process.env.TMUX || !process.env.TMUX_PANE || !hasAlert) return

  try {
    const currentName = execSync(
      `tmux display-message -t "${process.env.TMUX_PANE}" -p '#{window_name}'`,
      { encoding: "utf-8", timeout: 1000 }
    ).trim()

    // Only remove if it has our alert prefix
    if (currentName.startsWith(ALERT_PREFIX)) {
      const originalName = currentName.slice(ALERT_PREFIX.length)
      execSync(
        `tmux rename-window -t "${process.env.TMUX_PANE}" "${originalName}"`,
        { encoding: "utf-8", timeout: 1000 }
      )
    }
    hasAlert = false
  } catch {
    // Ignore errors
  }
}

// Check if this specific pane/window is active
// Returns true if user is looking at this instance, false if they should be notified
function isPaneActive(): boolean {
  // If we have WezTerm window info, use the multi-stage check
  if (cachedWindowId !== null) {
    // Stage 1: Is our WezTerm window the active window?
    const ourWindowActive = isOurWezTermWindowActive()

    if (!ourWindowActive) {
      // Our window is not active - user is not looking at us
      return false
    }

    // Stage 2: Our window IS active. Are we in tmux?
    if (process.env.TMUX) {
      // Stage 3: Check if our tmux pane is active
      return isTmuxPaneActive()
    }

    // Not in tmux, and our window is active - user is looking at us
    return true
  }

  // Fallback: just check tmux if available
  if (process.env.TMUX) {
    return isTmuxPaneActive()
  }

  // Last resort: check if any terminal is focused
  return isTerminalAppFocused()
}

// Check if our specific WezTerm window is the active/focused window
function isOurWezTermWindowActive(): boolean {
  try {
    // First check if WezTerm is even the frontmost app
    const frontApp = execSync(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      { encoding: "utf-8", timeout: 1000 }
    ).trim()

    if (!frontApp.toLowerCase().includes("wezterm")) {
      return false // WezTerm not focused at all
    }

    // Get the focused WezTerm window title
    const focusedTitle = execSync(
      `osascript -e 'tell application "System Events" to tell process "wezterm-gui" to get name of front window'`,
      { encoding: "utf-8", timeout: 1000 }
    ).trim()

    // Get current title for our cached window_id (title may have changed)
    const paneInfo = execSync(`wezterm cli list --format json`, {
      encoding: "utf-8",
      timeout: 1000,
    })
    const panes = JSON.parse(paneInfo)

    // Find panes in our window
    const ourWindowPanes = panes.filter(
      (p: any) => p.window_id === cachedWindowId
    )
    if (ourWindowPanes.length === 0) return true // Can't find our window, assume active

    // Our window's current title
    const ourCurrentTitle = ourWindowPanes[0].window_title

    // Is the focused window title the same as our window's title?
    return focusedTitle === ourCurrentTitle
  } catch {
    return true // Assume active on error
  }
}

// Check if this specific tmux pane is active
// Must check: session is attached AND window is active AND pane is active
function isTmuxPaneActive(): boolean {
  try {
    const tmuxPane = process.env.TMUX_PANE
    if (!tmuxPane) return true // No pane ID, assume active

    // Query the specific pane using its ID
    const result = execSync(
      `tmux display-message -t "${tmuxPane}" -p '#{session_attached} #{window_active} #{pane_active}'`,
      { encoding: "utf-8", timeout: 1000 }
    ).trim()
    const [sessionAttached, windowActive, paneActive] = result.split(" ")

    // All three must be true for this pane to be "active" (user looking at it)
    return sessionAttached === "1" && windowActive === "1" && paneActive === "1"
  } catch {
    return true // Assume active on error
  }
}

// Terminal app names to detect (fallback when not in wezterm)
const TERMINAL_APPS = [
  "wezterm-gui",
  "WezTerm",
  "Terminal",
  "iTerm2",
  "iTerm",
  "Alacritty",
  "kitty",
  "Ghostty",
  "Hyper",
]

// Check if a terminal app is currently focused (fallback)
function isTerminalAppFocused(): boolean {
  try {
    const result = execSync(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      { encoding: "utf-8", timeout: 1000 }
    ).trim()
    return TERMINAL_APPS.some((app) =>
      result.toLowerCase().includes(app.toLowerCase())
    )
  } catch {
    return true
  }
}

// Current theme info for logging (set during plugin init)
let currentThemeForLogging: string = ""

// Fire-and-forget sound playback (non-blocking)
// Only plays if this pane is NOT active, also sets tmux alert
function playSound(soundPath: string, event?: string, reason?: string): void {
  if (isPaneActive()) {
    return // Don't play sound if this pane is active
  }
  // Set tmux alert when playing sound
  setTmuxAlert()
  playSoundLib(soundPath, {
    theme: currentThemeForLogging,
    event,
    reason,
  })
}

// Always play sound regardless of focus
function playSoundAlways(soundPath: string, event?: string, reason?: string): void {
  playSoundLib(soundPath, {
    theme: currentThemeForLogging,
    event,
    reason,
    force: true,
  })
}

// =============================================================================
// TTY IDENTIFICATION
// =============================================================================

// Get a unique identifier for the current terminal session
// Combines multiple identifiers to be unique per terminal instance
function getTtyIdentifier(): string | null {
  const parts: string[] = []

  // TERM_SESSION_ID - UUID set by macOS Terminal.app and iTerm2
  // This is unique per terminal tab/session and doesn't get recycled
  if (process.env.TERM_SESSION_ID) {
    parts.push(`term:${process.env.TERM_SESSION_ID}`)
  }

  // iTerm2 session ID (also a UUID)
  if (process.env.ITERM_SESSION_ID) {
    parts.push(`iterm:${process.env.ITERM_SESSION_ID}`)
  }

  // TMUX - format is "socket_path,server_pid,window_index"
  // Combined with TMUX_PANE and server start time, this uniquely identifies a tmux pane
  // The server_pid + start_time ensures uniqueness across tmux server restarts
  if (process.env.TMUX && process.env.TMUX_PANE) {
    // Extract server PID from TMUX
    const tmuxParts = process.env.TMUX.split(",")
    const serverPid = tmuxParts.length >= 2 ? tmuxParts[1] : "unknown"

    // Get tmux server start time for extra uniqueness
    let startTime = ""
    try {
      startTime = execSync("tmux display-message -p '#{start_time}'", {
        encoding: "utf-8",
        timeout: 1000,
      }).trim()
    } catch {
      // Ignore errors, PID alone is usually sufficient
    }

    if (startTime) {
      parts.push(`tmux:${serverPid}:${startTime}:${process.env.TMUX_PANE}`)
    } else {
      parts.push(`tmux:${serverPid}:${process.env.TMUX_PANE}`)
    }
  }

  // WEZTERM_PANE - unique within WezTerm process
  // Combine with WEZTERM_UNIX_SOCKET if available for uniqueness across restarts
  if (process.env.WEZTERM_PANE) {
    const socket = process.env.WEZTERM_UNIX_SOCKET || ""
    // Extract a unique part from socket path (contains pid or timestamp)
    const socketId = socket.split("/").pop() || ""
    parts.push(`wezterm:${socketId}:${process.env.WEZTERM_PANE}`)
  }

  // If we have any identifiers, join them
  if (parts.length > 0) {
    return parts.join("+")
  }

  // Fallback: try tty device path (less reliable, gets recycled)
  try {
    if (process.stdin.isTTY) {
      const ttyPath = execSync("tty", {
        encoding: "utf-8",
        timeout: 1000,
      }).trim()
      if (ttyPath && ttyPath !== "not a tty") {
        return `tty:${ttyPath}`
      }
    }
  } catch {
    // Ignore errors
  }

  // Last resort fallbacks
  if (process.env.WINDOWID) {
    return `x11:${process.env.WINDOWID}`
  }

  return null
}

// =============================================================================
// TTY PROFILE MANAGEMENT
// =============================================================================

interface TtyProfiles {
  profiles: Record<string, string> // tty identifier -> profile name
}

function ensureStateDir(): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true })
  }
}

function loadTtyProfiles(): TtyProfiles {
  ensureStateDir()
  if (existsSync(TTY_PROFILES_FILE)) {
    try {
      return JSON.parse(readFileSync(TTY_PROFILES_FILE, "utf-8"))
    } catch {
      return { profiles: {} }
    }
  }
  return { profiles: {} }
}

function saveTtyProfiles(data: TtyProfiles): void {
  ensureStateDir()
  writeFileSync(TTY_PROFILES_FILE, JSON.stringify(data, null, 2))
}

function getTtyProfile(tty: string): string | null {
  const data = loadTtyProfiles()
  return data.profiles[tty] || null
}

function setTtyProfile(tty: string, profile: string): void {
  const data = loadTtyProfiles()
  data.profiles[tty] = profile
  saveTtyProfiles(data)
}

// Read optional per-directory .ocsfx (just a profile name, no JSON needed)
function readDirectoryProfile(): string | null {
  const profilePath = join(process.cwd(), PROFILE_FILE)
  if (existsSync(profilePath)) {
    try {
      return readFileSync(profilePath, "utf-8").trim()
    } catch {
      return null
    }
  }
  return null
}

// =============================================================================
// INSTANCE STATE MANAGEMENT
// =============================================================================

interface InstanceState {
  instances: Record<string, { theme: string; startedAt: string }>
}

const INSTANCES_FILE = join(STATE_DIR, "instances.json")

function loadState(): InstanceState {
  ensureStateDir()
  if (existsSync(INSTANCES_FILE)) {
    try {
      return JSON.parse(readFileSync(INSTANCES_FILE, "utf-8"))
    } catch {
      return { instances: {} }
    }
  }
  return { instances: {} }
}

function saveState(state: InstanceState): void {
  ensureStateDir()
  writeFileSync(INSTANCES_FILE, JSON.stringify(state, null, 2))
}

function cleanupStaleInstances(state: InstanceState): void {
  // Remove instances older than 24 hours (likely stale)
  const now = Date.now()
  const maxAge = 24 * 60 * 60 * 1000
  for (const [pid, info] of Object.entries(state.instances)) {
    const startedAt = new Date(info.startedAt).getTime()
    if (now - startedAt > maxAge) {
      delete state.instances[pid]
    }
  }
}

function getAvailableThemes(state: InstanceState): string[] {
  const usedThemes = new Set(Object.values(state.instances).map((i) => i.theme))
  const allThemes = getThemeNames()
  const available = allThemes.filter((t) => !usedThemes.has(t))
  // If all themes are used, return all themes (will pick randomly)
  return available.length > 0 ? available : allThemes
}

// Determine the profile using priority:
// 1. OCSFX_PROFILE env var (explicit selection, highest priority)
// 2. .ocsfx file in cwd (explicit per-project config)
// 3. TTY-to-profile mapping in home dir (persists across directories in same terminal)
// 4. Random selection (saves to TTY mapping for persistence)
function determineProfile(): { profile: string; source: string } {
  const allThemes = getThemeNames()

  // 1. Check environment variable first
  const envProfile = process.env[ENV_PROFILE]
  if (envProfile && allThemes.includes(envProfile)) {
    return { profile: envProfile, source: "env" }
  }

  // 2. Check .ocsfx in current directory
  const dirProfile = readDirectoryProfile()
  if (dirProfile && allThemes.includes(dirProfile)) {
    return { profile: dirProfile, source: "file" }
  }

  // 3. Check TTY-to-profile mapping
  const currentTty = getTtyIdentifier()
  if (currentTty) {
    const ttyProfile = getTtyProfile(currentTty)
    if (ttyProfile && allThemes.includes(ttyProfile)) {
      return { profile: ttyProfile, source: "tty" }
    }
  }

  // 4. Random selection - try to avoid duplicates with other instances
  const state = loadState()
  cleanupStaleInstances(state)
  const availableThemes = getAvailableThemes(state)
  const randomProfile =
    availableThemes[Math.floor(Math.random() * availableThemes.length)]

  // Save to TTY mapping for persistence (if we have a TTY identifier)
  if (currentTty) {
    setTtyProfile(currentTty, randomProfile)
  }

  return { profile: randomProfile, source: "random" }
}

function assignThemeToInstance(): { theme: string; source: string } {
  const state = loadState()
  cleanupStaleInstances(state)

  // Check if this instance already has a theme (same PID reusing)
  if (state.instances[INSTANCE_ID]) {
    return { theme: state.instances[INSTANCE_ID].theme, source: "instance" }
  }

  // Determine profile using priority: env > file > tty > random
  const { profile, source } = determineProfile()

  // Register this instance with the selected theme
  state.instances[INSTANCE_ID] = {
    theme: profile,
    startedAt: new Date().toISOString(),
  }
  saveState(state)

  return { theme: profile, source }
}

function removeInstance(): void {
  const state = loadState()
  delete state.instances[INSTANCE_ID]
  saveState(state)
}

// =============================================================================
// SOUND PLAYBACK HELPERS
// =============================================================================

function randomSound(sounds: string[]): string | null {
  if (!sounds || sounds.length === 0) {
    return null
  }
  return sounds[Math.floor(Math.random() * sounds.length)]
}

// =============================================================================
// PLUGIN EXPORT
// =============================================================================

export const OpenCodeSFX: Plugin = async ({ $, client }) => {
  // Capture window info at startup for focus detection
  captureWindowInfo()

  // Load themes from YAML (with caching)
  let themes = loadThemes()
  let themeNames = Object.keys(themes)

  if (themeNames.length === 0) {
    await client.app.log({
      body: {
        service: "opencode-sfx",
        level: "error",
        message: "No themes found! Check that themes/*.yaml files exist.",
      },
    })
    return {}
  }

  const { theme: initialTheme, source } = assignThemeToInstance()
  let currentThemeKey = initialTheme
  let currentTheme = themes[currentThemeKey]
  currentThemeForLogging = currentThemeKey

  if (!currentTheme) {
    await client.app.log({
      body: {
        service: "opencode-sfx",
        level: "error",
        message: `Theme "${currentThemeKey}" not found in loaded themes`,
        extra: { availableThemes: themeNames },
      },
    })
    return {}
  }

  // Log the assigned theme with source info
  const sourceLabel =
    source === "env"
      ? "from OCSFX_PROFILE"
      : source === "file"
        ? "from .ocsfx"
        : source === "tty"
          ? "from terminal session"
          : source === "instance"
            ? "existing instance"
            : "randomly selected"

  await client.app.log({
    body: {
      service: "opencode-sfx",
      level: "info",
      message: `OpenCode SFX: ${currentTheme.name} (${currentTheme.description}) [${sourceLabel}]`,
      extra: { theme: currentThemeKey, source, pid: INSTANCE_ID, tty: getTtyIdentifier() },
    },
  })

  // Helper to switch themes
  const switchTheme = (newThemeKey: string): { success: boolean; message: string } => {
    const newTheme = themes[newThemeKey]
    if (!newTheme) {
      return { success: false, message: `Theme "${newThemeKey}" not found` }
    }
    currentThemeKey = newThemeKey
    currentTheme = newTheme
    currentThemeForLogging = newThemeKey
    
    // Update TTY profile for persistence
    const tty = getTtyIdentifier()
    if (tty) {
      setTtyProfile(tty, newThemeKey)
    }
    
    // Play announcement sound
    const announceFile = randomSound(currentTheme.sounds.announce)
    if (announceFile) {
      const announcePath = join(SOUNDS_DIR, announceFile)
      if (existsSync(announcePath)) {
        playSoundAlways(announcePath, "theme.switch", "theme changed")
      }
    }
    
    return { success: true, message: `Switched to ${currentTheme.name} (${currentTheme.description})` }
  }

  // Play the announcement sound on startup (always, regardless of focus)
  const announceFile = randomSound(currentTheme.sounds.announce)
  if (announceFile) {
    const announcePath = join(SOUNDS_DIR, announceFile)
    if (existsSync(announcePath)) {
      playSoundAlways(announcePath, "startup", "plugin initialized")
    }
  }

  // Cleanup on exit
  const cleanup = () => {
    clearTmuxAlert()
    removeInstance()
  }
  process.on("exit", cleanup)
  process.on("SIGINT", () => {
    cleanup()
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    cleanup()
    process.exit(0)
  })

  return {
    // Tools for managing themes (used by /sfx command via AI)
    tool: {
      sfx_list_themes: {
        description: "List all available SFX sound themes",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async () => {
          themes = loadThemes()
          themeNames = Object.keys(themes).sort()
          
          const lines = [`Available themes (current: ${currentThemeKey}):`, ""]
          for (const key of themeNames) {
            const theme = themes[key]
            const marker = key === currentThemeKey ? "* " : "  "
            lines.push(`${marker}${key} - ${theme.name} (${theme.description})`)
          }
          lines.push("", `Total: ${themeNames.length} themes`)
          return lines.join("\n")
        },
      },

      sfx_view_theme: {
        description: "View details of a specific theme",
        parameters: {
          type: "object",
          properties: {
            theme: {
              type: "string",
              description: "Theme key to view. Defaults to current theme.",
            },
          },
        },
        execute: async ({ theme: themeKey }: { theme?: string }) => {
          const key = themeKey || currentThemeKey
          const theme = themes[key]
          if (!theme) {
            return `Error: Theme "${key}" not found`
          }
          
          const isCurrent = key === currentThemeKey ? " (current)" : ""
          const lines = [
            `Theme: ${theme.name}${isCurrent}`,
            `Key: ${key}`,
            `Description: ${theme.description}`,
            "",
            "Sounds:",
            `  Announce (${theme.sounds.announce.length}): ${theme.sounds.announce.join(", ")}`,
            `  Question (${theme.sounds.question.length}): ${theme.sounds.question.join(", ")}`,
            `  Idle (${theme.sounds.idle.length}): ${theme.sounds.idle.join(", ")}`,
            `  Error (${theme.sounds.error.length}): ${theme.sounds.error.join(", ")}`,
          ]
          return lines.join("\n")
        },
      },

      sfx_change_theme: {
        description: "Switch to a different sound theme. Call with theme parameter set to the theme key (e.g., 'marine', 'ghost', 'comedy-annoyed').",
        parameters: {
          type: "object",
          properties: {
            theme: {
              type: "string",
              description: "Theme key to switch to (e.g., 'marine', 'ghost')",
            },
          },
          required: ["theme"],
        },
        execute: async ({ theme: themeKey }: { theme: string }) => {
          if (!themeKey) {
            return `Error: 'theme' parameter is required. Available themes: ${Object.keys(themes).join(", ")}`
          }
          const result = switchTheme(themeKey)
          return result.message
        },
      },

      sfx_reload_themes: {
        description: "Reload all themes from YAML files",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async () => {
          themes = reloadThemes()
          themeNames = Object.keys(themes).sort()
          
          const updatedTheme = themes[currentThemeKey]
          if (updatedTheme) {
            currentTheme = updatedTheme
          }
          
          return `Reloaded ${themeNames.length} themes: ${themeNames.join(", ")}`
        },
      },

      sfx_test_sound: {
        description: "Play the current theme's announce sound",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async () => {
          const soundFile = randomSound(currentTheme.sounds.announce)
          if (!soundFile) {
            return `Error: No announce sounds configured for theme ${currentThemeKey}`
          }
          const soundPath = join(SOUNDS_DIR, soundFile)
          if (existsSync(soundPath)) {
            playSoundAlways(soundPath, "test", "user requested test")
            return `Playing: ${soundFile} (theme: ${currentThemeKey})`
          }
          return `Error: Sound file not found: ${soundPath}`
        },
      },

      sfx_create_theme: {
        description: "Create a new SFX sound theme. Provide all the sound selections as parameters. Use sfx_list_sounds first to see available files.",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Display name for the theme (e.g., 'My Custom Theme')",
            },
            description: {
              type: "string",
              description: "Short description of the theme",
            },
            announce: {
              type: "string",
              description: "Sound file for announce (played on startup)",
            },
            question: {
              type: "string",
              description: "Sound file for question (played when waiting for input)",
            },
            idle: {
              type: "array",
              items: { type: "string" },
              description: "Array of sound files for idle (played when task completes)",
            },
            error: {
              type: "array",
              items: { type: "string" },
              description: "Array of sound files for error (played on errors)",
            },
          },
          required: ["name", "announce", "question", "idle", "error"],
        },
        execute: async ({ name: themeName, description = "Custom sound theme", announce: announceSound, question: questionSound, idle: idleSounds, error: errorSounds }: { name: string; description?: string; announce: string; question: string; idle: string[]; error: string[] }) => {
          // Validate required parameters
          if (!themeName) {
            return "Error: 'name' parameter is required"
          }
          if (!announceSound) {
            return "Error: 'announce' parameter is required"
          }
          if (!questionSound) {
            return "Error: 'question' parameter is required"
          }
          if (!idleSounds || !Array.isArray(idleSounds) || idleSounds.length === 0) {
            return "Error: 'idle' parameter must be a non-empty array of sound filenames"
          }
          if (!errorSounds || !Array.isArray(errorSounds) || errorSounds.length === 0) {
            return "Error: 'error' parameter must be a non-empty array of sound filenames"
          }
          
          const themeKey = themeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
          
          // Check if theme already exists
          if (themes[themeKey]) {
            return `Error: Theme "${themeKey}" already exists. Choose a different name.`
          }
          
          // Validate sound files exist
          const validateSound = (file: string) => existsSync(join(SOUNDS_DIR, file))
          
          if (!validateSound(announceSound)) {
            return `Error: Announce sound not found: ${announceSound}`
          }
          if (!validateSound(questionSound)) {
            return `Error: Question sound not found: ${questionSound}`
          }
          for (const s of idleSounds) {
            if (!validateSound(s)) {
              return `Error: Idle sound not found: ${s}`
            }
          }
          for (const s of errorSounds) {
            if (!validateSound(s)) {
              return `Error: Error sound not found: ${s}`
            }
          }
          
          // Generate YAML content
          const yamlContent = [
            `name: ${themeName}`,
            `description: ${description}`,
            "",
            "sounds:",
            `  announce: ${announceSound}`,
            `  question: ${questionSound}`,
            "  idle:",
            ...idleSounds.map((s: string) => `    - ${s}`),
            "  error:",
            ...errorSounds.map((s: string) => `    - ${s}`),
            "",
          ].join("\n")
          
          // Determine themes directory
          const pluginDir = new URL(".", import.meta.url).pathname
          const themesDir = join(pluginDir, "themes")
          const themeFile = join(themesDir, `${themeKey}.yaml`)
          
          // Write the theme file
          writeFileSync(themeFile, yamlContent)
          
          // Reload themes
          themes = reloadThemes()
          themeNames = Object.keys(themes).sort()
          
          const lines = [
            `Theme "${themeName}" created successfully!`,
            `File: ${themeFile}`,
            "",
            "YAML content:",
            yamlContent,
          ]
          return lines.join("\n")
        },
      },
      
      sfx_list_sounds: {
        description: "List available sound files in the sounds directory",
        parameters: {
          type: "object",
          properties: {
            directory: {
              type: "string",
              description: "Directory to list sounds from. Defaults to configured SOUNDS_DIR.",
            },
            filter: {
              type: "string",
              description: "Filter pattern to match filenames (case-insensitive substring match)",
            },
          },
        },
        execute: async ({ directory, filter }: { directory?: string; filter?: string }) => {
          const soundsDir = directory || SOUNDS_DIR
          
          if (!existsSync(soundsDir)) {
            return `Error: Directory not found: ${soundsDir}`
          }
          
          let files = readdirSync(soundsDir)
            .filter(f => /\.(mp3|wav|ogg|m4a|aac)$/i.test(f))
            .sort()
          
          if (filter) {
            const lowerFilter = filter.toLowerCase()
            files = files.filter(f => f.toLowerCase().includes(lowerFilter))
          }
          
          if (files.length === 0) {
            return `No sound files found in: ${soundsDir}${filter ? ` (filter: ${filter})` : ""}`
          }
          
          const lines = [`Sound files in ${soundsDir}:`, ""]
          files.forEach((f, i) => {
            lines.push(`  ${(i + 1).toString().padStart(3)}. ${f}`)
          })
          lines.push("", `Total: ${files.length} files`)
          return lines.join("\n")
        },
      },
      
      sfx_preview_sound: {
        description: "Play a sound file for preview",
        parameters: {
          type: "object",
          properties: {
            filename: {
              type: "string",
              description: "Sound filename to play",
            },
            directory: {
              type: "string",
              description: "Directory containing the sound. Defaults to configured SOUNDS_DIR.",
            },
          },
          required: ["filename"],
        },
        execute: async ({ filename, directory }: { filename: string; directory?: string }) => {
          if (!filename) {
            return "Error: filename parameter is required"
          }
          
          const soundsDir = directory || SOUNDS_DIR
          const soundPath = join(soundsDir, filename)
          
          if (!existsSync(soundPath)) {
            return `Error: Sound file not found: ${soundPath}`
          }
          
          playSoundAlways(soundPath, "preview", "user requested preview")
          return `Playing: ${filename}`
        },
      },
    },

    event: async ({ event }) => {
      // Clear alert if pane is now active (user came back)
      if (hasAlert && isPaneActive()) {
        clearTmuxAlert()
      }

      // Handle command execution for /ak (acknowledge)
      if (
        event.type === "command.executed" &&
        (event as any).command === "ak"
      ) {
        clearTmuxAlert()
        return
      }

      let soundFile: string | null = null

      const eventType = event.type as string

      if (eventType === "session.idle") {
        // Check if this is a sub-agent session (has parentID) - skip sounds for sub-agents
        const sessionID = (event as any).properties?.sessionID as string | undefined
        if (sessionID) {
          try {
            const session = await (client.session.get as any)({
              sessionID,
              directory: process.cwd(),
            })
            if (session.data?.parentID) {
              // This is a sub-agent session, skip the idle sound
              return
            }
          } catch {
            // If we can't fetch session info, default to playing sound
          }
        }
        soundFile = randomSound(currentTheme.sounds.idle)
      } else if (eventType === "permission.asked") {
        // Play a random question sound for this theme
        soundFile = randomSound(currentTheme.sounds.question)
      } else if (eventType === "session.error") {
        soundFile = randomSound(currentTheme.sounds.error)
      } else if (eventType === "tui.command.execute") {
        // Handle /ak (acknowledge) command
        if ((event as any).properties?.command === "ak") {
          clearTmuxAlert()
        }
        return // Don't play sound for command execution
      }

      if (soundFile) {
        const soundPath = join(SOUNDS_DIR, soundFile)
        if (existsSync(soundPath)) {
          playSound(soundPath, eventType)
        }
      }
    },
    // Hook into tool execution to catch question tool
    "tool.execute.before": async (input, _output) => {
      // Clear alert if pane is now active
      if (hasAlert && isPaneActive()) {
        clearTmuxAlert()
      }

      if (input.tool === "mcp_question" || input.tool === "question") {
        const questionFile = randomSound(currentTheme.sounds.question)
        if (questionFile) {
          const soundPath = join(SOUNDS_DIR, questionFile)
          if (existsSync(soundPath)) {
            playSound(soundPath, "tool.question", "question tool invoked")
          }
        }
      }
    },
    // Hook into TUI command execution
    "tui.command.execute": async (input: any, _output: any) => {
      if (input.command === "ak" || input.command === "/ak") {
        clearTmuxAlert()
      }
    },
  }
}

// Default export for plugin loading
export default OpenCodeSFX

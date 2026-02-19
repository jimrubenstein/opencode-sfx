/**
 * Cross-platform sound player with debug/test mode support
 *
 * Environment variables:
 *   OCSFX_DEBUG=1     - Enable debug logging (logs to stderr)
 *   OCSFX_DEBUG=test  - Test mode: log but don't play sounds
 *   OCSFX_LOG_FILE    - Write logs to this file
 */

import { spawn } from "child_process"
import { existsSync, appendFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

// Get the path to our play-sound script
const __dirname = dirname(fileURLToPath(import.meta.url))
const PLAY_SOUND_SCRIPT = join(__dirname, "..", "bin", "play-sound")

export interface PlaySoundOptions {
  /** Why the sound is being played */
  reason?: string
  /** Current theme name */
  theme?: string
  /** Event that triggered the sound */
  event?: string
  /** Force play even if pane is active (for announce/test sounds) */
  force?: boolean
}

export interface SoundPlayResult {
  played: boolean
  logged: boolean
  testMode: boolean
  error?: string
}

/**
 * Get current debug mode from environment (read each time for flexibility)
 */
function getDebugMode(): string | undefined {
  return process.env.OCSFX_DEBUG
}

/**
 * Get current log file from environment (read each time for flexibility)
 */
function getLogFilePath(): string | undefined {
  return process.env.OCSFX_LOG_FILE
}

/**
 * Log a message in debug/test mode
 */
function logMessage(message: string): void {
  const debugMode = getDebugMode()
  const logFile = getLogFilePath()
  const timestamp = new Date().toISOString()
  const logLine = `[OCSFX] ${timestamp} ${message}`

  if (debugMode === "1" || debugMode === "test") {
    console.error(logLine)
  }

  if (logFile) {
    try {
      appendFileSync(logFile, logLine + "\n")
    } catch {
      // Ignore log file errors
    }
  }
}

/**
 * Play a sound file using the cross-platform play-sound script
 *
 * @param soundPath - Full path to the sound file
 * @param options - Optional metadata for logging
 * @returns Result indicating if sound was played/logged
 */
export function playSound(soundPath: string, options: PlaySoundOptions = {}): SoundPlayResult {
  const debugMode = getDebugMode()
  const logFile = getLogFilePath()
  const { reason, theme, event } = options
  const basename = soundPath.split("/").pop() || soundPath

  // Validate sound file exists
  if (!existsSync(soundPath)) {
    const error = `Sound file not found: ${soundPath}`
    logMessage(`ERROR ${error}`)
    return { played: false, logged: true, testMode: false, error }
  }

  // Build log message parts
  const logParts = ["PLAY", basename]
  if (theme) logParts.push(`theme=${theme}`)
  if (event) logParts.push(`event=${event}`)
  if (reason) logParts.push(`reason=${reason}`)

  // Test mode - log but don't play
  if (debugMode === "test") {
    logMessage(`TEST_MODE ${logParts.join(" ")}`)
    return { played: false, logged: true, testMode: true }
  }

  // Debug mode - log and play
  if (debugMode === "1" || logFile) {
    logMessage(logParts.join(" "))
  }

  // Check if play-sound script exists
  if (!existsSync(PLAY_SOUND_SCRIPT)) {
    // Fallback to direct playback if script not found
    return playDirect(soundPath, debugMode, logFile)
  }

  // Build command arguments
  const args: string[] = []
  if (reason) args.push("--reason", reason)
  if (theme) args.push("--theme", theme)
  if (event) args.push("--event", event)
  args.push(soundPath)

  // Spawn the play-sound script (fire and forget)
  try {
    const child = spawn(PLAY_SOUND_SCRIPT, args, {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        // Pass through debug settings
        OCSFX_DEBUG: debugMode || "",
        OCSFX_LOG_FILE: logFile || "",
      },
    })
    child.unref()
    return { played: true, logged: debugMode !== undefined || logFile !== undefined, testMode: false }
  } catch (err) {
    const error = `Failed to spawn play-sound: ${err}`
    logMessage(`ERROR ${error}`)
    return { played: false, logged: true, testMode: false, error }
  }
}

/**
 * Fallback direct playback (used if play-sound script not found)
 */
function playDirect(soundPath: string, debugMode: string | undefined, logFile: string | undefined): SoundPlayResult {
  const platform = process.platform

  let command: string
  let args: string[]

  switch (platform) {
    case "darwin":
      command = "afplay"
      args = [soundPath]
      break
    case "linux":
      // Try paplay first (PulseAudio)
      command = "paplay"
      args = [soundPath]
      break
    case "win32":
      command = "powershell.exe"
      args = ["-c", `(New-Object Media.SoundPlayer '${soundPath}').PlaySync()`]
      break
    default:
      const error = `Unsupported platform: ${platform}`
      logMessage(`ERROR ${error}`)
      return { played: false, logged: true, testMode: false, error }
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    })
    child.unref()
    return { played: true, logged: debugMode !== undefined || logFile !== undefined, testMode: false }
  } catch (err) {
    const error = `Failed to play sound: ${err}`
    logMessage(`ERROR ${error}`)
    return { played: false, logged: true, testMode: false, error }
  }
}

/**
 * Check if we're in test mode (sounds logged but not played)
 */
export function isTestMode(): boolean {
  return getDebugMode() === "test"
}

/**
 * Check if debug logging is enabled
 */
export function isDebugMode(): boolean {
  const mode = getDebugMode()
  return mode === "1" || mode === "test"
}

/**
 * Get the log file path if configured
 */
export function getLogFile(): string | undefined {
  return getLogFilePath()
}

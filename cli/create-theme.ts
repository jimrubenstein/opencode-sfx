/**
 * Interactive CLI wizard for creating OpenCode SFX themes.
 *
 * Walks the user through selecting sounds for each event type,
 * previewing them inline, and writing the YAML file.
 *
 * Usage: opencode-sfx create
 */

import { intro, outro, text, select, multiselect, confirm, log, isCancel, cancel } from "@clack/prompts"
import { readdirSync, existsSync, writeFileSync, mkdirSync, unlinkSync } from "fs"
import { join, extname } from "path"
import { spawn } from "child_process"
import {
  PLUGIN_DIR,
  USER_THEMES_DIR,
  BUNDLED_THEMES_DIR,
  CACHE_FILE,
} from "../lib/paths.js"

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PLAY_SOUND_SCRIPT = join(PLUGIN_DIR, "bin", "play-sound")

/**
 * Theme root directories to search for sounds, in priority order.
 * Each contains theme subdirectories: <root>/<name>/{yaml, sounds}.
 */
const THEME_ROOTS = [USER_THEMES_DIR, BUNDLED_THEMES_DIR]

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac"])

// ---------------------------------------------------------------------------
// Sound discovery
// ---------------------------------------------------------------------------

interface SoundFile {
  /** Display label */
  label: string
  /** Filename as it would appear in the YAML (bare filename — sibling to the YAML) */
  yamlRef: string
  /** Full absolute path for playback */
  absPath: string
  /** Which theme this sound belongs to */
  themeKey: string
  /** Which source: "user" or "bundled" */
  source: "user" | "bundled"
}

/**
 * Discover audio files across all theme directories.
 * Since each theme is self-contained, sounds live alongside the YAML.
 */
function discoverSounds(): SoundFile[] {
  const sounds: SoundFile[] = []

  for (const root of THEME_ROOTS) {
    if (!existsSync(root)) continue
    const source: "user" | "bundled" = root === USER_THEMES_DIR ? "user" : "bundled"
    const labelSuffix = source === "bundled" ? " (bundled)" : ""

    try {
      const themeDirs = readdirSync(root, { withFileTypes: true })
      for (const entry of themeDirs) {
        if (!entry.isDirectory()) continue
        const themeDir = join(root, entry.name)
        const themeKey = entry.name

        try {
          const files = readdirSync(themeDir)
            .filter(f => AUDIO_EXTENSIONS.has(extname(f).toLowerCase()))
            .sort()
          for (const f of files) {
            sounds.push({
              label: `${themeKey}/${f}${labelSuffix}`,
              yamlRef: f,
              absPath: join(themeDir, f),
              themeKey,
              source,
            })
          }
        } catch { /* ignore read errors */ }
      }
    } catch { /* ignore root read errors */ }
  }

  return sounds
}

// ---------------------------------------------------------------------------
// Sound playback (blocking, for preview)
// ---------------------------------------------------------------------------

function playPreview(absPath: string): void {
  try {
    if (existsSync(PLAY_SOUND_SCRIPT)) {
      spawn(PLAY_SOUND_SCRIPT, [absPath], {
        detached: true,
        stdio: "ignore",
      }).unref()
    } else if (process.platform === "darwin") {
      spawn("afplay", [absPath], {
        detached: true,
        stdio: "ignore",
      }).unref()
    }
  } catch {
    // Silently fail — preview is best-effort
  }
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

function handleCancel(value: unknown): asserts value is Exclude<typeof value, symbol> {
  if (isCancel(value)) {
    cancel("Theme creation cancelled.")
    process.exit(0)
  }
}

type SoundOption = { value: string; label: string; hint?: string }

function buildSoundOptions(sounds: SoundFile[]): SoundOption[] {
  return sounds.map(s => ({
    value: s.yamlRef,
    label: s.label,
    hint: s.source === "bundled" ? "bundled" : undefined,
  }))
}

/** Prompt user to select a single sound with optional preview. */
async function pickSingleSound(
  sounds: SoundFile[],
  message: string,
): Promise<string> {
  const options = buildSoundOptions(sounds)

  const selected = await select({
    message,
    options,
  })
  handleCancel(selected)

  const match = sounds.find(s => s.yamlRef === selected)
  if (match) playPreview(match.absPath)

  return selected as string
}

/** Prompt user to select multiple sounds with optional preview. */
async function pickMultipleSounds(
  sounds: SoundFile[],
  message: string,
  required: boolean = true,
): Promise<string[]> {
  const options = buildSoundOptions(sounds).map(o => ({ ...o, value: o.value }))

  const selected = await multiselect({
    message,
    options,
    required,
  })
  handleCancel(selected)

  // Preview the first selected sound
  const firstMatch = sounds.find(s => s.yamlRef === (selected as string[])[0])
  if (firstMatch) playPreview(firstMatch.absPath)

  return selected as string[]
}

// ---------------------------------------------------------------------------
// YAML generation
// ---------------------------------------------------------------------------

/** Characters that require quoting in YAML scalar values */
const YAML_UNSAFE = /[:#\[\]{}&*!|>'"%@`]/

/** Quote a YAML string value if it contains special characters */
function yamlQuote(value: string): string {
  if (YAML_UNSAFE.test(value) || value.startsWith("- ") || value.startsWith("? ")) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  }
  return value
}

function generateYaml(
  name: string,
  description: string,
  announce: string,
  question: string,
  idle: string[],
  error: string[],
): string {
  const lines: string[] = []
  lines.push(`name: ${yamlQuote(name)}`)
  lines.push(`description: ${yamlQuote(description)}`)
  lines.push("")
  lines.push("sounds:")
  lines.push(`  announce: ${announce}`)
  lines.push(`  question: ${question}`)

  lines.push("  idle:")
  for (const s of idle) {
    lines.push(`    - ${s}`)
  }

  lines.push("  error:")
  for (const s of error) {
    lines.push(`    - ${s}`)
  }

  return lines.join("\n") + "\n"
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export async function createThemeWizard(): Promise<void> {
  intro("Create a new OpenCode SFX theme")

  // Discover available sounds from all theme directories
  const sounds = discoverSounds()

  if (sounds.length === 0) {
    log.error(
      "No sound files found!\n\n" +
      `  Checked: ${USER_THEMES_DIR}\n` +
      `  Checked: ${BUNDLED_THEMES_DIR}\n\n` +
      "  Place audio files (.mp3, .wav, .ogg) in a theme directory:\n" +
      "    ~/.ocsfx/themes/<name>/<sounds>.mp3"
    )
    process.exit(1)
  }

  log.info(`Found ${sounds.length} sound files`)

  const userCount = sounds.filter(s => s.source === "user").length
  const bundledCount = sounds.filter(s => s.source === "bundled").length
  if (userCount > 0) log.info(`  ${userCount} from user themes`)
  if (bundledCount > 0) log.info(`  ${bundledCount} from bundled themes`)

  // --- Theme name ---
  const themeName = await text({
    message: "Theme name",
    placeholder: "My Awesome Theme",
    validate: (value) => {
      if (!value || value.trim().length === 0) return "Name is required"
      return undefined
    },
  })
  handleCancel(themeName)

  // --- Theme key (directory name) ---
  const defaultKey = (themeName as string)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  const themeKey = await text({
    message: "Theme key (used as directory name)",
    placeholder: defaultKey,
    defaultValue: defaultKey,
    validate: (value) => {
      if (!value || value.trim().length === 0) return "Key is required"
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
        return "Use lowercase letters, numbers, and hyphens only"
      }
      // Check if theme directory already exists in user or bundled
      if (existsSync(join(USER_THEMES_DIR, value)) || existsSync(join(BUNDLED_THEMES_DIR, value))) {
        return `Theme "${value}" already exists`
      }
      return undefined
    },
  })
  handleCancel(themeKey)

  // --- Description ---
  const description = await text({
    message: "Short description",
    placeholder: "A custom sound theme",
    defaultValue: "A custom sound theme",
  })
  handleCancel(description)

  // --- Sound selection ---
  log.step("Select sounds for each event type")
  log.info("Each sound will play after you confirm your selection\n")

  // Announce sound (single)
  log.message("Announce — played when the plugin starts or you switch themes")
  const announce = await pickSingleSound(sounds, "Announce sound")

  // Question sound (single)
  log.message("Question — played when the agent needs your input")
  const question = await pickSingleSound(sounds, "Question sound")

  // Idle sounds (multiple)
  log.message("Idle — played when the agent finishes a task (pick multiple)")
  const idle = await pickMultipleSounds(sounds, "Idle sounds")

  // Error sounds (multiple)
  log.message("Error — played when something goes wrong (pick multiple)")
  const error = await pickMultipleSounds(sounds, "Error sounds")

  // --- Narrow types (handleCancel exits on symbol, these are safe) ---
  const finalName = themeName as string
  const finalKey = themeKey as string
  const finalDesc = description as string

  // --- Summary ---
  log.step("Theme summary")
  log.info(`  Name:     ${finalName}`)
  log.info(`  Key:      ${finalKey}`)
  log.info(`  Announce: ${announce}`)
  log.info(`  Question: ${question}`)
  log.info(`  Idle:     ${idle.join(", ")}`)
  log.info(`  Error:    ${error.join(", ")}`)

  const shouldWrite = await confirm({
    message: `Write theme to ~/.ocsfx/themes/${finalKey}/${finalKey}.yaml?`,
  })
  handleCancel(shouldWrite)

  if (!shouldWrite) {
    cancel("Theme not saved.")
    process.exit(0)
  }

  // --- Write YAML ---
  const yaml = generateYaml(finalName, finalDesc, announce, question, idle, error)

  // Create self-contained theme directory
  const themeDir = join(USER_THEMES_DIR, finalKey)
  mkdirSync(themeDir, { recursive: true })

  const outputPath = join(themeDir, `${finalKey}.yaml`)
  writeFileSync(outputPath, yaml)

  log.success(`Created ${outputPath}`)

  // Clear the theme cache so it's picked up immediately
  if (existsSync(CACHE_FILE)) {
    try {
      unlinkSync(CACHE_FILE)
      log.info("Theme cache cleared — new theme available immediately")
    } catch {
      log.warn("Could not clear theme cache. Run /sfx reload in OpenCode.")
    }
  }

  outro(`Theme "${finalName}" is ready! Use /sfx change ${finalKey} in OpenCode to activate it.`)
}

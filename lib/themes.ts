import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "fs"
import { join, basename, dirname } from "path"
import { parse as parseYaml } from "yaml"
import {
  USER_THEMES_DIR,
  BUNDLED_THEMES_DIR,
  CACHE_DIR,
  CACHE_FILE,
} from "./paths.js"

// =============================================================================
// TYPES
// =============================================================================

export interface SoundTheme {
  name: string
  description: string
  /** Absolute path to the directory containing this theme's YAML and sounds */
  basePath: string
  sounds: {
    announce: string[]
    question: string[]
    idle: string[]
    error: string[]
  }
}

export type ThemeMap = Record<string, SoundTheme>

interface ThemeCache {
  version: number
  buildTime: number
  themes: ThemeMap
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CACHE_VERSION = 2  // bumped: new self-contained directory structure

/**
 * Directories to search for theme subdirectories, in priority order.
 * User themes (~/.ocsfx/themes/) take precedence over bundled themes.
 */
const THEME_ROOTS = [USER_THEMES_DIR, BUNDLED_THEMES_DIR]

// =============================================================================
// SOUND RESOLUTION
// =============================================================================

/**
 * Resolve a sound filename to an absolute path, relative to a theme's directory.
 * Returns null if the file doesn't exist.
 */
export function resolveSoundPath(theme: SoundTheme, soundFile: string): string | null {
  const candidate = join(theme.basePath, soundFile)
  if (existsSync(candidate)) return candidate
  return null
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

function getThemesModTime(): number {
  let maxMtime = 0
  for (const root of THEME_ROOTS) {
    try {
      const entries = readdirSync(root, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const themeDir = join(root, entry.name)
        try {
          const files = readdirSync(themeDir)
          for (const file of files) {
            if (file.endsWith(".yaml") || file.endsWith(".yml")) {
              const stat = statSync(join(themeDir, file))
              if (stat.mtimeMs > maxMtime) {
                maxMtime = stat.mtimeMs
              }
            }
          }
        } catch { /* skip unreadable dirs */ }
      }
    } catch {
      // Root directory might not exist
    }
  }
  return maxMtime
}

function loadCache(): ThemeCache | null {
  if (!existsSync(CACHE_FILE)) {
    return null
  }
  try {
    const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as ThemeCache
    if (data.version !== CACHE_VERSION) {
      return null
    }
    return data
  } catch {
    return null
  }
}

function saveCache(themes: ThemeMap): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }
  const cache: ThemeCache = {
    version: CACHE_VERSION,
    buildTime: Date.now(),
    themes,
  }
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
}

// =============================================================================
// YAML LOADING
// =============================================================================

/**
 * Normalize a sound value to an array.
 * Accepts: string, string[], or undefined/null
 * Returns: string[] (empty array if no valid input)
 */
function normalizeToArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string")
  }
  if (typeof value === "string" && value.length > 0) {
    return [value]
  }
  return []
}

function loadThemeFromYaml(filePath: string): SoundTheme | null {
  try {
    const content = readFileSync(filePath, "utf-8")
    const data = parseYaml(content)
    
    // Validate required fields
    if (!data.name || !data.sounds) {
      console.error(`Invalid theme file ${filePath}: missing required fields`)
      return null
    }
    
    return {
      name: data.name,
      description: data.description || "",
      basePath: dirname(filePath),
      sounds: {
        announce: normalizeToArray(data.sounds.announce),
        question: normalizeToArray(data.sounds.question),
        idle: normalizeToArray(data.sounds.idle),
        error: normalizeToArray(data.sounds.error),
      },
    }
  } catch (err) {
    console.error(`Failed to load theme from ${filePath}:`, err)
    return null
  }
}

/**
 * Discover and load themes from a single root directory.
 *
 * Expected structure:
 *   <root>/<name>/<name>.yaml   (preferred)
 *   <root>/<name>/*.yaml        (fallback: first yaml found)
 */
function discoverThemesInRoot(root: string): ThemeMap {
  const themes: ThemeMap = {}
  if (!existsSync(root)) return themes

  try {
    const entries = readdirSync(root, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const themeDir = join(root, entry.name)
      const key = entry.name

      // Prefer <name>.yaml matching the directory name
      let yamlPath = join(themeDir, `${key}.yaml`)
      if (!existsSync(yamlPath)) {
        yamlPath = join(themeDir, `${key}.yml`)
      }

      // Fallback: first .yaml file in the directory
      if (!existsSync(yamlPath)) {
        try {
          const files = readdirSync(themeDir)
          const yamlFile = files.find(f => f.endsWith(".yaml") || f.endsWith(".yml"))
          if (yamlFile) {
            yamlPath = join(themeDir, yamlFile)
          } else {
            continue // No YAML found, skip this directory
          }
        } catch {
          continue
        }
      }

      const theme = loadThemeFromYaml(yamlPath)
      if (theme) {
        themes[key] = theme
      }
    }
  } catch {
    // Root directory read error — skip
  }

  return themes
}

/**
 * Load all themes from all theme root directories.
 * User themes take precedence: if the same key exists in both
 * ~/.ocsfx/themes/ and <plugin>/themes/, the user version wins.
 */
function loadAllThemesFromYaml(): ThemeMap {
  const themes: ThemeMap = {}

  // Load bundled themes first, then user themes overwrite
  for (let i = THEME_ROOTS.length - 1; i >= 0; i--) {
    const rootThemes = discoverThemesInRoot(THEME_ROOTS[i])
    Object.assign(themes, rootThemes)
  }

  return themes
}

// =============================================================================
// PUBLIC API
// =============================================================================

let cachedThemes: ThemeMap | null = null

/**
 * Load all themes, using cache if available and up-to-date.
 * Themes are discovered as self-contained directories:
 *   <root>/<name>/<name>.yaml + sound files
 *
 * Search order: ~/.ocsfx/themes/ first, then <plugin>/themes/.
 */
export function loadThemes(): ThemeMap {
  // Return in-memory cache if available
  if (cachedThemes) {
    return cachedThemes
  }
  
  // Check file cache
  const cache = loadCache()
  const themesModTime = getThemesModTime()
  
  if (cache && cache.buildTime > themesModTime) {
    cachedThemes = cache.themes
    return cachedThemes
  }
  
  // Load from YAML and update cache
  cachedThemes = loadAllThemesFromYaml()
  saveCache(cachedThemes)
  
  return cachedThemes
}

/**
 * Get a list of all available theme keys.
 */
export function getThemeNames(): string[] {
  return Object.keys(loadThemes())
}

/**
 * Get a specific theme by key.
 */
export function getTheme(key: string): SoundTheme | undefined {
  return loadThemes()[key]
}

/**
 * Force reload themes from YAML files, ignoring cache.
 */
export function reloadThemes(): ThemeMap {
  cachedThemes = loadAllThemesFromYaml()
  saveCache(cachedThemes)
  return cachedThemes
}

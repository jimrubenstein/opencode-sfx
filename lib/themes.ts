import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "fs"
import { join, basename } from "path"
import { parse as parseYaml } from "yaml"

// =============================================================================
// TYPES
// =============================================================================

export interface SoundTheme {
  name: string
  description: string
  sounds: {
    announce: string
    question: string
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
// PATHS
// =============================================================================

const CACHE_VERSION = 1
const PLUGIN_DIR = new URL("..", import.meta.url).pathname
const THEMES_DIR = join(PLUGIN_DIR, "themes")
const CACHE_DIR = join(PLUGIN_DIR, ".cache")
const CACHE_FILE = join(CACHE_DIR, "themes.json")

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

function getThemesModTime(): number {
  let maxMtime = 0
  try {
    const files = readdirSync(THEMES_DIR)
    for (const file of files) {
      if (file.endsWith(".yaml") || file.endsWith(".yml")) {
        const stat = statSync(join(THEMES_DIR, file))
        if (stat.mtimeMs > maxMtime) {
          maxMtime = stat.mtimeMs
        }
      }
    }
  } catch {
    // Directory might not exist
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
      sounds: {
        announce: data.sounds.announce || "",
        question: data.sounds.question || "",
        idle: data.sounds.idle || [],
        error: data.sounds.error || [],
      },
    }
  } catch (err) {
    console.error(`Failed to load theme from ${filePath}:`, err)
    return null
  }
}

function loadAllThemesFromYaml(): ThemeMap {
  const themes: ThemeMap = {}
  
  if (!existsSync(THEMES_DIR)) {
    console.error(`Themes directory not found: ${THEMES_DIR}`)
    return themes
  }
  
  const files = readdirSync(THEMES_DIR)
  for (const file of files) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) {
      continue
    }
    
    const filePath = join(THEMES_DIR, file)
    const theme = loadThemeFromYaml(filePath)
    if (theme) {
      // Use filename (without extension) as the theme key
      const key = basename(file, file.endsWith(".yaml") ? ".yaml" : ".yml")
      themes[key] = theme
    }
  }
  
  return themes
}

// =============================================================================
// PUBLIC API
// =============================================================================

let cachedThemes: ThemeMap | null = null

/**
 * Load all themes, using cache if available and up-to-date.
 * Themes are loaded from YAML files in the themes/ directory.
 * A JSON cache is maintained in .cache/themes.json for faster subsequent loads.
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
    // Cache is newer than theme files, use it
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

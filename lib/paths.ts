/**
 * Centralized path constants for OpenCode SFX.
 *
 * Theme directory structure (self-contained):
 *   themes/<name>/
 *     <name>.yaml    — theme definition
 *     *.mp3          — sound files referenced by the YAML
 *
 * Search order:
 *   1. User themes:   ~/.ocsfx/themes/
 *   2. Bundled themes: <plugin>/themes/
 *
 * Sound files are resolved relative to the theme's own directory.
 * There is no separate global sounds directory.
 */

import { homedir } from "os"
import { join } from "path"

// ---------------------------------------------------------------------------
// Plugin directory (where the source lives)
// ---------------------------------------------------------------------------

export const PLUGIN_DIR = new URL("..", import.meta.url).pathname

// ---------------------------------------------------------------------------
// Bundled (plugin) themes — second in search order
// ---------------------------------------------------------------------------

export const BUNDLED_THEMES_DIR = join(PLUGIN_DIR, "themes")

// ---------------------------------------------------------------------------
// User directories — first in search order
// ---------------------------------------------------------------------------

export const USER_DIR = join(homedir(), ".ocsfx")
export const USER_THEMES_DIR = join(USER_DIR, "themes")

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export const CACHE_DIR = join(PLUGIN_DIR, ".cache")
export const CACHE_FILE = join(CACHE_DIR, "themes.json")

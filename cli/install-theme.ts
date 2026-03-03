/**
 * Theme pack installer for OpenCode SFX.
 *
 * Installs a theme pack from a local archive or a URL.
 *
 * Pack format (self-contained theme directory):
 *   <name>/
 *     <name>.yaml    — theme definition
 *     *.mp3          — sound files (referenced by bare filenames in the YAML)
 *     INSTALL.md     — (optional) install instructions
 *
 * The installer:
 *   1. Downloads the archive (if URL) or reads from local path
 *   2. Extracts to a temp directory
 *   3. Finds theme directories (containing a .yaml file)
 *   4. Copies each theme directory to ~/.ocsfx/themes/<name>/
 *   5. Clears the theme cache
 *
 * Usage: opencode-sfx install <url-or-path>
 */

import { existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync, rmSync, statSync } from "fs"
import { join, basename, extname } from "path"
import { execSync } from "child_process"
import { tmpdir } from "os"
import {
  USER_THEMES_DIR,
  CACHE_FILE,
} from "../lib/paths.js"

// Colors
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const BOLD = "\x1b[1m"
const NC = "\x1b[0m"

function ok(msg: string) { console.log(`${GREEN}✓${NC} ${msg}`) }
function warn(msg: string) { console.log(`${YELLOW}!${NC} ${msg}`) }
function err(msg: string) { console.log(`${RED}✗${NC} ${msg}`) }
function info(msg: string) { console.log(`${BOLD}${msg}${NC}`) }
function step(msg: string) { console.log(`  ${msg}`) }

function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://")
}

/**
 * Download a file from a URL to a local path using curl.
 */
function downloadFile(url: string, destPath: string): void {
  try {
    execSync(`curl -fsSL -o "${destPath}" "${url}"`, {
      encoding: "utf-8",
      timeout: 60000,
    })
  } catch (e: any) {
    throw new Error(`Failed to download: ${url}\n${e.message || e}`)
  }
}

/**
 * Extract an archive to a directory. Supports .zip, .tgz, and .tar.gz.
 */
function extractArchive(archivePath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true })
  try {
    if (archivePath.endsWith(".tgz") || archivePath.endsWith(".tar.gz")) {
      execSync(`tar xzf "${archivePath}" -C "${destDir}"`, {
        encoding: "utf-8",
        timeout: 30000,
      })
    } else {
      execSync(`unzip -qo "${archivePath}" -d "${destDir}"`, {
        encoding: "utf-8",
        timeout: 30000,
      })
    }
  } catch (e: any) {
    throw new Error(`Failed to extract archive: ${archivePath}\n${e.message || e}`)
  }
}

/**
 * Find theme directories in an extracted archive.
 * A theme directory is any directory containing at least one .yaml file.
 * Returns array of { key, srcDir } for each discovered theme.
 */
function findThemeDirs(extractDir: string): Array<{ key: string; srcDir: string }> {
  const results: Array<{ key: string; srcDir: string }> = []

  try {
    const entries = readdirSync(extractDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = join(extractDir, entry.name)
      const hasYaml = readdirSync(dir).some(f => f.endsWith(".yaml") || f.endsWith(".yml"))
      if (hasYaml) {
        results.push({ key: entry.name, srcDir: dir })
      }
    }
  } catch { /* ignore */ }

  return results
}

/**
 * Copy all relevant files from a source theme directory to the destination.
 * Copies .yaml, .yml, and audio files.
 */
function copyThemeFiles(srcDir: string, destDir: string): { yamlCount: number; soundCount: number } {
  mkdirSync(destDir, { recursive: true })
  let yamlCount = 0
  let soundCount = 0

  const files = readdirSync(srcDir)
  for (const file of files) {
    const srcPath = join(srcDir, file)
    // Skip directories and non-files
    if (!statSync(srcPath).isFile()) continue

    const ext = extname(file).toLowerCase()
    if (ext === ".yaml" || ext === ".yml") {
      copyFileSync(srcPath, join(destDir, file))
      yamlCount++
    } else if (/^\.(mp3|wav|ogg|m4a|aac)$/.test(ext)) {
      copyFileSync(srcPath, join(destDir, file))
      soundCount++
    }
    // Skip INSTALL.md and other files
  }

  return { yamlCount, soundCount }
}

export async function installThemePack(source: string): Promise<void> {
  console.log()
  info("Installing theme pack")
  console.log()

  // --- Step 1: Get the archive file ---
  let archivePath: string
  let cleanupArchive = false

  if (isUrl(source)) {
    step(`Downloading ${source}...`)
    const tmpFile = join(tmpdir(), `ocsfx-theme-${Date.now()}.tgz`)
    try {
      downloadFile(source, tmpFile)
    } catch (e: any) {
      err(e.message)
      process.exit(1)
    }
    archivePath = tmpFile
    cleanupArchive = true
    ok("Downloaded")
  } else {
    // Local path
    if (!existsSync(source)) {
      err(`File not found: ${source}`)
      process.exit(1)
    }
    archivePath = source
    ok(`Using local file: ${source}`)
  }

  // --- Step 2: Extract to temp directory ---
  const extractDir = join(tmpdir(), `ocsfx-theme-extract-${Date.now()}`)

  try {
    step("Extracting...")
    extractArchive(archivePath, extractDir)
    ok("Extracted")
  } catch (e: any) {
    err(e.message)
    if (cleanupArchive) try { unlinkSync(archivePath) } catch {}
    process.exit(1)
  }

  // --- Step 3: Find theme directories ---
  const themeDirs = findThemeDirs(extractDir)

  if (themeDirs.length === 0) {
    err("Invalid theme pack: no theme directories found (expected <name>/<name>.yaml)")
    rmSync(extractDir, { recursive: true, force: true })
    if (cleanupArchive) try { unlinkSync(archivePath) } catch {}
    process.exit(1)
  }

  // --- Step 4: Install each theme to ~/.ocsfx/themes/<name>/ ---
  for (const { key, srcDir } of themeDirs) {
    const destDir = join(USER_THEMES_DIR, key)

    if (existsSync(destDir)) {
      warn(`Overwriting existing theme: ${key}`)
    }

    step(`Installing theme: ${key}`)
    const { yamlCount, soundCount } = copyThemeFiles(srcDir, destDir)
    ok(`Installed: ~/.ocsfx/themes/${key}/ (${soundCount} sounds)`)
  }

  // --- Step 5: Clear theme cache ---
  if (existsSync(CACHE_FILE)) {
    try {
      unlinkSync(CACHE_FILE)
      ok("Theme cache cleared")
    } catch {
      warn("Could not clear theme cache. Run /sfx reload in your AI coding agent.")
    }
  }

  // --- Cleanup ---
  rmSync(extractDir, { recursive: true, force: true })
  if (cleanupArchive) {
    try { unlinkSync(archivePath) } catch {}
  }

  console.log()
  info("Theme pack installed!")
  console.log("  Reload themes in your AI coding agent:")
  console.log("    /sfx reload")
  console.log()
}

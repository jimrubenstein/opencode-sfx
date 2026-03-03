/**
 * Theme pack installer for OpenCode SFX.
 *
 * Installs a theme pack from a local archive or a URL.
 * Theme packs contain:
 *   - themes/<key>.yaml  — theme definition
 *   - sounds/*.mp3       — sound files
 *   - INSTALL.md         — (optional) install instructions
 *
 * The installer:
 *   1. Downloads the archive (if URL) or reads from local path
 *   2. Extracts to a temp directory
 *   3. Creates ~/.ocsfx/themes/<key>/ with the YAML and sounds together
 *   4. Clears the theme cache
 *
 * Usage: opencode-sfx install <url-or-path>
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, rmSync } from "fs"
import { join, dirname, basename, extname } from "path"
import { fileURLToPath } from "url"
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

  // --- Step 3: Find theme YAML ---
  const themesSubDir = join(extractDir, "themes")
  if (!existsSync(themesSubDir)) {
    err("Invalid theme pack: no themes/ directory found in archive")
    rmSync(extractDir, { recursive: true, force: true })
    if (cleanupArchive) try { unlinkSync(archivePath) } catch {}
    process.exit(1)
  }

  const yamlFiles = readdirSync(themesSubDir).filter(f =>
    f.endsWith(".yaml") || f.endsWith(".yml")
  )

  if (yamlFiles.length === 0) {
    err("Invalid theme pack: no .yaml files found in themes/ directory")
    rmSync(extractDir, { recursive: true, force: true })
    if (cleanupArchive) try { unlinkSync(archivePath) } catch {}
    process.exit(1)
  }

  // --- Step 4: Install each theme into ~/.ocsfx/themes/<name>/ ---
  const soundsSubDir = join(extractDir, "sounds")
  const hasSounds = existsSync(soundsSubDir)

  for (const yamlFile of yamlFiles) {
    const themeKey = basename(yamlFile, extname(yamlFile))
    const srcYaml = join(themesSubDir, yamlFile)

    // Create self-contained theme directory
    const destThemeDir = join(USER_THEMES_DIR, themeKey)
    mkdirSync(destThemeDir, { recursive: true })

    step(`Installing theme: ${themeKey}`)

    // Copy sounds into the theme directory (alongside the YAML)
    if (hasSounds) {
      const soundFiles = readdirSync(soundsSubDir).filter(f =>
        /\.(mp3|wav|ogg|m4a|aac)$/i.test(f)
      )

      if (soundFiles.length > 0) {
        let copied = 0
        for (const sf of soundFiles) {
          copyFileSync(join(soundsSubDir, sf), join(destThemeDir, sf))
          copied++
        }
        ok(`Copied ${copied} sound files`)
      }
    }

    // Copy the theme YAML (bare filenames are correct — sounds are siblings)
    const destYaml = join(destThemeDir, `${themeKey}.yaml`)
    if (existsSync(destYaml)) {
      warn(`Overwriting existing theme: ${themeKey}`)
    }
    copyFileSync(srcYaml, destYaml)
    ok(`Installed: ~/.ocsfx/themes/${themeKey}/`)
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

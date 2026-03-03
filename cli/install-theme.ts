/**
 * Theme pack installer for OpenCode SFX.
 *
 * Installs a theme pack from a local zip file or a URL.
 * Theme packs contain:
 *   - themes/<key>.yaml  — theme definition
 *   - sounds/*.mp3       — sound files
 *   - INSTALL.md         — (optional) install instructions
 *
 * The installer:
 *   1. Downloads the zip (if URL) or reads from local path
 *   2. Extracts to a temp directory
 *   3. Copies the theme YAML to the plugin's themes/ directory
 *   4. Copies sounds to the plugin's sounds/<theme-key>/ directory
 *   5. Rewrites sound references in the YAML to use the <theme-key>/ prefix
 *   6. Clears the theme cache
 *
 * Usage: opencode-sfx install <url-or-path>
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, rmSync } from "fs"
import { join, dirname, basename, extname } from "path"
import { fileURLToPath } from "url"
import { execSync } from "child_process"
import { tmpdir } from "os"

const CLI_DIR = dirname(fileURLToPath(import.meta.url))
const PLUGIN_DIR = dirname(CLI_DIR)
const THEMES_DIR = join(PLUGIN_DIR, "themes")
const SOUNDS_DIR = join(PLUGIN_DIR, "sounds")
const CACHE_FILE = join(PLUGIN_DIR, ".cache", "themes.json")

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
 * Rewrite sound references in a theme YAML to use a subdirectory prefix.
 *
 * Transforms bare filenames like "182102_foo.mp3" to "marine/182102_foo.mp3"
 * but leaves already-prefixed paths (like "default/announce.mp3") alone.
 */
function rewriteYamlSoundPaths(yamlContent: string, prefix: string): string {
  const lines = yamlContent.split("\n")
  const rewritten: string[] = []

  let inSounds = false

  for (const line of lines) {
    if (/^sounds:/.test(line)) {
      inSounds = true
      rewritten.push(line)
      continue
    }

    if (inSounds && /^\S/.test(line) && line.trim() !== "") {
      // Left the sounds block
      inSounds = false
      rewritten.push(line)
      continue
    }

    if (!inSounds) {
      rewritten.push(line)
      continue
    }

    // Inline value: "  key: filename.mp3"
    const inlineMatch = line.match(/^(\s{2}[a-z]+:\s+)(.+\.mp3.*)$/)
    if (inlineMatch) {
      const [, before, filename] = inlineMatch
      if (!filename.includes("/")) {
        rewritten.push(`${before}${prefix}/${filename}`)
      } else {
        rewritten.push(line)
      }
      continue
    }

    // List item: "    - filename.mp3"
    const listMatch = line.match(/^(\s{4}-\s+)(.+\.mp3.*)$/)
    if (listMatch) {
      const [, before, filename] = listMatch
      if (!filename.includes("/")) {
        rewritten.push(`${before}${prefix}/${filename}`)
      } else {
        rewritten.push(line)
      }
      continue
    }

    rewritten.push(line)
  }

  return rewritten.join("\n")
}

export async function installThemePack(source: string): Promise<void> {
  console.log()
  info("Installing theme pack")
  console.log()

  // --- Step 1: Get the zip file ---
  let zipPath: string
  let cleanupZip = false

  if (isUrl(source)) {
    step(`Downloading ${source}...`)
    const tmpZip = join(tmpdir(), `ocsfx-theme-${Date.now()}.zip`)
    try {
      downloadFile(source, tmpZip)
    } catch (e: any) {
      err(e.message)
      process.exit(1)
    }
    zipPath = tmpZip
    cleanupZip = true
    ok("Downloaded")
  } else {
    // Local path
    if (!existsSync(source)) {
      err(`File not found: ${source}`)
      process.exit(1)
    }
    zipPath = source
    ok(`Using local file: ${source}`)
  }

  // --- Step 2: Extract to temp directory ---
  const extractDir = join(tmpdir(), `ocsfx-theme-extract-${Date.now()}`)

  try {
    step("Extracting...")
    extractArchive(zipPath, extractDir)
    ok("Extracted")
  } catch (e: any) {
    err(e.message)
    if (cleanupZip) try { unlinkSync(zipPath) } catch {}
    process.exit(1)
  }

  // --- Step 3: Find theme YAML ---
  const themesSubDir = join(extractDir, "themes")
  if (!existsSync(themesSubDir)) {
    err("Invalid theme pack: no themes/ directory found in zip")
    rmSync(extractDir, { recursive: true, force: true })
    if (cleanupZip) try { unlinkSync(zipPath) } catch {}
    process.exit(1)
  }

  const yamlFiles = readdirSync(themesSubDir).filter(f =>
    f.endsWith(".yaml") || f.endsWith(".yml")
  )

  if (yamlFiles.length === 0) {
    err("Invalid theme pack: no .yaml files found in themes/ directory")
    rmSync(extractDir, { recursive: true, force: true })
    if (cleanupZip) try { unlinkSync(zipPath) } catch {}
    process.exit(1)
  }

  // --- Step 4: Install each theme from the pack ---
  const soundsSubDir = join(extractDir, "sounds")
  const hasSounds = existsSync(soundsSubDir)

  for (const yamlFile of yamlFiles) {
    const themeKey = basename(yamlFile, extname(yamlFile))
    const srcYaml = join(themesSubDir, yamlFile)
    const destYaml = join(THEMES_DIR, yamlFile)

    step(`Installing theme: ${themeKey}`)

    // Read and rewrite the YAML
    let yamlContent = readFileSync(srcYaml, "utf-8")

    // Install sounds if present
    if (hasSounds) {
      const soundFiles = readdirSync(soundsSubDir).filter(f =>
        /\.(mp3|wav|ogg|m4a|aac)$/i.test(f)
      )

      if (soundFiles.length > 0) {
        // Create sounds/<theme-key>/ directory
        const destSoundsDir = join(SOUNDS_DIR, themeKey)
        mkdirSync(destSoundsDir, { recursive: true })

        let copied = 0
        for (const sf of soundFiles) {
          copyFileSync(join(soundsSubDir, sf), join(destSoundsDir, sf))
          copied++
        }
        ok(`Copied ${copied} sound files to sounds/${themeKey}/`)

        // Rewrite YAML references to use the subdirectory
        yamlContent = rewriteYamlSoundPaths(yamlContent, themeKey)
      }
    }

    // Write the (possibly rewritten) theme YAML
    if (existsSync(destYaml)) {
      warn(`Overwriting existing theme: ${themeKey}`)
    }
    writeFileSync(destYaml, yamlContent)
    ok(`Installed theme YAML: themes/${yamlFile}`)
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
  if (cleanupZip) {
    try { unlinkSync(zipPath) } catch {}
  }

  console.log()
  info("Theme pack installed!")
  console.log("  Reload themes in your AI coding agent:")
  console.log("    /sfx reload")
  console.log()
}

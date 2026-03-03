#!/usr/bin/env node

/**
 * OpenCode SFX CLI
 *
 * Usage:
 *   opencode-sfx create              Create a new sound theme interactively
 *   opencode-sfx install <source>    Install a theme pack from URL or local zip
 *   opencode-sfx help                Show help
 */

import { createThemeWizard } from "./create-theme.js"
import { installThemePack } from "./install-theme.js"

const args = process.argv.slice(2)
const command = args[0]

function printHelp(): void {
  console.log(`
  opencode-sfx — Sound effects for AI coding agents

  Usage:
    opencode-sfx create              Create a new sound theme interactively
    opencode-sfx install <source>    Install a theme pack from a URL or local zip file
    opencode-sfx help                Show this help message

  Install examples:
    opencode-sfx install marine.zip
    opencode-sfx install https://example.com/themes/marine.zip
    opencode-sfx install ~/Downloads/ghost.zip

  Environment:
    OCSFX_SOUNDS_PATH      Custom path to your sound files directory
  `)
}

switch (command) {
  case "create":
    await createThemeWizard()
    break
  case "install": {
    const source = args[1]
    if (!source) {
      console.error("Error: missing source argument")
      console.error("Usage: opencode-sfx install <url-or-path>")
      process.exit(1)
    }
    await installThemePack(source)
    break
  }
  case "help":
  case "--help":
  case "-h":
  case undefined:
    printHelp()
    break
  default:
    console.error(`Unknown command: ${command}`)
    printHelp()
    process.exit(1)
}

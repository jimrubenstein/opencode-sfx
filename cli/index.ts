#!/usr/bin/env node

/**
 * OpenCode SFX CLI
 *
 * Usage:
 *   opencode-sfx create    Create a new sound theme interactively
 *   opencode-sfx help      Show help
 */

import { createThemeWizard } from "./create-theme.js"

const args = process.argv.slice(2)
const command = args[0]

function printHelp(): void {
  console.log(`
  opencode-sfx — Sound effects for OpenCode

  Usage:
    opencode-sfx create    Create a new sound theme interactively
    opencode-sfx help      Show this help message

  Environment:
    OCSFX_SOUNDS_PATH      Custom path to your sound files directory
  `)
}

switch (command) {
  case "create":
    await createThemeWizard()
    break
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

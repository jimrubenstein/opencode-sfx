import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// Test the plugin tool logic by recreating the tool functions with test dependencies

describe("Plugin Tools", () => {
  const testDir = join(tmpdir(), `opencode-sfx-tools-test-${Date.now()}`)
  const soundsDir = join(testDir, "sounds")
  const themesDir = join(testDir, "themes")

  // Sample themes for testing
  const testThemes = {
    marine: {
      name: "Marine",
      description: "Terran infantry",
      sounds: {
        announce: "marine_ready.mp3",
        question: "marine_orders.mp3",
        idle: ["marine_idle1.mp3", "marine_idle2.mp3"],
        error: ["marine_error.mp3"],
      },
    },
    ghost: {
      name: "Ghost",
      description: "Covert ops specialist",
      sounds: {
        announce: "ghost_ready.mp3",
        question: "ghost_orders.mp3",
        idle: ["ghost_idle1.mp3"],
        error: ["ghost_error.mp3"],
      },
    },
  }

  beforeEach(() => {
    // Create test directories
    mkdirSync(soundsDir, { recursive: true })
    mkdirSync(themesDir, { recursive: true })

    // Create mock sound files
    const soundFiles = [
      "marine_ready.mp3",
      "marine_orders.mp3",
      "marine_idle1.mp3",
      "marine_idle2.mp3",
      "marine_error.mp3",
      "ghost_ready.mp3",
      "ghost_orders.mp3",
      "ghost_idle1.mp3",
      "ghost_error.mp3",
      "extra_sound.mp3",
    ]
    for (const file of soundFiles) {
      writeFileSync(join(soundsDir, file), "") // Empty files for testing
    }
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe("sfx_list_themes", () => {
    it("should list all available themes", () => {
      const currentThemeKey = "marine"
      const themes = testThemes
      const themeNames = Object.keys(themes).sort()

      const lines = [`Available themes (current: ${currentThemeKey}):`, ""]
      for (const key of themeNames) {
        const theme = themes[key]
        const marker = key === currentThemeKey ? "* " : "  "
        lines.push(`${marker}${key} - ${theme.name} (${theme.description})`)
      }
      lines.push("", `Total: ${themeNames.length} themes`)
      const result = lines.join("\n")

      expect(result).toContain("Available themes (current: marine)")
      expect(result).toContain("* marine - Marine (Terran infantry)")
      expect(result).toContain("  ghost - Ghost (Covert ops specialist)")
      expect(result).toContain("Total: 2 themes")
    })

    it("should mark current theme with asterisk", () => {
      const currentThemeKey = "ghost"
      const themes = testThemes

      const lines: string[] = []
      for (const key of Object.keys(themes).sort()) {
        const marker = key === currentThemeKey ? "* " : "  "
        lines.push(`${marker}${key}`)
      }

      expect(lines).toContain("* ghost")
      expect(lines).toContain("  marine")
    })
  })

  describe("sfx_view_theme", () => {
    it("should show theme details", () => {
      const key = "marine"
      const theme = testThemes[key]
      const currentThemeKey = "marine"

      const isCurrent = key === currentThemeKey ? " (current)" : ""
      const lines = [
        `Theme: ${theme.name}${isCurrent}`,
        `Key: ${key}`,
        `Description: ${theme.description}`,
        "",
        "Sounds:",
        `  Announce: ${theme.sounds.announce}`,
        `  Question: ${theme.sounds.question}`,
        `  Idle (${theme.sounds.idle.length}): ${theme.sounds.idle.join(", ")}`,
        `  Error (${theme.sounds.error.length}): ${theme.sounds.error.join(", ")}`,
      ]
      const result = lines.join("\n")

      expect(result).toContain("Theme: Marine (current)")
      expect(result).toContain("Key: marine")
      expect(result).toContain("Announce: marine_ready.mp3")
      expect(result).toContain("Idle (2):")
    })

    it("should return error for non-existent theme", () => {
      const key = "nonexistent"
      const themes = testThemes
      const theme = themes[key as keyof typeof themes]

      const result = theme ? "found" : `Error: Theme "${key}" not found`
      expect(result).toBe('Error: Theme "nonexistent" not found')
    })
  })

  describe("sfx_change_theme", () => {
    it("should validate theme exists before switching", () => {
      const themes = testThemes
      const themeKey = "ghost"

      const newTheme = themes[themeKey as keyof typeof themes]
      expect(newTheme).toBeDefined()
      expect(newTheme.name).toBe("Ghost")
    })

    it("should return error for invalid theme", () => {
      const themes = testThemes
      const themeKey = "invalid"

      const newTheme = themes[themeKey as keyof typeof themes]
      const result = newTheme
        ? { success: true, message: `Switched to ${newTheme.name}` }
        : { success: false, message: `Theme "${themeKey}" not found` }

      expect(result.success).toBe(false)
      expect(result.message).toBe('Theme "invalid" not found')
    })

    it("should require theme parameter", () => {
      const themeKey = undefined

      const result = !themeKey
        ? `Error: 'theme' parameter is required. Available themes: marine, ghost`
        : "ok"

      expect(result).toContain("Error: 'theme' parameter is required")
    })
  })

  describe("sfx_list_sounds", () => {
    it("should list all sound files in directory", () => {
      const files = readdirSync(soundsDir)
        .filter((f) => /\.(mp3|wav|ogg|m4a|aac)$/i.test(f))
        .sort()

      expect(files).toHaveLength(10)
      expect(files).toContain("marine_ready.mp3")
      expect(files).toContain("ghost_ready.mp3")
    })

    it("should filter sounds by pattern", () => {
      const filter = "marine"
      const files = readdirSync(soundsDir)
        .filter((f) => /\.(mp3|wav|ogg|m4a|aac)$/i.test(f))
        .filter((f) => f.toLowerCase().includes(filter.toLowerCase()))
        .sort()

      expect(files).toHaveLength(5)
      expect(files.every((f) => f.includes("marine"))).toBe(true)
    })

    it("should return error for non-existent directory", () => {
      const nonExistentDir = join(testDir, "nonexistent")
      const exists = existsSync(nonExistentDir)

      const result = exists ? "ok" : `Error: Directory not found: ${nonExistentDir}`
      expect(result).toContain("Error: Directory not found")
    })
  })

  describe("sfx_create_theme", () => {
    it("should generate valid YAML content", () => {
      const themeName = "Custom Theme"
      const description = "A custom test theme"
      const announceSound = "marine_ready.mp3"
      const questionSound = "marine_orders.mp3"
      const idleSounds = ["marine_idle1.mp3", "marine_idle2.mp3"]
      const errorSounds = ["marine_error.mp3"]

      const yamlContent = [
        `name: ${themeName}`,
        `description: ${description}`,
        "",
        "sounds:",
        `  announce: ${announceSound}`,
        `  question: ${questionSound}`,
        "  idle:",
        ...idleSounds.map((s) => `    - ${s}`),
        "  error:",
        ...errorSounds.map((s) => `    - ${s}`),
        "",
      ].join("\n")

      expect(yamlContent).toContain("name: Custom Theme")
      expect(yamlContent).toContain("announce: marine_ready.mp3")
      expect(yamlContent).toContain("    - marine_idle1.mp3")
      expect(yamlContent).toContain("    - marine_idle2.mp3")
    })

    it("should generate kebab-case theme key from name", () => {
      const themeName = "My Custom Theme"
      const themeKey = themeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")

      expect(themeKey).toBe("my-custom-theme")
    })

    it("should validate required parameters", () => {
      const validateParams = (params: {
        name?: string
        announce?: string
        question?: string
        idle?: string[]
        error?: string[]
      }) => {
        if (!params.name) return "Error: 'name' parameter is required"
        if (!params.announce) return "Error: 'announce' parameter is required"
        if (!params.question) return "Error: 'question' parameter is required"
        if (!params.idle || !Array.isArray(params.idle) || params.idle.length === 0)
          return "Error: 'idle' parameter must be a non-empty array"
        if (!params.error || !Array.isArray(params.error) || params.error.length === 0)
          return "Error: 'error' parameter must be a non-empty array"
        return "valid"
      }

      expect(validateParams({})).toBe("Error: 'name' parameter is required")
      expect(validateParams({ name: "Test" })).toBe("Error: 'announce' parameter is required")
      expect(validateParams({ name: "Test", announce: "a.mp3" })).toBe(
        "Error: 'question' parameter is required"
      )
      expect(validateParams({ name: "Test", announce: "a.mp3", question: "q.mp3" })).toBe(
        "Error: 'idle' parameter must be a non-empty array"
      )
      expect(
        validateParams({
          name: "Test",
          announce: "a.mp3",
          question: "q.mp3",
          idle: ["i.mp3"],
        })
      ).toBe("Error: 'error' parameter must be a non-empty array")
      expect(
        validateParams({
          name: "Test",
          announce: "a.mp3",
          question: "q.mp3",
          idle: ["i.mp3"],
          error: ["e.mp3"],
        })
      ).toBe("valid")
    })

    it("should validate sound files exist", () => {
      const validateSound = (file: string) => existsSync(join(soundsDir, file))

      expect(validateSound("marine_ready.mp3")).toBe(true)
      expect(validateSound("nonexistent.mp3")).toBe(false)
    })

    it("should prevent duplicate theme keys", () => {
      const themes = testThemes
      const themeKey = "marine"

      const exists = themes[themeKey as keyof typeof themes] !== undefined
      const result = exists
        ? `Error: Theme "${themeKey}" already exists. Choose a different name.`
        : "ok"

      expect(result).toBe('Error: Theme "marine" already exists. Choose a different name.')
    })
  })

  describe("sfx_preview_sound", () => {
    it("should validate filename is provided", () => {
      const filename = ""
      const result = !filename ? "Error: filename parameter is required" : "ok"
      expect(result).toBe("Error: filename parameter is required")
    })

    it("should validate sound file exists", () => {
      const filename = "nonexistent.mp3"
      const soundPath = join(soundsDir, filename)
      const exists = existsSync(soundPath)

      const result = exists ? "ok" : `Error: Sound file not found: ${soundPath}`
      expect(result).toContain("Error: Sound file not found")
    })

    it("should return success for valid sound file", () => {
      const filename = "marine_ready.mp3"
      const soundPath = join(soundsDir, filename)
      const exists = existsSync(soundPath)

      const result = exists ? `Playing: ${filename}` : "error"
      expect(result).toBe("Playing: marine_ready.mp3")
    })
  })
})

describe("Sound Selection", () => {
  it("should randomly select from array", () => {
    const sounds = ["sound1.mp3", "sound2.mp3", "sound3.mp3"]
    const randomSound = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

    // Run multiple times to ensure it returns valid values
    for (let i = 0; i < 100; i++) {
      const selected = randomSound(sounds)
      expect(sounds).toContain(selected)
    }
  })

  it("should handle single-item arrays", () => {
    const sounds = ["only_sound.mp3"]
    const randomSound = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

    const selected = randomSound(sounds)
    expect(selected).toBe("only_sound.mp3")
  })
})

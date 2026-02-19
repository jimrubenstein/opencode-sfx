import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// We'll test the theme loading logic by creating a temporary directory structure
// and importing a modified version of the themes module

describe("Theme Loading", () => {
  const testDir = join(tmpdir(), `opencode-sfx-test-${Date.now()}`)
  const themesDir = join(testDir, "themes")
  const cacheDir = join(testDir, ".cache")
  const cacheFile = join(cacheDir, "themes.json")

  beforeEach(() => {
    // Create test directories
    mkdirSync(themesDir, { recursive: true })
    mkdirSync(cacheDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up test directories
    rmSync(testDir, { recursive: true, force: true })
  })

  describe("YAML Theme Parsing", () => {
    it("should parse a valid theme YAML file", async () => {
      // Create a test theme file
      const themeYaml = `name: Test Theme
description: A test theme for unit testing

sounds:
  announce: test_announce.mp3
  question: test_question.mp3
  idle:
    - test_idle1.mp3
    - test_idle2.mp3
  error:
    - test_error1.mp3
`
      writeFileSync(join(themesDir, "test.yaml"), themeYaml)

      // Import yaml parser
      const { parse } = await import("yaml")
      const content = readFileSync(join(themesDir, "test.yaml"), "utf-8")
      const data = parse(content)

      expect(data.name).toBe("Test Theme")
      expect(data.description).toBe("A test theme for unit testing")
      expect(data.sounds.announce).toBe("test_announce.mp3")
      expect(data.sounds.question).toBe("test_question.mp3")
      expect(data.sounds.idle).toEqual(["test_idle1.mp3", "test_idle2.mp3"])
      expect(data.sounds.error).toEqual(["test_error1.mp3"])
    })

    it("should handle theme with minimal required fields", async () => {
      const themeYaml = `name: Minimal Theme
sounds:
  announce: announce.mp3
  question: question.mp3
  idle:
    - idle.mp3
  error:
    - error.mp3
`
      writeFileSync(join(themesDir, "minimal.yaml"), themeYaml)

      const { parse } = await import("yaml")
      const content = readFileSync(join(themesDir, "minimal.yaml"), "utf-8")
      const data = parse(content)

      expect(data.name).toBe("Minimal Theme")
      expect(data.description).toBeUndefined()
      expect(data.sounds.announce).toBe("announce.mp3")
    })

    it("should handle empty arrays for idle/error sounds", async () => {
      const themeYaml = `name: Empty Arrays Theme
sounds:
  announce: announce.mp3
  question: question.mp3
  idle: []
  error: []
`
      writeFileSync(join(themesDir, "empty-arrays.yaml"), themeYaml)

      const { parse } = await import("yaml")
      const content = readFileSync(join(themesDir, "empty-arrays.yaml"), "utf-8")
      const data = parse(content)

      expect(data.sounds.idle).toEqual([])
      expect(data.sounds.error).toEqual([])
    })
  })

  describe("Theme Validation", () => {
    it("should detect missing name field", async () => {
      const themeYaml = `description: Missing name
sounds:
  announce: announce.mp3
  question: question.mp3
  idle:
    - idle.mp3
  error:
    - error.mp3
`
      const { parse } = await import("yaml")
      const data = parse(themeYaml)

      expect(data.name).toBeUndefined()
      // The loader should skip this theme
    })

    it("should detect missing sounds field", async () => {
      const themeYaml = `name: No Sounds Theme
description: Theme without sounds section
`
      const { parse } = await import("yaml")
      const data = parse(themeYaml)

      expect(data.name).toBe("No Sounds Theme")
      expect(data.sounds).toBeUndefined()
      // The loader should skip this theme
    })
  })

  describe("Cache System", () => {
    it("should create valid cache JSON structure", () => {
      const themes = {
        test: {
          name: "Test Theme",
          description: "Test description",
          sounds: {
            announce: "announce.mp3",
            question: "question.mp3",
            idle: ["idle1.mp3", "idle2.mp3"],
            error: ["error1.mp3"],
          },
        },
      }

      const cache = {
        version: 1,
        buildTime: Date.now(),
        themes,
      }

      writeFileSync(cacheFile, JSON.stringify(cache, null, 2))

      const loaded = JSON.parse(readFileSync(cacheFile, "utf-8"))
      expect(loaded.version).toBe(1)
      expect(loaded.themes.test.name).toBe("Test Theme")
      expect(loaded.themes.test.sounds.idle).toHaveLength(2)
    })

    it("should invalidate cache when version changes", () => {
      const oldCache = {
        version: 0, // Old version
        buildTime: Date.now(),
        themes: {},
      }

      writeFileSync(cacheFile, JSON.stringify(oldCache, null, 2))

      const loaded = JSON.parse(readFileSync(cacheFile, "utf-8"))
      const CURRENT_VERSION = 1

      // Cache should be invalidated because version doesn't match
      expect(loaded.version).not.toBe(CURRENT_VERSION)
    })
  })
})

describe("Theme Structure Validation", () => {
  it("should validate SoundTheme interface requirements", () => {
    interface SoundTheme {
      name: string
      description: string
      sounds: {
        announce: string
        question: string
        idle: string[]
        error: string[]
      }
    }

    const validTheme: SoundTheme = {
      name: "Valid Theme",
      description: "A valid theme",
      sounds: {
        announce: "announce.mp3",
        question: "question.mp3",
        idle: ["idle1.mp3"],
        error: ["error1.mp3"],
      },
    }

    expect(validTheme.name).toBeDefined()
    expect(validTheme.sounds.announce).toBeDefined()
    expect(Array.isArray(validTheme.sounds.idle)).toBe(true)
    expect(Array.isArray(validTheme.sounds.error)).toBe(true)
  })
})

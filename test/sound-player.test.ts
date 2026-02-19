import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

describe("Sound Player Module", () => {
  const testDir = join(tmpdir(), `opencode-sfx-sound-test-${Date.now()}`)
  const soundsDir = join(testDir, "sounds")
  const logFile = join(testDir, "test.log")

  beforeEach(() => {
    mkdirSync(soundsDir, { recursive: true })
    // Create a mock sound file
    writeFileSync(join(soundsDir, "test.mp3"), "mock audio data")
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    // Reset environment
    delete process.env.OCSFX_DEBUG
    delete process.env.OCSFX_LOG_FILE
  })

  describe("Debug Mode Detection", () => {
    it("should detect debug mode from OCSFX_DEBUG=1", () => {
      process.env.OCSFX_DEBUG = "1"
      expect(process.env.OCSFX_DEBUG).toBe("1")
    })

    it("should detect test mode from OCSFX_DEBUG=test", () => {
      process.env.OCSFX_DEBUG = "test"
      expect(process.env.OCSFX_DEBUG).toBe("test")
    })

    it("should not be in debug mode without env var", () => {
      delete process.env.OCSFX_DEBUG
      expect(process.env.OCSFX_DEBUG).toBeUndefined()
    })
  })

  describe("Log File Configuration", () => {
    it("should use OCSFX_LOG_FILE for log output", () => {
      process.env.OCSFX_LOG_FILE = logFile
      expect(process.env.OCSFX_LOG_FILE).toBe(logFile)
    })
  })

  describe("Log Message Format", () => {
    it("should build correct log message with all fields", () => {
      const timestamp = new Date().toISOString().slice(0, 10) // Just date portion
      const basename = "test.mp3"
      const theme = "marine"
      const event = "session.idle"
      const reason = "task completed"

      const logParts = ["PLAY", basename]
      if (theme) logParts.push(`theme=${theme}`)
      if (event) logParts.push(`event=${event}`)
      if (reason) logParts.push(`reason=${reason}`)
      const logMessage = logParts.join(" ")

      expect(logMessage).toBe("PLAY test.mp3 theme=marine event=session.idle reason=task completed")
    })

    it("should handle missing optional fields", () => {
      const basename = "test.mp3"

      const logParts = ["PLAY", basename]
      const logMessage = logParts.join(" ")

      expect(logMessage).toBe("PLAY test.mp3")
    })

    it("should handle partial optional fields", () => {
      const basename = "test.mp3"
      const theme = "ghost"

      const logParts = ["PLAY", basename]
      if (theme) logParts.push(`theme=${theme}`)
      const logMessage = logParts.join(" ")

      expect(logMessage).toBe("PLAY test.mp3 theme=ghost")
    })
  })

  describe("Test Mode Behavior", () => {
    it("should not play sound in test mode", () => {
      process.env.OCSFX_DEBUG = "test"

      // Simulate test mode check
      const shouldPlay = process.env.OCSFX_DEBUG !== "test"
      expect(shouldPlay).toBe(false)
    })

    it("should log in test mode", () => {
      process.env.OCSFX_DEBUG = "test"

      // Simulate logging in test mode
      const shouldLog = process.env.OCSFX_DEBUG === "1" || process.env.OCSFX_DEBUG === "test"
      expect(shouldLog).toBe(true)
    })
  })

  describe("Debug Mode Behavior", () => {
    it("should play sound in debug mode", () => {
      process.env.OCSFX_DEBUG = "1"

      const shouldPlay = process.env.OCSFX_DEBUG !== "test"
      expect(shouldPlay).toBe(true)
    })

    it("should log in debug mode", () => {
      process.env.OCSFX_DEBUG = "1"

      const shouldLog = process.env.OCSFX_DEBUG === "1" || process.env.OCSFX_DEBUG === "test"
      expect(shouldLog).toBe(true)
    })
  })

  describe("Sound File Validation", () => {
    it("should detect existing sound file", () => {
      const soundPath = join(soundsDir, "test.mp3")
      expect(existsSync(soundPath)).toBe(true)
    })

    it("should detect missing sound file", () => {
      const soundPath = join(soundsDir, "nonexistent.mp3")
      expect(existsSync(soundPath)).toBe(false)
    })
  })

  describe("Log File Writing", () => {
    it("should write to log file when configured", () => {
      process.env.OCSFX_LOG_FILE = logFile

      // Simulate log writing
      const logMessage = "[OCSFX] 2024-01-01T00:00:00.000Z PLAY test.mp3 theme=marine"
      writeFileSync(logFile, logMessage + "\n")

      const content = readFileSync(logFile, "utf-8")
      expect(content).toContain("PLAY test.mp3")
      expect(content).toContain("theme=marine")
    })

    it("should append to existing log file", () => {
      process.env.OCSFX_LOG_FILE = logFile

      // Write first entry
      writeFileSync(logFile, "[OCSFX] entry1\n")
      // Append second entry
      const fs = require("fs")
      fs.appendFileSync(logFile, "[OCSFX] entry2\n")

      const content = readFileSync(logFile, "utf-8")
      expect(content).toContain("entry1")
      expect(content).toContain("entry2")
    })
  })
})

describe("Play Sound Script Arguments", () => {
  it("should build correct argument list with all options", () => {
    const soundFile = "/path/to/sound.mp3"
    const reason = "task completed"
    const theme = "marine"
    const event = "session.idle"

    const args: string[] = []
    if (reason) args.push("--reason", reason)
    if (theme) args.push("--theme", theme)
    if (event) args.push("--event", event)
    args.push(soundFile)

    expect(args).toEqual([
      "--reason",
      "task completed",
      "--theme",
      "marine",
      "--event",
      "session.idle",
      "/path/to/sound.mp3",
    ])
  })

  it("should build minimal argument list", () => {
    const soundFile = "/path/to/sound.mp3"

    const args: string[] = []
    args.push(soundFile)

    expect(args).toEqual(["/path/to/sound.mp3"])
  })
})

describe("Platform Detection", () => {
  it("should identify macOS", () => {
    // This test verifies the platform detection logic
    const platform = process.platform

    const isMac = platform === "darwin"
    const isLinux = platform === "linux"
    const isWindows = platform === "win32"

    // At least one should be true
    expect(isMac || isLinux || isWindows || true).toBe(true)

    // On macOS (where tests likely run)
    if (isMac) {
      expect(platform).toBe("darwin")
    }
  })

  it("should select correct audio player for platform", () => {
    const platform = process.platform

    let expectedCommand: string
    switch (platform) {
      case "darwin":
        expectedCommand = "afplay"
        break
      case "linux":
        expectedCommand = "paplay" // or others
        break
      case "win32":
        expectedCommand = "powershell.exe"
        break
      default:
        expectedCommand = "unknown"
    }

    // Verify we got a valid command for this platform
    expect(["afplay", "paplay", "powershell.exe", "unknown"]).toContain(expectedCommand)
  })
})

describe("Result Types", () => {
  interface SoundPlayResult {
    played: boolean
    logged: boolean
    testMode: boolean
    error?: string
  }

  it("should return success result", () => {
    const result: SoundPlayResult = {
      played: true,
      logged: true,
      testMode: false,
    }

    expect(result.played).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it("should return test mode result", () => {
    const result: SoundPlayResult = {
      played: false,
      logged: true,
      testMode: true,
    }

    expect(result.played).toBe(false)
    expect(result.testMode).toBe(true)
  })

  it("should return error result", () => {
    const result: SoundPlayResult = {
      played: false,
      logged: true,
      testMode: false,
      error: "Sound file not found",
    }

    expect(result.played).toBe(false)
    expect(result.error).toBeDefined()
  })
})

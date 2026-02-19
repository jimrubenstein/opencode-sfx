import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// Test profile and instance management logic

describe("TTY Profile Management", () => {
  const testDir = join(tmpdir(), `opencode-sfx-profile-test-${Date.now()}`)
  const stateDir = join(testDir, ".opencode-sfx")
  const ttyProfilesFile = join(stateDir, "tty-profiles.json")

  beforeEach(() => {
    mkdirSync(stateDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe("TTY Profiles Storage", () => {
    it("should save and load TTY profiles", () => {
      const profiles = {
        profiles: {
          "tmux:12345:1234567890:%1": "marine",
          "wezterm:socket123:0": "ghost",
        },
      }

      writeFileSync(ttyProfilesFile, JSON.stringify(profiles, null, 2))

      const loaded = JSON.parse(readFileSync(ttyProfilesFile, "utf-8"))
      expect(loaded.profiles["tmux:12345:1234567890:%1"]).toBe("marine")
      expect(loaded.profiles["wezterm:socket123:0"]).toBe("ghost")
    })

    it("should handle empty profiles file", () => {
      const profiles = { profiles: {} }
      writeFileSync(ttyProfilesFile, JSON.stringify(profiles, null, 2))

      const loaded = JSON.parse(readFileSync(ttyProfilesFile, "utf-8"))
      expect(Object.keys(loaded.profiles)).toHaveLength(0)
    })

    it("should update existing TTY profile", () => {
      const profiles = {
        profiles: {
          "tmux:12345:1234567890:%1": "marine",
        },
      }
      writeFileSync(ttyProfilesFile, JSON.stringify(profiles, null, 2))

      // Update the profile
      const loaded = JSON.parse(readFileSync(ttyProfilesFile, "utf-8"))
      loaded.profiles["tmux:12345:1234567890:%1"] = "ghost"
      writeFileSync(ttyProfilesFile, JSON.stringify(loaded, null, 2))

      const updated = JSON.parse(readFileSync(ttyProfilesFile, "utf-8"))
      expect(updated.profiles["tmux:12345:1234567890:%1"]).toBe("ghost")
    })
  })

  describe("Directory Profile File (.ocsfx)", () => {
    it("should read profile from .ocsfx file", () => {
      const profileFile = join(testDir, ".ocsfx")
      writeFileSync(profileFile, "marine\n")

      const profile = readFileSync(profileFile, "utf-8").trim()
      expect(profile).toBe("marine")
    })

    it("should handle missing .ocsfx file", () => {
      const profileFile = join(testDir, ".ocsfx")
      const exists = existsSync(profileFile)
      expect(exists).toBe(false)
    })

    it("should trim whitespace from profile name", () => {
      const profileFile = join(testDir, ".ocsfx")
      writeFileSync(profileFile, "  marine  \n\n")

      const profile = readFileSync(profileFile, "utf-8").trim()
      expect(profile).toBe("marine")
    })
  })

  describe("Profile Priority", () => {
    it("should follow priority: env > file > tty > random", () => {
      const allThemes = ["marine", "ghost", "goliath"]

      // Simulate priority logic
      const determineProfile = (opts: {
        envProfile?: string
        dirProfile?: string
        ttyProfile?: string
      }) => {
        // 1. Check environment variable first
        if (opts.envProfile && allThemes.includes(opts.envProfile)) {
          return { profile: opts.envProfile, source: "env" }
        }

        // 2. Check .ocsfx in current directory
        if (opts.dirProfile && allThemes.includes(opts.dirProfile)) {
          return { profile: opts.dirProfile, source: "file" }
        }

        // 3. Check TTY-to-profile mapping
        if (opts.ttyProfile && allThemes.includes(opts.ttyProfile)) {
          return { profile: opts.ttyProfile, source: "tty" }
        }

        // 4. Random selection
        const randomProfile = allThemes[Math.floor(Math.random() * allThemes.length)]
        return { profile: randomProfile, source: "random" }
      }

      // Test env takes priority
      const result1 = determineProfile({
        envProfile: "marine",
        dirProfile: "ghost",
        ttyProfile: "goliath",
      })
      expect(result1.source).toBe("env")
      expect(result1.profile).toBe("marine")

      // Test file takes priority over tty
      const result2 = determineProfile({
        envProfile: undefined,
        dirProfile: "ghost",
        ttyProfile: "goliath",
      })
      expect(result2.source).toBe("file")
      expect(result2.profile).toBe("ghost")

      // Test tty takes priority over random
      const result3 = determineProfile({
        envProfile: undefined,
        dirProfile: undefined,
        ttyProfile: "goliath",
      })
      expect(result3.source).toBe("tty")
      expect(result3.profile).toBe("goliath")

      // Test random fallback
      const result4 = determineProfile({
        envProfile: undefined,
        dirProfile: undefined,
        ttyProfile: undefined,
      })
      expect(result4.source).toBe("random")
      expect(allThemes).toContain(result4.profile)
    })

    it("should ignore invalid theme names", () => {
      const allThemes = ["marine", "ghost"]

      const determineProfile = (envProfile?: string) => {
        if (envProfile && allThemes.includes(envProfile)) {
          return { profile: envProfile, source: "env" }
        }
        return { profile: "marine", source: "default" }
      }

      const result = determineProfile("invalid-theme")
      expect(result.source).toBe("default")
    })
  })
})

describe("Instance State Management", () => {
  const testDir = join(tmpdir(), `opencode-sfx-instance-test-${Date.now()}`)
  const stateDir = join(testDir, ".opencode-sfx")
  const instancesFile = join(stateDir, "instances.json")

  beforeEach(() => {
    mkdirSync(stateDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe("Instance Registration", () => {
    it("should register new instance", () => {
      const state = { instances: {} as Record<string, { theme: string; startedAt: string }> }
      const instanceId = "12345"
      const theme = "marine"

      state.instances[instanceId] = {
        theme,
        startedAt: new Date().toISOString(),
      }

      writeFileSync(instancesFile, JSON.stringify(state, null, 2))

      const loaded = JSON.parse(readFileSync(instancesFile, "utf-8"))
      expect(loaded.instances["12345"].theme).toBe("marine")
    })

    it("should track multiple instances", () => {
      const state = {
        instances: {
          "12345": { theme: "marine", startedAt: new Date().toISOString() },
          "12346": { theme: "ghost", startedAt: new Date().toISOString() },
          "12347": { theme: "goliath", startedAt: new Date().toISOString() },
        },
      }

      writeFileSync(instancesFile, JSON.stringify(state, null, 2))

      const loaded = JSON.parse(readFileSync(instancesFile, "utf-8"))
      expect(Object.keys(loaded.instances)).toHaveLength(3)
    })

    it("should remove instance on cleanup", () => {
      const state: {
        instances: Record<string, { theme: string; startedAt: string } | undefined>
      } = {
        instances: {
          "12345": { theme: "marine", startedAt: new Date().toISOString() },
          "12346": { theme: "ghost", startedAt: new Date().toISOString() },
        },
      }

      // Remove one instance
      delete state.instances["12345"]

      writeFileSync(instancesFile, JSON.stringify(state, null, 2))

      const loaded = JSON.parse(readFileSync(instancesFile, "utf-8"))
      expect(loaded.instances["12345"]).toBeUndefined()
      expect(loaded.instances["12346"]).toBeDefined()
    })
  })

  describe("Stale Instance Cleanup", () => {
    it("should identify stale instances older than 24 hours", () => {
      const now = Date.now()
      const maxAge = 24 * 60 * 60 * 1000

      const state: {
        instances: Record<string, { theme: string; startedAt: string } | undefined>
      } = {
        instances: {
          "12345": {
            theme: "marine",
            startedAt: new Date(now - maxAge - 1000).toISOString(), // 24h + 1s ago
          },
          "12346": {
            theme: "ghost",
            startedAt: new Date(now - 1000).toISOString(), // 1s ago
          },
        },
      }

      // Clean up stale instances
      for (const [pid, info] of Object.entries(state.instances)) {
        if (!info) continue
        const startedAt = new Date(info.startedAt).getTime()
        if (now - startedAt > maxAge) {
          delete state.instances[pid]
        }
      }

      expect(state.instances["12345"]).toBeUndefined()
      expect(state.instances["12346"]).toBeDefined()
    })
  })

  describe("Available Themes Calculation", () => {
    it("should exclude themes used by other instances", () => {
      const allThemes = ["marine", "ghost", "goliath", "wraith"]
      const state = {
        instances: {
          "12345": { theme: "marine", startedAt: new Date().toISOString() },
          "12346": { theme: "ghost", startedAt: new Date().toISOString() },
        },
      }

      const usedThemes = new Set(Object.values(state.instances).map((i) => i.theme))
      const available = allThemes.filter((t) => !usedThemes.has(t))

      expect(available).toEqual(["goliath", "wraith"])
      expect(available).not.toContain("marine")
      expect(available).not.toContain("ghost")
    })

    it("should return all themes when all are in use", () => {
      const allThemes = ["marine", "ghost"]
      const state = {
        instances: {
          "12345": { theme: "marine", startedAt: new Date().toISOString() },
          "12346": { theme: "ghost", startedAt: new Date().toISOString() },
        },
      }

      const usedThemes = new Set(Object.values(state.instances).map((i) => i.theme))
      const available = allThemes.filter((t) => !usedThemes.has(t))

      // When all themes are used, return all (allow duplicates)
      const result = available.length > 0 ? available : allThemes
      expect(result).toEqual(["marine", "ghost"])
    })
  })
})

describe("TTY Identifier Generation", () => {
  it("should build identifier from tmux environment", () => {
    const buildTtyIdentifier = (env: Record<string, string | undefined>) => {
      const parts: string[] = []

      if (env.TMUX && env.TMUX_PANE) {
        const tmuxParts = env.TMUX.split(",")
        const serverPid = tmuxParts.length >= 2 ? tmuxParts[1] : "unknown"
        const startTime = "1234567890" // Simulated
        parts.push(`tmux:${serverPid}:${startTime}:${env.TMUX_PANE}`)
      }

      if (env.WEZTERM_PANE) {
        const socket = env.WEZTERM_UNIX_SOCKET || ""
        const socketId = socket.split("/").pop() || ""
        parts.push(`wezterm:${socketId}:${env.WEZTERM_PANE}`)
      }

      return parts.length > 0 ? parts.join("+") : null
    }

    // Test tmux identifier
    const tmuxId = buildTtyIdentifier({
      TMUX: "/tmp/tmux-501/default,12345,0",
      TMUX_PANE: "%1",
    })
    expect(tmuxId).toBe("tmux:12345:1234567890:%1")

    // Test wezterm identifier
    const weztermId = buildTtyIdentifier({
      WEZTERM_PANE: "0",
      WEZTERM_UNIX_SOCKET: "/run/user/501/wezterm/socket",
    })
    expect(weztermId).toBe("wezterm:socket:0")

    // Test combined
    const combinedId = buildTtyIdentifier({
      TMUX: "/tmp/tmux-501/default,12345,0",
      TMUX_PANE: "%1",
      WEZTERM_PANE: "0",
      WEZTERM_UNIX_SOCKET: "/run/user/501/wezterm/socket",
    })
    expect(combinedId).toBe("tmux:12345:1234567890:%1+wezterm:socket:0")

    // Test no identifiers
    const noId = buildTtyIdentifier({})
    expect(noId).toBeNull()
  })
})

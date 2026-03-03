# Claude Code

**Environment:** Terminal
**Support level:** Full — all four plugin objectives are natively supported.

---

## Plugin objective mapping

### 1. Main agent finished / idle

**Hook:** `Stop`, `TaskCompleted`

- `Stop` fires when the main agent stops executing.
- `TaskCompleted` fires when the agent completes a unit of work.
- Both are main-agent events. Sub-agent equivalents (`SubagentStop`, `TeammateIdle`) exist separately and should **not** trigger this alert.

**Handler type:** Shell command hook

### 2. Agent needs user input / permission

**Hooks:** `Notification`, `PermissionRequest`

- `PermissionRequest` fires when the agent requires explicit user approval to proceed.
- `Notification` is a general-purpose attention signal emitted when the agent needs user awareness.
- These events fire system-wide, covering both main agent and sub-agent scenarios.

**Handler type:** Shell command hook

### 3. Error occurred

**Hook:** `PostToolUseFailure`

- Fires after a tool execution fails.
- Covers tool failures across all agent tiers (main and sub-agents).

**Handler type:** Shell command hook

### 4. Startup greeting / announcement

**Hook:** `SessionStart`

- Fires once when a new session begins.
- Session-level event, not tied to a specific agent tier.

**Handler type:** Shell command hook

---

## Hook execution model

Claude Code supports multiple handler types depending on the event:

- **Shell command hooks** — run a command, receive event JSON on stdin
- **HTTP hooks** — receive hook payloads as HTTP POST requests
- **Prompt / agent hooks** — supported for certain events

For the SFX plugin, shell command hooks are the primary integration method.

### Hook input

Hooks receive structured JSON on stdin describing the event, including context about which tool was invoked, what the parameters were, and other event-specific metadata.

### Control semantics

Claude Code hooks can return structured output that influences agent behavior:

- `PreToolUse` supports allow / deny / ask decisions and tool input rewriting
- Async hooks can run in the background without blocking

For SFX purposes, we only need the hook to execute (play a sound) — we do not need to return control output to the agent.

---

## Full event surface (reference)

Claude Code documents the following hooks:

| Event | Relevant to SFX? | Notes |
|---|---|---|
| `SessionStart` | Yes — startup greeting | |
| `SessionEnd` | No | |
| `UserPromptSubmit` | No | |
| `PreToolUse` | No | |
| `PostToolUse` | No | |
| `PostToolUseFailure` | Yes — error alert | |
| `PermissionRequest` | Yes — needs input alert | |
| `Notification` | Yes — needs input alert | |
| `SubagentStart` | No | |
| `SubagentStop` | No — sub-agent lifecycle, not used for "finished" alert | |
| `Stop` | Yes — main agent finished | |
| `TeammateIdle` | No — sub-agent idle, not used for "finished" alert | |
| `TaskCompleted` | Yes — main agent finished | |
| `ConfigChange` | No | |
| `WorktreeCreate` | No | |
| `WorktreeRemove` | No | |
| `PreCompact` | No | |

---

## Shortcomings

None for the SFX plugin use case. Claude Code provides dedicated, first-class hooks for every objective.

---

## Configuration

Hooks are configured in Claude Code's settings files (e.g., `~/.claude/settings.json` or project-level equivalents).

---

## Sources

- [Claude Code hooks documentation](https://code.claude.com/docs/en/hooks)

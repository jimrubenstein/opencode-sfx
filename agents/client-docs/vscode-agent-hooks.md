# VS Code Agent Hooks

**Environment:** Desktop IDE (standalone)
**Support level:** Partial — three of four objectives supported; "needs user input" has no direct hook.
**Status:** Preview feature — behavior and schema may still evolve.

---

## Plugin objective mapping

### 1. Main agent finished / idle

**Hook:** `Stop`

- Fires when the agent stops executing.
- `SubagentStop` is a separate event and should **not** trigger this alert.
- No separate "task completed" or "idle" event is documented; `Stop` is the only signal.

**Handler type:** Shell command

### 2. Agent needs user input / permission

**Hook:** None

- VS Code Agent Hooks do **not** expose a `PermissionRequest`, `Notification`, or equivalent event.
- `PreToolUse` can gate actions with allow/deny/ask decisions, but this runs *your* hook code to make a policy decision — it does not signal that the agent is blocked waiting for the user.
- There is no reliable way to detect "agent is waiting for user input" through the hook system alone.

**This is a gap.** An IDE extension could potentially fill it, but the hook system does not cover this objective.

### 3. Error occurred

**Hook:** `PostToolUse` (inspect payload for failure indicators)

- VS Code does **not** have a dedicated error/failure hook like Claude Code's `PostToolUseFailure`.
- The `PostToolUse` hook fires after every tool execution. To detect errors, the hook handler must parse the JSON payload and check for failure indicators (non-zero exit codes, error messages, etc.).
- This is functional but requires payload inspection logic in the hook script.

**Handler type:** Shell command with payload parsing

### 4. Startup greeting / announcement

**Hook:** `SessionStart`

- Fires once when a new agent session begins.
- Clean, direct support.

**Handler type:** Shell command

---

## Hook execution model

Hooks are configured as shell commands.

- Structured JSON is passed to the hook on stdin.
- The hook can emit JSON on stdout.
- Exit codes affect control flow (exit code `2` blocks execution for `PreToolUse`).

### Control semantics

For `PreToolUse`, hooks can:

- Allow, deny, or ask
- Attach additional context
- Return updated input (tool input rewriting)

These capabilities are not needed for SFX purposes.

---

## Supported events (reference)

| Event | Relevant to SFX? | Notes |
|---|---|---|
| `SessionStart` | Yes — startup greeting | |
| `UserPromptSubmit` | No | |
| `PreToolUse` | No | |
| `PostToolUse` | Yes — error detection (requires payload parsing) | |
| `PreCompact` | No | |
| `SubagentStart` | No | |
| `SubagentStop` | No — sub-agent lifecycle only | |
| `Stop` | Yes — main agent finished | |

---

## Shortcomings

1. **No "needs user input" hook.** This is the most significant gap. There is no `PermissionRequest`, `Notification`, or equivalent. The plugin cannot alert when the agent is waiting for user approval or answers.

2. **No dedicated error hook.** Error detection relies on parsing `PostToolUse` payloads rather than a purpose-built failure event. This requires the hook script to contain inspection logic and may miss errors that don't come through tool execution.

3. **Preview status.** The hook system is documented as Preview. The event set, payload schema, or behavior may change.

---

## Configuration locations

VS Code searches multiple hook locations:

- `.github/hooks/*.json`
- `.claude/settings.json`
- `.claude/settings.local.json`
- `~/.claude/settings.json`

---

## Sources

- [VS Code Agent Hooks documentation](https://code.visualstudio.com/docs/copilot/customization/hooks)

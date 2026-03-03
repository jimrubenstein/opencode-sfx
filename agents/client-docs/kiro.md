# Kiro

**Environment:** Desktop IDE + CLI
**Support level:** Partial — two of four objectives fully supported, one via payload parsing, one missing. IDE and CLI have different hook surfaces.

---

## Plugin objective mapping

### 1. Main agent finished / idle

**Hook:** `Stop` (CLI), Agent Stop (IDE)

- Available in both environments.
- Fires when the main agent stops executing.
- No separate "task completed" or "idle" event.

**Handler type:** Shell command

### 2. Agent needs user input / permission

**Hook:** None

- No `PermissionRequest`, `Notification`, or equivalent event is documented for either the IDE or CLI.
- There is no mechanism to detect "agent is blocked waiting for user input" through hooks.

**This is a gap.** Cannot be solved with the current hook system.

### 3. Error occurred

**Hook:** `PostToolUse` (inspect payload for failure indicators)

- No dedicated error/failure hook exists.
- `PostToolUse` fires after every tool execution. To detect errors, the hook handler must parse the JSON payload and check for failure indicators.
- This is functional but requires inspection logic in the hook script and may miss errors that don't originate from tool execution.

**Handler type:** Shell command with payload parsing

### 4. Startup greeting / announcement

**Hook:** `AgentSpawn` (CLI only)

- `AgentSpawn` fires when the CLI agent starts and is the closest equivalent to a session-start event.
- The IDE does **not** have an explicit session-start hook. The nearest IDE equivalent is the Prompt Submit hook, which fires on first user interaction — not on load.
- For IDE usage, the startup greeting cannot be reliably triggered at session start.

**Handler type:** Shell command (CLI only)

---

## Hook execution model

### IDE hooks

Kiro IDE hooks support two action types:

- **Shell command** — run a command
- **Ask Kiro** — dispatch an agent prompt (agentic follow-up)

IDE hooks are broader than pure agent lifecycle, including file and task workflow triggers.

### CLI hooks

- Hook input is JSON on stdin.
- Exit codes affect behavior.
- `PreToolUse` can block execution using exit code `2`.
- stderr can be returned to the model in blocked flows.
- Kiro supports tool matching via a `matcher` field for both built-in and MCP tools.

---

## Supported events (reference)

### IDE hooks

| Event | Relevant to SFX? | Notes |
|---|---|---|
| Prompt Submit | No (but could serve as startup proxy on first prompt) | |
| Agent Stop | Yes — main agent finished | |
| Pre Tool Use | No | |
| Post Tool Use | Yes — error detection (requires payload parsing) | |
| File Create | No | |
| File Save | No | |
| File Delete | No | |
| Pre Task Execution | No | |
| Post Task Execution | No | |
| Manual Trigger | No | |

### CLI hooks

| Event | Relevant to SFX? | Notes |
|---|---|---|
| `AgentSpawn` | Yes — startup greeting (CLI only) | |
| `UserPromptSubmit` | No | |
| `PreToolUse` | No | |
| `PostToolUse` | Yes — error detection (requires payload parsing) | |
| `Stop` | Yes — main agent finished | |

---

## Shortcomings

1. **No "needs user input" hook.** No permission-request or notification event in either IDE or CLI. The plugin cannot alert when the agent is waiting for user approval.

2. **No dedicated error hook.** Error detection relies on parsing `PostToolUse` payloads. This requires inspection logic and may miss non-tool errors.

3. **IDE has no session-start hook.** The startup greeting can only be triggered reliably in CLI mode via `AgentSpawn`. IDE users would not hear a startup chime unless a workaround (e.g., triggering on first Prompt Submit) is acceptable.

4. **IDE and CLI hook surfaces differ.** The IDE has file/task hooks that the CLI lacks. The CLI has `AgentSpawn` that the IDE lacks. Integration logic may need to account for which environment is in use.

---

## Sources

- [Kiro hooks overview](https://kiro.dev/docs/hooks/)
- [Kiro hook types](https://kiro.dev/docs/hooks/types/)
- [Kiro CLI hooks](https://kiro.dev/docs/cli/hooks/)
- [AWS Kiro documentation overview](https://aws.amazon.com/documentation-overview/kiro/)

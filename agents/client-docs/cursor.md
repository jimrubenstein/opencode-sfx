# Cursor

**Environment:** Desktop IDE + CLI agent
**Support level:** Partial — two of four objectives supported, two problematic. Version-dependent behavior is a significant concern.

---

## Plugin objective mapping

### 1. Main agent finished / idle

**Hook:** `stop`

- Fires when the agent stops executing.
- Available in the IDE. CLI support has been reported as inconsistent — community reports indicate `cursor-agent` may not emit the full hook set.

**Handler type:** Shell command

### 2. Agent needs user input / permission

**Hook:** None

- No `PermissionRequest`, `Notification`, or equivalent event exists.
- The `before*` hooks (`beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`) can block execution, but they run policy logic — they do not signal that the agent is waiting for user input.

**This is a gap.** Cannot be solved with the current hook system.

### 3. Error occurred

**Hook:** No dedicated error hook

- Cursor does not have an equivalent to Claude Code's `PostToolUseFailure` or Copilot CLI's `errorOccurred`.
- `afterShellExecution` and `afterMCPExecution` fire after tool execution and their payloads could be inspected for error indicators (exit codes, error output).
- However, these `after*` events are documented in newer versions and community reports indicate availability varies by Cursor version and whether you are using the IDE or CLI.
- This is unreliable for consistent error detection.

**Handler type:** Shell command with payload parsing, if the events are available

### 4. Startup greeting / announcement

**Hook:** Unreliable

- There is no consistently documented `sessionStart` or equivalent hook across Cursor versions.
- `beforeSubmitPrompt` fires on the first prompt submission, but that is not the same as session start — it fires on user action, not on load.
- Some versions or documentation variants reference session events, but this is not stable enough to depend on.

**This is a gap.** No reliable session-start hook.

---

## Hook execution model

Cursor uses a `hooks.json` configuration model. Hooks run as shell commands.

### Configuration locations

- Project: `.cursor/hooks.json`
- User: `~/.cursor/hooks.json`
- System: `/etc/cursor/hooks.json`

### Control semantics

The `before*` hooks are the strongest decision points:

- `beforeShellExecution` — can block or allow shell commands
- `beforeMCPExecution` — can block or allow MCP tool execution
- `beforeReadFile` — can block file reads

Some `after*` hooks are more informational than controlling.

---

## Documented events (reference)

### Classic event set

| Event | Relevant to SFX? | Notes |
|---|---|---|
| `beforeSubmitPrompt` | No | |
| `beforeShellExecution` | No | |
| `beforeMCPExecution` | No | |
| `beforeReadFile` | No | |
| `afterFileEdit` | No | |
| `stop` | Yes — main agent finished | CLI support uncertain |

### Newer / observed events (version-dependent)

| Event | Relevant to SFX? | Notes |
|---|---|---|
| `afterAgentResponse` | No | |
| `afterAgentThought` | No | Community reports of it not firing |
| `afterShellExecution` | Potentially — error detection | Version-dependent availability |
| `afterMCPExecution` | Potentially — error detection | Version-dependent availability |

---

## Shortcomings

1. **No "needs user input" hook.** No permission-request or notification event. Cannot alert when the agent is waiting for user response.

2. **No reliable startup hook.** Session start is not consistently available across versions. The plugin cannot reliably play a greeting sound.

3. **No dedicated error hook.** Error detection depends on `after*` events that may or may not be available depending on version. Requires payload parsing when available.

4. **CLI and IDE behavior differ.** Community reports confirm that `cursor-agent` (CLI) does not emit the full event set that the IDE does. Shell-execution events appear to be the most reliable in CLI mode, while other events may be IDE-only.

5. **Version-dependent behavior.** Event availability, payload schema, and hook semantics vary across Cursor versions. Any integration should be validated against the specific version in use.

6. **Windows execution caveats.** Additional setup may be required for hook execution on Windows.

---

## Sources

- [GitButler deep dive on Cursor hooks](https://blog.gitbutler.com/cursor-hooks-deep-dive)
- [Cursor forum: CLI missing some hooks](https://forum.cursor.com/t/cursor-cli-doesnt-send-all-events-defined-in-hooks/148316)
- [Cursor forum: Windows hook execution caveat](https://forum.cursor.com/t/hooks-not-working-on-windows/149509)
- [Cursor forum: afterAgentThought nuance](https://forum.cursor.com/t/afteragentthought-hook-is-not-firing/150829)
- [Cursor docs references](https://cursor.com/docs/agent/hooks)

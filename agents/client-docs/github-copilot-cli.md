# GitHub Copilot CLI

**Environment:** Terminal
**Support level:** Partial — three of four objectives are functional for SFX despite hook output being ignored; "needs user input" has no hook.

---

## Plugin objective mapping

### 1. Main agent finished / idle

**Hook:** `agentStop`

- Fires when the main agent stops.
- `subagentStop` is a separate event and should **not** trigger this alert.
- Hook output is likely ignored (consistent with most Copilot CLI hooks), but the hook command still **executes** — which is all we need to play a sound.

**Handler type:** Shell command

### 2. Agent needs user input / permission

**Hook:** None

- No `PermissionRequest`, `Notification`, or equivalent event exists.
- `preToolUse` supports deny decisions, but this is a policy gate, not a signal that the agent is waiting for user input.
- There is no mechanism to detect "agent is blocked waiting for user response" through hooks.

**This is a gap.** Cannot be solved with the current hook system.

### 3. Error occurred

**Hook:** `errorOccurred`

- Dedicated error event that fires when an error occurs.
- Hook output is **ignored** per the documentation — but the hook command still executes, which is sufficient for playing an error sound.

**Handler type:** Shell command

### 4. Startup greeting / announcement

**Hook:** `sessionStart`

- Fires when a new session begins.
- Hook output is **ignored**, but the command executes — sufficient for a startup chime.

**Handler type:** Shell command

---

## Hook execution model

Hooks run as shell commands and receive JSON input via stdin.

### Critical caveat: hook outputs are mostly ignored

GitHub's documentation states that hook outputs are ignored for:

- `sessionStart`
- `sessionEnd`
- `userPromptSubmitted`
- `postToolUse`
- `errorOccurred`

For `preToolUse`, only `deny` is currently processed (not `allow` or `ask`).

**Why this doesn't matter for SFX:** The SFX plugin only needs the hook to *execute a shell command* (play a sound). It does not need to return data to the agent or influence agent behavior. The "output ignored" limitation is irrelevant for our use case.

---

## Supported events (reference)

| Event | Relevant to SFX? | Output processed? | Notes |
|---|---|---|---|
| `sessionStart` | Yes — startup greeting | No (ignored) | Command still executes |
| `sessionEnd` | No | No (ignored) | |
| `userPromptSubmitted` | No | No (ignored) | |
| `preToolUse` | No | Only `deny` | |
| `postToolUse` | No | No (ignored) | |
| `agentStop` | Yes — main agent finished | Unconfirmed | Command still executes |
| `subagentStop` | No — sub-agent only | Unconfirmed | |
| `errorOccurred` | Yes — error alert | No (ignored) | Command still executes |

---

## Shortcomings

1. **No "needs user input" hook.** No permission-request or notification event exists. The plugin cannot alert when the agent is waiting for user approval or answers.

2. **Hook outputs are ignored for most events.** While this doesn't affect SFX (we only need command execution), it means we cannot inspect payloads to make decisions about *which* sound to play based on agent-returned data. In practice, we receive JSON on stdin which we can still read — the "ignored" designation applies to what the agent does with our *output*, not what we receive as *input*.

3. **Limited control semantics.** Even for `preToolUse`, only `deny` is processed. This doesn't affect SFX but limits any future hook-based governance integration.

---

## Configuration

Hooks are configured in files under:

- `.github/hooks/*.json`

Loaded from the current working directory context.

---

## Sources

- [GitHub Copilot hooks concept docs](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks)
- [GitHub Copilot hooks configuration reference](https://docs.github.com/en/copilot/reference/hooks-configuration)
- [GitHub Copilot CLI GA announcement](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available)

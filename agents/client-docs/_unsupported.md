# Unsupported Clients

The following AI coding agent clients cannot adequately support the SFX plugin due to the absence of a general-purpose hook/event system.

---

## Aider

**Environment:** Terminal
**Why unsupported:** Aider does not expose a lifecycle hook framework.

### What Aider does offer

Aider provides a small set of purpose-specific automation commands:

- `--auto-lint` / `--lint-cmd` — run a linter after edits
- `--auto-test` / `--test-cmd` — run tests after edits
- `--notifications-command` — run a command when Aider needs user attention

### Why this is insufficient

These are targeted automation features, not a hook system. Aider does not support:

- Session start/end events
- Pre-tool or post-tool hooks
- Error-specific events
- Sub-agent lifecycle events
- Structured JSON event payloads

### What `--notifications-command` can do

The `--notifications-command` flag is a single, undifferentiated "needs attention" signal. It fires when Aider wants the user to look at it, covering both "finished working" and "needs input" as one signal. It cannot distinguish between them and there is no way to play different sounds for different events.

It also does not support:

- Startup greeting (no session-start trigger)
- Error alerts (no error-specific trigger)

### Verdict

Aider could play a single notification sound via `--notifications-command`, but cannot support the full four-objective SFX model. The lack of event differentiation, structured payloads, and lifecycle coverage makes it incompatible with the plugin architecture.

---

## Sources

- [Aider documentation](https://aider.chat/)
- [Aider configuration options](https://aider.chat/docs/config/options.html)

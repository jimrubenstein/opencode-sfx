# AI Agent Coding Tools: Hook and Event Support

Research summary focused on **AI coding agents that run in the terminal or as standalone apps/IDEs**, specifically examining their support for **hooks/events** and the ability to **execute arbitrary or custom code** when those hooks are dispatched.

**Research date:** February 28, 2026

---

## Scope and framing

This report focuses on **deterministic lifecycle hooks** - places where the product explicitly exposes an event system such as:

- session start/end
- prompt submission
- pre-tool / post-tool execution
- stop / subagent lifecycle
- file or task events

The goal is to answer:

1. **Which tools expose real hook systems?**
2. **Which events do they support?**
3. **Can those hooks execute arbitrary/custom code?**
4. **Can hooks block, modify, or annotate agent behavior?**

This report does **not** treat ordinary tool/plugin/MCP calls as hooks unless the product explicitly supports them as **event-driven lifecycle hooks**.

---

## Executive summary

### Strongest first-class hook systems

1. **Claude Code** (terminal)  
   Most complete hook model found. Supports multiple hook handler types, broad lifecycle coverage, async hooks, policy-style gatekeeping, and tool input rewriting.

2. **VS Code Agent Hooks** (standalone IDE, Preview)  
   Closely mirrors Claude-style hooks. Supports shell-command hooks, structured JSON input, blocking, and tool input rewriting.

3. **Kiro** (standalone IDE + CLI)  
   Strong hook coverage across IDE workflows and CLI agent lifecycle. Especially notable for file and task hooks in the IDE.

4. **GitHub Copilot CLI** (terminal)  
   Formal hook system exists, but most hook outputs are currently ignored. Best understood today as a logging/auditing system plus limited pre-tool deny gates.

5. **Cursor** (standalone IDE + CLI agent)  
   Supports meaningful lifecycle hooks, but semantics differ by event and there are reports of CLI/IDE parity gaps depending on version.

### Important caveat

Some tools support **running arbitrary custom code**, but do **not** expose a generalized event/hook framework. Example: **Aider** can run lint/test/notification commands, but it is not a broad lifecycle hook platform.

---

## Quick comparison

| Tool | Environment | Custom code on event? | Can block actions? | Can modify tool input? | Notes |
| --- | --- | --- | --- | --- | --- |
| Claude Code | Terminal | Yes: shell, HTTP, prompt/agent depending on event | Yes | Yes | Best overall hook model |
| VS Code Agent Hooks | Desktop IDE | Yes: shell commands | Yes | Yes | Preview feature; Claude-format hooks |
| GitHub Copilot CLI | Terminal | Yes: shell commands | Limited | Very limited | `preToolUse` mainly useful for deny |
| Cursor | Desktop IDE + CLI agent | Yes: shell commands | Some events | Limited / event-dependent | CLI event coverage appears version-dependent |
| Kiro | Desktop IDE + CLI | Yes: shell commands and agent actions | Yes | Limited / event-dependent | Strong IDE file/task hooks |
| Aider | Terminal | Purpose-specific commands only | Not as a generalized hook model | No | Useful automation, but not general lifecycle hooks |

---

## 1) Claude Code

**Environment:** terminal  
**Verdict:** strongest and most flexible hook system in this set.

### What it supports

Claude Code defines hooks as **user-defined shell commands, HTTP endpoints, or prompt/agent-based handlers** that run automatically during the lifecycle of Claude Code.

### Hook handler types

Depending on event, Claude Code supports:

- **Command hooks** - run a shell command, receive event JSON on stdin
- **HTTP hooks** - receive hook payloads as HTTP POST requests
- **Prompt / agent hooks** - supported for certain events

This is unusually flexible compared with the other tools reviewed.

### Event surface

Claude Code documents a broad hook set, including:

- `SessionStart`
- `SessionEnd`
- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `PostToolUseFailure`
- `PermissionRequest`
- `Notification`
- `SubagentStart`
- `SubagentStop`
- `Stop`
- `TeammateIdle`
- `TaskCompleted`
- `ConfigChange`
- `WorktreeCreate`
- `WorktreeRemove`
- `PreCompact`

### Custom code execution

Yes. Claude Code can dispatch hooks to:

- arbitrary shell commands
- arbitrary HTTP endpoints
- prompt-based verifiers in supported cases

### Control semantics

Claude Code is the most capable reviewed tool in terms of hook control.

#### `PreToolUse`

This is the most important hook:

- can **allow**, **deny**, or **ask**
- can return structured output
- can **rewrite tool input** using `hookSpecificOutput.updatedInput`

That makes Claude Code suitable for:

- command filtering
- path restrictions
- dynamic policy injection
- secret redaction
- rewriting dangerous commands before execution

### Async hooks

Claude Code also supports asynchronous hooks in some cases. These can run in the background after dispatch, but they **cannot block or alter** the action once it has been allowed to proceed.

### Best use cases

Claude Code is the best option if you want:

- centralized policy enforcement
- compliance/audit logging
- command rewriting
- context injection
- richer integrations beyond shell-only hooks

### Primary source

- [Claude Code hooks documentation](https://code.claude.com/docs/en/hooks)

---

## 2) Visual Studio Code Agent Hooks

**Environment:** standalone desktop IDE  
**Verdict:** closest analogue to Claude-style hooks in an IDE.

### What it supports

VS Code exposes **Agent Hooks** as a lifecycle hook system for Copilot agents. The documentation explicitly states that the format is compatible with the same general hook style used by Claude Code and Copilot CLI.

### Supported events

VS Code documents these events:

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `PreCompact`
- `SubagentStart`
- `SubagentStop`
- `Stop`

### Hook execution model

Hooks are configured as **custom shell commands**.

- structured JSON is passed to the hook on stdin
- the hook can emit JSON on stdout
- exit codes matter for control flow

### Control semantics

VS Code supports real tool gating.

For `PreToolUse`, hooks can:

- allow / deny / ask
- attach additional context
- return **updated input**, allowing tool input rewriting before execution

VS Code also documents exit code `2` as a blocking error path.

### Configuration locations

VS Code searches multiple hook locations, including:

- `.github/hooks/*.json`
- `.claude/settings.json`
- `.claude/settings.local.json`
- `~/.claude/settings.json`

### Best use cases

VS Code hooks are strong when you want:

- IDE-native governance
- repo-local guardrails
- developer workstation enforcement
- consistency with Claude-style hook definitions

### Caveat

This feature is documented as **Preview**, so behavior or schema may still evolve.

### Primary source

- [VS Code Agent Hooks documentation](https://code.visualstudio.com/docs/copilot/customization/hooks)

---

## 3) GitHub Copilot CLI

**Environment:** terminal  
**Verdict:** formal hook system exists, but current output handling is limited.

### Supported hook types

GitHub documents the following lifecycle hooks:

- `sessionStart`
- `sessionEnd`
- `userPromptSubmitted`
- `preToolUse`
- `postToolUse`
- `agentStop`
- `subagentStop`
- `errorOccurred`

### Hook execution model

Hooks run as **custom shell commands** and receive JSON input via stdin.

### Where hooks are configured

GitHub documents hook files under:

- `.github/hooks/*.json`

For CLI behavior, hooks are loaded from the current working directory context.

### Important limitation: hook outputs are mostly ignored

This is the central finding for Copilot CLI.

GitHub's documentation states that hook outputs are ignored for several hook types, including:

- `sessionStart`
- `sessionEnd`
- `userPromptSubmitted`
- `postToolUse`
- `errorOccurred`

For `preToolUse`, the hook output schema allows:

- `allow`
- `deny`
- `ask`

However, GitHub documents that **only `deny` is currently processed**.

### Practical meaning

Today, Copilot CLI hooks are best thought of as:

- logging/auditing hooks for most lifecycle points
- a pre-tool deny gate for certain enforcement scenarios

They are **not** currently as capable as Claude Code or VS Code hooks for rich action rewriting or contextual policy injection.

### Best use cases

- deny-listed shell commands or tool invocations
- audit logging
- telemetry pipelines
- team-wide repo-level policy files

### Primary sources

- [GitHub Copilot hooks concept docs](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks)
- [GitHub Copilot hooks configuration reference](https://docs.github.com/en/copilot/reference/hooks-configuration)
- [GitHub Copilot CLI GA announcement](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available)

---

## 4) Cursor

**Environment:** standalone IDE + CLI agent  
**Verdict:** meaningful hook support, but behavior is more uneven and version-dependent than Claude Code or VS Code.

### General model

Cursor supports lifecycle hooks through a `hooks.json` model, with config discoverable from multiple scopes.

A documented deep-dive describes locations such as:

- project: `.cursor/hooks.json`
- user: `~/.cursor/hooks.json`
- system: `/etc/cursor/hooks.json`

### Classic event set

A detailed Cursor hooks analysis described these events:

- `beforeSubmitPrompt`
- `beforeShellExecution`
- `beforeMCPExecution`
- `beforeReadFile`
- `afterFileEdit`
- `stop`

### Control semantics by event

Cursor's hooks are not equally powerful across all events.

The strongest "decision" hooks are the `before*` hooks tied to execution:

- `beforeShellExecution` - can block or allow shell command execution
- `beforeMCPExecution` - can block or allow MCP execution
- `beforeReadFile` - can block file content from being read into model context

Some other events have been described as more informational than controlling.

### Newer / observed events

In practice, newer Cursor versions and integrations reference additional events such as:

- `afterAgentResponse`
- `afterAgentThought`
- `afterShellExecution`
- `afterMCPExecution`

However, community reports indicate that event availability and behavior can vary by model type, operating system, and whether you are using the IDE or the CLI agent.

### CLI parity caveat

A noteworthy community report states that `cursor-agent` did not emit the full expected hook set and only delivered shell-execution events, while the IDE behaved more completely.

This makes Cursor a tool where **version validation matters** before depending on hooks for production enforcement in terminal-only environments.

### Best use cases

Cursor is compelling if you want:

- shell command interception in the IDE
- MCP call interception
- file-read governance
- post-edit automation

### Caveats

- some hooks appear informational only
- CLI and IDE behavior may differ
- operational details such as Windows shell invocation can require extra setup

### Primary sources

- [GitButler deep dive on Cursor hooks](https://blog.gitbutler.com/cursor-hooks-deep-dive)
- [Cursor forum: CLI missing some hooks](https://forum.cursor.com/t/cursor-cli-doesnt-send-all-events-defined-in-hooks/148316)
- [Cursor forum: Windows hook execution caveat](https://forum.cursor.com/t/hooks-not-working-on-windows/149509)
- [Cursor forum: `afterAgentThought` nuance](https://forum.cursor.com/t/afteragentthought-hook-is-not-firing/150829)
- [Keywords AI Cursor integration example](https://docs.keywordsai.co/integration/dev-tools/cursor)
- [Cursor docs references](https://cursor.com/docs/agent/hooks)

---

## 5) Kiro

**Environment:** standalone IDE + CLI  
**Verdict:** strong hook coverage, especially if you care about IDE file events and task orchestration.

### Kiro IDE hooks

Kiro's IDE hook system is broader than a pure agent lifecycle model because it also supports IDE and file workflow triggers.

Documented IDE hook types include:

- Prompt Submit
- Agent Stop
- Pre Tool Use
- Post Tool Use
- File Create
- File Save
- File Delete
- Pre Task Execution
- Post Task Execution
- Manual Trigger

### Hook actions

Kiro hooks can execute either:

- a **shell command**, or
- an **Ask Kiro** action, which dispatches an agent prompt

That is a useful distinction: Kiro supports both procedural automation and agentic follow-up flows.

### Kiro CLI hooks

Kiro's CLI exposes a more agent-lifecycle-oriented hook surface. Documented CLI hook types include:

- `AgentSpawn`
- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `Stop`

### Hook execution model

For CLI hooks:

- hook input is JSON on stdin
- exit codes affect behavior
- `PreToolUse` can block execution using exit code `2`
- stderr can be returned to the model in blocked flows

Kiro also supports tool matching via a `matcher` field and can match both built-in tools and MCP tools.

### Best use cases

Kiro is especially good when you want:

- file-save/file-create automation
- task execution hooks
- IDE-local quality checks
- CLI pre-tool enforcement with JSON payloads

### Primary sources

- [Kiro hooks overview](https://kiro.dev/docs/hooks/)
- [Kiro hook types](https://kiro.dev/docs/hooks/types/)
- [Kiro CLI hooks](https://kiro.dev/docs/cli/hooks/)
- [AWS Kiro documentation overview](https://aws.amazon.com/documentation-overview/kiro/)

---

## 6) Aider

**Environment:** terminal  
**Verdict:** useful automation knobs, but not a general hook/event framework.

### What Aider does support

Aider supports automatic command execution in a few specific categories:

- auto-lint after changes
- auto-test after changes
- custom notification command

Relevant options include:

- `--auto-lint`
- `--lint-cmd`
- `--auto-test`
- `--test-cmd`
- `--notifications-command`

### Why it does not qualify as a general hook system

These are best understood as targeted automation features, not a full event lifecycle model.

Aider does **not** expose a broad documented hook framework for things like:

- pre-prompt interception
- pre-tool gating
- post-tool structured hook processing
- session lifecycle hooks
- subagent events

### Best use cases

Aider remains useful if your needs are simple:

- run tests after edits
- run linters after edits
- trigger an external notification command

### Primary sources

- [Aider documentation](https://aider.chat/)
- [Aider configuration options](https://aider.chat/docs/config/options.html)

---

## Cross-tool event mapping

If you want a portable internal policy layer, the following mapping is a useful abstraction.

### Session lifecycle

| Concept | Claude Code | VS Code | Copilot CLI | Cursor | Kiro |
| --- | --- | --- | --- | --- | --- |
| Session start | `SessionStart` | `SessionStart` | `sessionStart` | version-dependent / docs vary | `AgentSpawn` is closest |
| Session end / stop | `SessionEnd`, `Stop` | `Stop` | `sessionEnd`, `agentStop` | `stop` | `Stop` |

### Prompt submission

| Concept | Claude Code | VS Code | Copilot CLI | Cursor | Kiro |
| --- | --- | --- | --- | --- | --- |
| Prompt submitted | `UserPromptSubmit` | `UserPromptSubmit` | `userPromptSubmitted` | `beforeSubmitPrompt` | Prompt Submit / `UserPromptSubmit` |

### Tool interception

| Concept | Claude Code | VS Code | Copilot CLI | Cursor | Kiro |
| --- | --- | --- | --- | --- | --- |
| Before tool use | `PreToolUse` | `PreToolUse` | `preToolUse` | `beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile` | `PreToolUse` |
| After tool use | `PostToolUse` | `PostToolUse` | `postToolUse` | `afterShellExecution`, `afterMCPExecution`, `afterFileEdit` | `PostToolUse` |
| Failure handling | `PostToolUseFailure` | not emphasized separately | `errorOccurred` | version-dependent | not emphasized separately |

### Context compaction

| Concept | Claude Code | VS Code | Copilot CLI | Cursor | Kiro |
| --- | --- | --- | --- | --- | --- |
| Pre-compaction | `PreCompact` | `PreCompact` | not highlighted | mentioned in some docs/examples | not a headline hook |

---

## Which tools actually support arbitrary/custom code on hook dispatch?

### Yes, clearly

- **Claude Code** - arbitrary shell commands, HTTP endpoints, and some prompt/agent-based handlers
- **VS Code Agent Hooks** - arbitrary shell commands
- **GitHub Copilot CLI** - arbitrary shell commands
- **Cursor** - arbitrary shell commands
- **Kiro** - arbitrary shell commands and, in IDE hooks, an "Ask Kiro" agent action

### Limited / not a full hook framework

- **Aider** - can run certain configured commands, but not through a generalized event/hook lifecycle system

---

## Which tools can block or modify actions?

### Best support

#### Claude Code

- block / allow / ask
- modify tool input
- add context
- async side hooks available

#### VS Code Agent Hooks

- block / allow / ask
- modify tool input
- attach context

### Good but narrower

#### Kiro

- can block `PreToolUse` in CLI
- strong for file/task event automation in IDE

#### Cursor

- can block some "before" events
- control varies by specific hook
- not all events appear equally authoritative

### Most limited

#### GitHub Copilot CLI

- formal hook schema supports `allow`, `deny`, `ask`
- practical reality today: **`deny` is the main processed output**
- many other outputs are ignored

#### Aider

- not a generalized action-interception hook model

---

## Recommendation by use case

### Best for terminal-first governance and hook depth

**Claude Code**

Choose Claude Code if you need:

- comprehensive lifecycle events
- actual action interception
- tool input rewriting
- custom shell and HTTP integrations
- the best hook richness overall

### Best for IDE-native Claude-style hook workflows

**VS Code Agent Hooks**

Choose VS Code if you need:

- desktop IDE integration
- a familiar hook shape similar to Claude Code
- repo-level and user-level hook config
- policy hooks around agent tool use

### Best for IDE event automation beyond agent lifecycle

**Kiro**

Choose Kiro if you need:

- file save/create/delete hooks
- task execution hooks
- an IDE-centered automation surface
- CLI pre-tool enforcement as a bonus

### Best when you only need deny-style guardrails in GitHub workflows

**GitHub Copilot CLI**

Choose Copilot CLI if you need:

- repository-local hooks in GitHub-centered workflows
- simple deny-style pre-tool enforcement
- audit and logging hooks

### Best when your main interest is shell/MCP interception in Cursor workflows

**Cursor**

Choose Cursor if you need:

- command interception in Cursor
- MCP interception
- file-read governance in IDE workflows

But verify your exact version and whether you rely on IDE or CLI behavior.

---

## Hooks vs MCP: an important distinction

Many of these tools also support **MCP** or other extension/tool systems.

That is **not the same thing** as a deterministic hook system.

### MCP / custom tools

- your code runs **when the agent decides to call the tool**
- this is agent-selected behavior

### Hooks

- your code runs **when a lifecycle event is dispatched**
- this is deterministic and policy-friendly

If your requirement is:

> "Run my code every time the agent is about to execute a shell command or use a tool"

then you want **hooks**, especially `PreToolUse`-style hooks or equivalents such as Cursor's `beforeShellExecution`.

---

## Bottom line

If the requirement is specifically:

> "Which terminal or standalone AI coding tools let me run arbitrary custom code at well-defined lifecycle events and possibly block/alter behavior?"

then the ranking from strongest to weakest is:

1. **Claude Code**
2. **VS Code Agent Hooks**
3. **Kiro**
4. **Cursor**
5. **GitHub Copilot CLI**
6. **Aider** (automation support, but not a generalized hook system)

### Concise conclusion

- **Claude Code** is the most capable event/hook system overall.
- **VS Code Agent Hooks** are the closest desktop analogue.
- **Kiro** is excellent for IDE file/task triggers plus CLI hookability.
- **Copilot CLI** has hooks, but currently processes far less hook output than the schema suggests.
- **Cursor** is powerful in some workflows, but event semantics and CLI parity should be tested before depending on it heavily.
- **Aider** is better thought of as a tool with useful automation commands, not a full lifecycle hook framework.

---

## Source list

### Official / primary documentation

- Claude Code hooks: [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)
- VS Code Agent Hooks: [code.visualstudio.com/docs/copilot/customization/hooks](https://code.visualstudio.com/docs/copilot/customization/hooks)
- GitHub Copilot hooks concepts: [docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks)
- GitHub Copilot hooks config reference: [docs.github.com/en/copilot/reference/hooks-configuration](https://docs.github.com/en/copilot/reference/hooks-configuration)
- GitHub Copilot CLI GA: [github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available)
- Kiro hooks overview: [kiro.dev/docs/hooks](https://kiro.dev/docs/hooks/)
- Kiro hook types: [kiro.dev/docs/hooks/types](https://kiro.dev/docs/hooks/types/)
- Kiro CLI hooks: [kiro.dev/docs/cli/hooks](https://kiro.dev/docs/cli/hooks/)
- AWS Kiro overview: [aws.amazon.com/documentation-overview/kiro](https://aws.amazon.com/documentation-overview/kiro/)
- Aider home: [aider.chat](https://aider.chat/)
- Aider options: [aider.chat/docs/config/options.html](https://aider.chat/docs/config/options.html)

### Community / secondary references used for caveats

- Cursor hooks deep dive: [blog.gitbutler.com/cursor-hooks-deep-dive](https://blog.gitbutler.com/cursor-hooks-deep-dive)
- Cursor CLI missing some hooks report: [forum.cursor.com/t/cursor-cli-doesnt-send-all-events-defined-in-hooks/148316](https://forum.cursor.com/t/cursor-cli-doesnt-send-all-events-defined-in-hooks/148316)
- Cursor Windows hooks issue: [forum.cursor.com/t/hooks-not-working-on-windows/149509](https://forum.cursor.com/t/hooks-not-working-on-windows/149509)
- Cursor `afterAgentThought` discussion: [forum.cursor.com/t/afteragentthought-hook-is-not-firing/150829](https://forum.cursor.com/t/afteragentthought-hook-is-not-firing/150829)
- Cursor integration example: [docs.keywordsai.co/integration/dev-tools/cursor](https://docs.keywordsai.co/integration/dev-tools/cursor)
- Cursor docs reference page: [cursor.com/docs/agent/hooks](https://cursor.com/docs/agent/hooks)


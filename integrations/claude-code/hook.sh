#!/usr/bin/env bash
# =============================================================================
# Claude Code SFX Hook
# =============================================================================
#
# Adapter script for Claude Code's hook system. Reads hook event JSON from
# stdin and plays the appropriate sound via ocsfx-play.
#
# Register in ~/.claude/settings.json:
#
#   {
#     "hooks": {
#       "Stop": [{
#         "hooks": [{ "type": "command", "command": "/path/to/hook.sh" }]
#       }],
#       "SubagentStop": [],
#       "PermissionRequest": [{
#         "hooks": [{ "type": "command", "command": "/path/to/hook.sh" }]
#       }],
#       "PostToolUseFailure": [{
#         "hooks": [{ "type": "command", "command": "/path/to/hook.sh" }]
#       }],
#       "SessionStart": [{
#         "matcher": "startup",
#         "hooks": [{ "type": "command", "command": "/path/to/hook.sh" }]
#       }],
#       "Notification": [{
#         "matcher": "idle_prompt",
#         "hooks": [{ "type": "command", "command": "/path/to/hook.sh" }]
#       }]
#     }
#   }
#
# Note: SubagentStop is listed as empty [] to explicitly NOT play sounds
# for subagent completions. Only the main agent's Stop event triggers sound.
#
# Environment:
#   All OCSFX_* env vars are passed through to ocsfx-play.
#   See ocsfx-play --help for details.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCSFX_PLAY="$SCRIPT_DIR/../../bin/ocsfx-play"

# Read stdin JSON (Claude Code sends hook data on stdin)
INPUT=$(cat)

# Extract the hook event name
# Uses python3 for reliable JSON parsing (available on macOS/Linux)
EVENT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hook_event_name',''))" 2>/dev/null || echo "")

if [[ -z "$EVENT" ]]; then
  exit 0
fi

# Map Claude Code events to SFX categories
case "$EVENT" in
  Stop)
    # Main agent finished — play idle sound
    exec "$OCSFX_PLAY" idle --client claude --event "$EVENT"
    ;;

  SubagentStop)
    # Subagent finished — do nothing (should not reach here if config is correct)
    exit 0
    ;;

  PermissionRequest)
    # Agent needs permission — play question sound
    exec "$OCSFX_PLAY" question --client claude --event "$EVENT"
    ;;

  PostToolUseFailure)
    # Tool failed — play error sound
    exec "$OCSFX_PLAY" error --client claude --event "$EVENT"
    ;;

  SessionStart)
    # Session starting — check if it's a fresh startup
    SOURCE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('source',''))" 2>/dev/null || echo "")
    if [[ "$SOURCE" == "startup" ]]; then
      exec "$OCSFX_PLAY" announce --always --client claude --event "$EVENT" --reason "session startup"
    fi
    # Don't play for resume/clear/compact
    exit 0
    ;;

  Notification)
    # Notification — check type
    NTYPE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('notification_type',''))" 2>/dev/null || echo "")
    case "$NTYPE" in
      idle_prompt)
        # Agent is idle and waiting — play question sound
        exec "$OCSFX_PLAY" question --client claude --event "$EVENT" --reason "idle prompt notification"
        ;;
      permission_prompt)
        # Permission prompt notification — play question sound
        exec "$OCSFX_PLAY" question --client claude --event "$EVENT" --reason "permission prompt notification"
        ;;
      *)
        exit 0
        ;;
    esac
    ;;

  *)
    # Unknown event — ignore
    exit 0
    ;;
esac

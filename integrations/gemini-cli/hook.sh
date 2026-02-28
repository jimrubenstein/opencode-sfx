#!/usr/bin/env bash
# =============================================================================
# Gemini CLI SFX Hook
# =============================================================================
#
# Adapter script for Gemini CLI's hook system. Reads hook event JSON from
# stdin and plays the appropriate sound via ocsfx-play.
#
# Register in ~/.gemini/settings.json:
#
#   {
#     "hooks": {
#       "AfterAgent": [{
#         "hooks": [{
#           "type": "command",
#           "command": "/path/to/hook.sh AfterAgent",
#           "timeout": 5000
#         }]
#       }],
#       "Notification": [{
#         "hooks": [{
#           "type": "command",
#           "command": "/path/to/hook.sh Notification",
#           "timeout": 5000
#         }]
#       }],
#       "SessionStart": [{
#         "matcher": "startup",
#         "hooks": [{
#           "type": "command",
#           "command": "/path/to/hook.sh SessionStart",
#           "timeout": 5000
#         }]
#       }]
#     }
#   }
#
# Note: Gemini CLI does not have a SubagentStop equivalent, so all AfterAgent
# events are treated as main agent completions.
#
# The event name is passed as a CLI argument (argv[1]) because Gemini's hook
# system doesn't include the event name in the stdin JSON payload. We pass it
# explicitly in the command string.
#
# Environment:
#   All OCSFX_* env vars are passed through to ocsfx-play.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCSFX_PLAY="$SCRIPT_DIR/../../bin/ocsfx-play"

# Event name is passed as argv[1] (set in the hook command string)
EVENT="${1:-}"

# Read stdin JSON (Gemini sends hook data on stdin)
INPUT=$(cat)

if [[ -z "$EVENT" ]]; then
  exit 0
fi

# Map Gemini CLI events to SFX categories
case "$EVENT" in
  AfterAgent)
    # Agent finished a turn — play idle sound
    exec "$OCSFX_PLAY" idle --client gemini --event "$EVENT"
    ;;

  Notification)
    # Parse notification type from stdin JSON
    NTYPE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('notification_type',''))" 2>/dev/null || echo "")
    case "$NTYPE" in
      ToolPermission)
        exec "$OCSFX_PLAY" question --client gemini --event "$EVENT" --reason "tool permission"
        ;;
      *)
        # Other notification types — treat as informational, skip
        exit 0
        ;;
    esac
    ;;

  SessionStart)
    # Session starting — play announce sound
    SOURCE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('source',''))" 2>/dev/null || echo "")
    if [[ "$SOURCE" == "startup" ]]; then
      exec "$OCSFX_PLAY" announce --always --client gemini --event "$EVENT" --reason "session startup"
    fi
    exit 0
    ;;

  *)
    exit 0
    ;;
esac

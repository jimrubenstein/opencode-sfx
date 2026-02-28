#!/usr/bin/env bash
# =============================================================================
# Codex CLI SFX Notify Script
# =============================================================================
#
# Adapter script for Codex CLI's notify system. Receives notification JSON
# as argv[1] and plays the appropriate sound via ocsfx-play.
#
# Register in ~/.codex/config.toml:
#
#   notify = ["/path/to/notify.sh"]
#
# Codex only fires one event type: "agent-turn-complete". This plays the
# idle sound when the agent finishes a turn. There is no way to distinguish
# subagent completions from main agent completions in Codex's notify payload.
#
# Limitations:
#   - Only one event: agent-turn-complete (idle sound)
#   - No startup, permission, or error events
#   - No subagent filtering
#
# Environment:
#   All OCSFX_* env vars are passed through to ocsfx-play.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCSFX_PLAY="$SCRIPT_DIR/../../bin/ocsfx-play"

# Codex passes JSON as argv[1] (not stdin)
INPUT="${1:-}"

if [[ -z "$INPUT" ]]; then
  exit 0
fi

# Parse event type
EVENT_TYPE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('type',''))" 2>/dev/null || echo "")

case "$EVENT_TYPE" in
  agent-turn-complete)
    exec "$OCSFX_PLAY" idle --client codex --event "$EVENT_TYPE"
    ;;
  *)
    exit 0
    ;;
esac

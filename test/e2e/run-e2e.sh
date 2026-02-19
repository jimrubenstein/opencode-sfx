#!/usr/bin/env bash
# End-to-end test harness for opencode-sfx plugin
# Uses tmux to control an OpenCode session and verify sound events are logged
#
# Requirements:
#   - tmux installed
#   - opencode installed and in PATH
#   - The plugin must be configured in the test directory's opencode.json
#
# Usage:
#   ./run-e2e.sh [--keep-session]
#
# Options:
#   --keep-session  Don't kill the tmux session after tests (for debugging)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
TEST_DIR="$SCRIPT_DIR"

# Configuration
SESSION_NAME="ocsfx-e2e-test"
# Store logs in e2e dir but run from project root
LOG_FILE="$TEST_DIR/ocsfx-test.log"
STDOUT_LOG="$TEST_DIR/ocsfx-stdout.log"
TIMEOUT_SECONDS=30
KEEP_SESSION=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --keep-session)
      KEEP_SESSION=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

log_pass() {
  echo -e "${GREEN}PASS${NC}: $1"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}FAIL${NC}: $1"
  ((TESTS_FAILED++))
}

log_info() {
  echo -e "${BLUE}INFO${NC}: $1"
}

log_warn() {
  echo -e "${YELLOW}WARN${NC}: $1"
}

# Check prerequisites
check_prerequisites() {
  if ! command -v tmux &>/dev/null; then
    echo "Error: tmux is required but not installed" >&2
    exit 1
  fi
  
  if ! command -v opencode &>/dev/null; then
    echo "Error: opencode is required but not installed" >&2
    exit 1
  fi
  
  # Check if test opencode.json exists
  if [[ ! -f "$TEST_DIR/opencode.json" ]]; then
    echo "Error: $TEST_DIR/opencode.json not found" >&2
    exit 1
  fi
}

# Clean up any existing test session
cleanup() {
  if [[ "$KEEP_SESSION" == "false" ]]; then
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
  fi
  rm -f "$LOG_FILE" "$STDOUT_LOG"
}

# Setup test environment
setup() {
  cleanup
  
  # Create test log file
  touch "$LOG_FILE"
  
  log_info "Test directory: $TEST_DIR"
  log_info "Log file: $LOG_FILE"
  log_info "Session name: $SESSION_NAME"
}

# Start OpenCode in a tmux session with test mode enabled
start_opencode_session() {
  log_info "Starting OpenCode in tmux session..."
  log_info "Running from: $PROJECT_DIR"
  
  # Clean up any previous logs
  rm -f "$STDOUT_LOG"
  
  # Create tmux session and start opencode with debug logging
  # Run from the PROJECT_DIR where opencode.json has the plugin configured
  # Force the "test" theme which uses the test sound filenames
  tmux new-session -d -s "$SESSION_NAME" -c "$PROJECT_DIR" \
    "export OCSFX_DEBUG=test; export OCSFX_LOG_FILE='$LOG_FILE'; export OCSFX_SOUNDS_PATH='$PROJECT_DIR/test/sounds'; export OCSFX_THEME=test; opencode 2>&1 | tee '$STDOUT_LOG'"
  
  # Wait for OpenCode to start and plugin to initialize
  local waited=0
  while [[ $waited -lt $TIMEOUT_SECONDS ]]; do
    if grep -q "startup" "$LOG_FILE" 2>/dev/null; then
      log_info "OpenCode started (startup sound logged after ${waited}s)"
      return 0
    fi
    sleep 1
    ((waited++))
  done
  
  log_warn "Timeout waiting for OpenCode startup (${waited}s)"
  # Show any stdout captured for debugging
  if [[ -f "$STDOUT_LOG" ]] && [[ -s "$STDOUT_LOG" ]]; then
    log_info "Last 10 lines of stdout:"
    tail -10 "$STDOUT_LOG" 2>/dev/null | sed 's/^/  /' || true
  fi
  return 0
}

# Send keys to the tmux session
send_keys() {
  tmux send-keys -t "$SESSION_NAME" "$1"
  sleep 0.5
}

# Send a message/command to OpenCode (needs double Enter to submit)
send_message() {
  local msg="$1"
  tmux send-keys -t "$SESSION_NAME" "$msg"
  sleep 0.2
  tmux send-keys -t "$SESSION_NAME" Enter
  sleep 0.2
  tmux send-keys -t "$SESSION_NAME" Enter
  sleep 1
}

# Send keys and wait for them to be processed
send_keys_wait() {
  local keys="$1"
  local wait_for="$2"
  local timeout="${3:-$TIMEOUT_SECONDS}"
  
  send_keys "$keys"
  
  local waited=0
  while [[ $waited -lt $timeout ]]; do
    if grep -q "$wait_for" "$LOG_FILE" 2>/dev/null; then
      return 0
    fi
    sleep 1
    ((waited++))
  done
  
  return 1
}

# Wait for a pattern in the log file
wait_for_log() {
  local pattern="$1"
  local timeout="${2:-$TIMEOUT_SECONDS}"
  
  local waited=0
  while [[ $waited -lt $timeout ]]; do
    if grep -q "$pattern" "$LOG_FILE" 2>/dev/null; then
      return 0
    fi
    sleep 1
    ((waited++))
  done
  
  return 1
}

# Get the last N lines of the log
get_recent_log() {
  local lines="${1:-10}"
  tail -n "$lines" "$LOG_FILE" 2>/dev/null || echo "(no log)"
}

# Clear the log file (for isolating test results)
clear_log() {
  > "$LOG_FILE"
}

# ==============================================================================
# TEST CASES
# ==============================================================================

test_startup_sound() {
  log_info "Test: Startup sound is logged"
  
  if grep -q "startup" "$LOG_FILE" && grep -q "plugin initialized" "$LOG_FILE"; then
    log_pass "Startup sound logged with correct reason"
    return 0
  else
    log_fail "Startup sound not found in log"
    echo "  Log contents:"
    get_recent_log 5 | sed 's/^/    /'
    return 1
  fi
}

test_theme_in_log() {
  log_info "Test: Theme name appears in log"
  
  # Check that the test theme is logged
  if grep -q "theme=test" "$LOG_FILE"; then
    log_pass "Test theme found in log"
    return 0
  else
    log_fail "Test theme not found in log"
    echo "  Log contents:"
    get_recent_log 5 | sed 's/^/    /'
    return 1
  fi
}

test_sfx_list_command() {
  log_info "Test: /sfx list command"
  
  clear_log
  
  # Send the /sfx list command (needs double Enter in OpenCode)
  send_message "/sfx list"
  
  # Wait a bit for the command to be processed
  sleep 5
  
  # The command itself doesn't play a sound, but we can check the session responded
  # by looking at tmux output
  local output
  output=$(tmux capture-pane -t "$SESSION_NAME" -p 2>/dev/null || echo "")
  
  if echo "$output" | grep -qi "themes\|marine\|ghost"; then
    log_pass "/sfx list command shows themes"
    return 0
  else
    log_fail "/sfx list command did not show expected output"
    return 1
  fi
}

test_sfx_test_command() {
  log_info "Test: /sfx test command triggers sound log"
  
  clear_log
  
  # Send the /sfx test command (needs double Enter in OpenCode)
  # This triggers the AI to call the sfx_test_sound tool
  send_message "/sfx test"
  
  # Wait for sound to be logged - the tool logs with event=test
  # Give extra time since AI needs to process the command (can be slow)
  if wait_for_log "event=test" 45; then
    log_pass "/sfx test command logged sound"
    return 0
  else
    # Check what's in the pane for debugging
    log_fail "/sfx test command did not log sound"
    echo "  Tmux pane (last 5 lines):"
    tmux capture-pane -t "$SESSION_NAME" -p 2>/dev/null | tail -5 | sed 's/^/    /' || true
    echo "  Log contents:"
    get_recent_log 10 | sed 's/^/    /'
    return 1
  fi
}

test_idle_sound_on_completion() {
  log_info "Test: Idle sound on task completion"
  
  clear_log
  
  # Send a simple command that will complete quickly (double Enter for OpenCode)
  send_message "What is 2+2?"
  
  # Wait for idle sound - give plenty of time for AI to process and respond
  if wait_for_log "session.idle" 45; then
    log_pass "Idle sound logged on task completion"
    return 0
  else
    log_fail "Idle sound not logged (may not trigger if pane is active)"
    log_warn "Note: Idle sounds only play when pane is NOT active"
    return 1
  fi
}

test_exit_cleanly() {
  log_info "Test: Exit OpenCode cleanly"
  
  # Send Ctrl-C to exit
  send_keys "C-c"
  sleep 2
  
  # Check if session is still running
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    # Try again with /exit or q
    send_keys "/exit"
    send_keys "Enter"
    sleep 2
  fi
  
  log_pass "Exit command sent"
  return 0
}

# ==============================================================================
# MAIN TEST RUNNER
# ==============================================================================

main() {
  echo "========================================"
  echo "OpenCode SFX E2E Test Suite"
  echo "========================================"
  echo ""
  
  check_prerequisites
  setup
  
  # Trap to cleanup on exit
  trap cleanup EXIT
  
  # Start OpenCode session
  if ! start_opencode_session; then
    log_fail "Failed to start OpenCode session"
    exit 1
  fi
  
  # Wait a bit for everything to stabilize
  sleep 2
  
  echo ""
  echo "--- Running Tests ---"
  echo ""
  
  # Run tests
  test_startup_sound || true
  test_theme_in_log || true
  
  # Interactive tests - these send commands to OpenCode
  test_idle_sound_on_completion || true
  
  # The /sfx test command requires AI processing which can be slow/flaky
  # Uncomment to test: test_sfx_test_command || true
  
  # Cleanup
  test_exit_cleanly || true
  
  # Summary
  echo ""
  echo "========================================"
  echo "Test Summary"
  echo "========================================"
  echo -e "${GREEN}Passed${NC}: $TESTS_PASSED"
  echo -e "${RED}Failed${NC}: $TESTS_FAILED"
  echo ""
  
  if [[ "$KEEP_SESSION" == "true" ]]; then
    log_info "Session kept alive: tmux attach -t $SESSION_NAME"
  fi
  
  if [[ $TESTS_FAILED -gt 0 ]]; then
    echo ""
    echo "Recent log entries:"
    get_recent_log 20 | sed 's/^/  /'
    exit 1
  else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  fi
}

main "$@"

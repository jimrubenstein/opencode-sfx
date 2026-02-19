#!/bin/bash
# Test harness for opencode-sfx plugin
# Run from the test/ directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DIR="$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Override sounds directory to use test sounds
export OCSFX_SOUNDS_PATH="$TEST_DIR/sounds"

log_pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  ((TESTS_FAILED++))
}

log_info() {
  echo -e "${YELLOW}→${NC} $1"
}

# Run an opencode command and capture output
run_sfx() {
  cd "$TEST_DIR"
  opencode run --format json "/sfx $*" 2>/dev/null
}

# Run opencode command and get just the text output
run_sfx_text() {
  cd "$TEST_DIR"
  opencode run "/sfx $*" 2>&1 | tail -n +2
}

echo "========================================"
echo "OpenCode SFX Plugin Test Suite"
echo "========================================"
echo ""
log_info "Test directory: $TEST_DIR"
log_info "Sounds directory: $OCSFX_SOUNDS_PATH"
echo ""

# Test 1: Plugin loads and config is correct
echo "--- Test: Plugin Configuration ---"
cd "$TEST_DIR"
PLUGIN_CONFIG=$(opencode debug config 2>&1 | jq -r '.plugin[0]' 2>/dev/null || echo "")
if [[ "$PLUGIN_CONFIG" == *"plugin.ts"* ]]; then
  log_pass "Plugin is loaded in config"
else
  log_fail "Plugin not found in config: $PLUGIN_CONFIG"
fi

# Test 2: Themes directory exists and has themes
echo ""
echo "--- Test: Themes Loading ---"
THEME_COUNT=$(ls -1 "$PROJECT_DIR/themes/"*.yaml 2>/dev/null | wc -l | tr -d ' ')
if [[ "$THEME_COUNT" -gt 0 ]]; then
  log_pass "Found $THEME_COUNT theme files"
else
  log_fail "No theme files found"
fi

# Test 3: Test sounds directory has files
echo ""
echo "--- Test: Test Sounds ---"
SOUND_COUNT=$(ls -1 "$TEST_DIR/sounds/"*.mp3 2>/dev/null | wc -l | tr -d ' ')
if [[ "$SOUND_COUNT" -gt 0 ]]; then
  log_pass "Found $SOUND_COUNT test sound files"
else
  log_fail "No test sound files found"
fi

# Test 4: sfx_list_themes tool works
echo ""
echo "--- Test: sfx_list_themes Tool ---"
log_info "Running: /sfx list"
OUTPUT=$(run_sfx_text "list" 2>&1 || true)
if [[ "$OUTPUT" == *"Available themes"* ]] || [[ "$OUTPUT" == *"themes"* ]]; then
  log_pass "sfx_list_themes returns theme list"
else
  log_fail "sfx_list_themes failed or returned unexpected output"
  echo "  Output: $OUTPUT"
fi

# Test 5: sfx_list_sounds tool works  
echo ""
echo "--- Test: sfx_list_sounds Tool ---"
log_info "Running: /sfx sounds"
OUTPUT=$(run_sfx_text "sounds" 2>&1 || true)
if [[ "$OUTPUT" == *".mp3"* ]] || [[ "$OUTPUT" == *"sound"* ]]; then
  log_pass "sfx_list_sounds returns sound files"
else
  log_fail "sfx_list_sounds failed or returned unexpected output"
  echo "  Output: $OUTPUT"
fi

# Test 6: Theme YAML parsing
echo ""
echo "--- Test: Theme YAML Parsing ---"
cd "$PROJECT_DIR"
FIRST_THEME=$(ls -1 themes/*.yaml | head -1)
if [[ -f "$FIRST_THEME" ]]; then
  # Check YAML has required fields
  if grep -q "^name:" "$FIRST_THEME" && grep -q "^sounds:" "$FIRST_THEME"; then
    log_pass "Theme YAML has required fields (name, sounds)"
  else
    log_fail "Theme YAML missing required fields"
  fi
else
  log_fail "No theme file to test"
fi

# Test 7: Cache directory creation
echo ""
echo "--- Test: Cache System ---"
CACHE_DIR="$PROJECT_DIR/.cache"
if [[ -d "$CACHE_DIR" ]] || mkdir -p "$CACHE_DIR" 2>/dev/null; then
  log_pass "Cache directory accessible"
else
  log_fail "Cannot create cache directory"
fi

# Summary
echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "${GREEN}Passed${NC}: $TESTS_PASSED"
echo -e "${RED}Failed${NC}: $TESTS_FAILED"
echo ""

if [[ $TESTS_FAILED -gt 0 ]]; then
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi

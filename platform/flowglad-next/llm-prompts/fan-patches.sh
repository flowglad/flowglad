#!/bin/bash
# fan-patches.sh - Spin up parallel Claude Code sessions for each patch
# Uses git worktrees for isolation and tmux for session management

set -e

PROJECT_NAME="${1:?Usage: fan-patches.sh <project-name>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_NAME=$(basename "$REPO_ROOT")
PATCHES_DIR="$REPO_ROOT/llm-prompts/patches/$PROJECT_NAME"
WORKTREES_BASE="$(dirname "$REPO_ROOT")"

# Check dependencies
if ! command -v tmux &> /dev/null; then
  echo "Error: tmux not found. Install with: brew install tmux"
  exit 1
fi

if [ ! -d "$PATCHES_DIR" ]; then
  echo "Error: Patches directory not found: $PATCHES_DIR"
  exit 1
fi

PATCH_FILES=($(ls "$PATCHES_DIR"/patch-*.md 2>/dev/null | sort -V))

if [ ${#PATCH_FILES[@]} -eq 0 ]; then
  echo "Error: No patch files found in $PATCHES_DIR"
  exit 1
fi

echo "Found ${#PATCH_FILES[@]} patch(es) to process:"
for f in "${PATCH_FILES[@]}"; do
  echo "  - $(basename "$f")"
done
echo ""

# Extract branch info from patch file
# Looks for "- Branch name: `{branch}`" in the Git Instructions section
extract_branch_name() {
  local patch_file="$1"
  sed -n 's/.*- Branch name: `\([^`]*\)`.*/\1/p' "$patch_file" | head -1
}

extract_base_branch() {
  local patch_file="$1"
  local branch
  branch=$(sed -n 's/.*- Branch from: `\([^`]*\)`.*/\1/p' "$patch_file" | head -1)
  echo "${branch:-main}"
}

# Create worktrees and collect info
declare -a WORKTREE_PATHS
declare -a BRANCH_NAMES

for PATCH_FILE in "${PATCH_FILES[@]}"; do
  PATCH_NAME=$(basename "$PATCH_FILE" .md)
  BRANCH_NAME=$(extract_branch_name "$PATCH_FILE")
  BASE_BRANCH=$(extract_base_branch "$PATCH_FILE")

  if [ -z "$BRANCH_NAME" ]; then
    echo "Warning: Could not extract branch name from $PATCH_NAME, using default"
    BRANCH_NAME="$PROJECT_NAME/$PATCH_NAME"
  fi

  WORKTREE_PATH="$WORKTREES_BASE/$REPO_NAME-$PATCH_NAME"

  echo "Setting up $PATCH_NAME..."
  echo "  Branch: $BRANCH_NAME (from $BASE_BRANCH)"
  echo "  Worktree: $WORKTREE_PATH"

  # Create worktree if it doesn't exist
  if [ ! -d "$WORKTREE_PATH" ]; then
    # Fetch latest and create branch from base
    git -C "$REPO_ROOT" fetch origin "$BASE_BRANCH" 2>/dev/null || true

    # Create the branch if it doesn't exist
    if ! git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
      git -C "$REPO_ROOT" branch "$BRANCH_NAME" "origin/$BASE_BRANCH" 2>/dev/null || \
      git -C "$REPO_ROOT" branch "$BRANCH_NAME" "$BASE_BRANCH"
    fi

    # Create worktree
    git -C "$REPO_ROOT" worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
  else
    echo "  Worktree already exists, reusing..."
  fi

  WORKTREE_PATHS+=("$WORKTREE_PATH")
  BRANCH_NAMES+=("$BRANCH_NAME")
done

echo ""
echo "All worktrees ready. Creating tmux session..."

SESSION_NAME="$PROJECT_NAME"

# Kill existing session if it exists
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# Create new session with first patch
FIRST_PATCH="${PATCH_FILES[0]}"
FIRST_PATCH_NAME=$(basename "$FIRST_PATCH" .md)
FIRST_WORKTREE="${WORKTREE_PATHS[0]}"

tmux new-session -d -s "$SESSION_NAME" -n "$FIRST_PATCH_NAME" -c "$FIRST_WORKTREE"
tmux send-keys -t "$SESSION_NAME:$FIRST_PATCH_NAME" "claude '$FIRST_PATCH'" Enter

# Create additional windows for remaining patches
for ((i=1; i<${#PATCH_FILES[@]}; i++)); do
  PATCH_FILE="${PATCH_FILES[$i]}"
  PATCH_NAME=$(basename "$PATCH_FILE" .md)
  WORKTREE_PATH="${WORKTREE_PATHS[$i]}"

  tmux new-window -t "$SESSION_NAME" -n "$PATCH_NAME" -c "$WORKTREE_PATH"
  tmux send-keys -t "$SESSION_NAME:$PATCH_NAME" "claude '$PATCH_FILE'" Enter
done

echo ""
echo "Created tmux session '$SESSION_NAME' with ${#PATCH_FILES[@]} windows."
echo ""
echo "Worktrees created:"
for ((i=0; i<${#PATCH_FILES[@]}; i++)); do
  echo "  - $(basename "${PATCH_FILES[$i]}" .md): ${WORKTREE_PATHS[$i]}"
done
echo ""
echo "To attach: tmux attach -t $SESSION_NAME"
echo "Navigation: Ctrl-b n (next), Ctrl-b p (prev), Ctrl-b w (list)"
echo ""

# Attach to session
tmux attach -t "$SESSION_NAME"

#!/bin/bash
# fan-patches.sh - Spin up parallel Claude Code sessions for each patch
# Uses git worktrees for isolation and tmux for session management

set -e

PROJECT_NAME="${1:?Usage: fan-patches.sh <project-name>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PATCHES_DIR="$PACKAGE_DIR/llm-prompts/patches/$PROJECT_NAME"

# Find the actual git repo root (handles monorepos)
GIT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
GIT_REPO_NAME=$(basename "$GIT_ROOT")

# Create worktrees as siblings to the git repo, not inside it
WORKTREES_BASE="$(dirname "$GIT_ROOT")"

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

# Find existing worktree for a branch (returns path or empty string)
find_worktree_for_branch() {
  local branch="$1"
  git -C "$GIT_ROOT" worktree list --porcelain | awk -v branch="$branch" '
    /^worktree / { path = substr($0, 10) }
    /^branch refs\/heads\// {
      b = substr($0, 19)
      if (b == branch) { print path; exit }
    }
  '
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

  echo "Setting up $PATCH_NAME..."
  echo "  Branch: $BRANCH_NAME (from $BASE_BRANCH)"

  # Check if branch already has a worktree somewhere
  EXISTING_WORKTREE=$(find_worktree_for_branch "$BRANCH_NAME")

  if [ -n "$EXISTING_WORKTREE" ]; then
    WORKTREE_PATH="$EXISTING_WORKTREE"
    echo "  Worktree: $WORKTREE_PATH (existing)"
  else
    WORKTREE_PATH="$WORKTREES_BASE/$GIT_REPO_NAME--$PROJECT_NAME--$PATCH_NAME"
    echo "  Worktree: $WORKTREE_PATH (new)"

    # Fetch latest and create branch from base
    git -C "$GIT_ROOT" fetch origin "$BASE_BRANCH" 2>/dev/null || true

    # Create the branch if it doesn't exist
    if ! git -C "$GIT_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
      git -C "$GIT_ROOT" branch "$BRANCH_NAME" "origin/$BASE_BRANCH" 2>/dev/null || \
      git -C "$GIT_ROOT" branch "$BRANCH_NAME" "$BASE_BRANCH"
    fi

    # Create worktree
    git -C "$GIT_ROOT" worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
  fi

  # Copy patch file into worktree so Claude can read it without permission prompts
  LOCAL_PATCH_PATH="$WORKTREE_PATH/AGENT_PROMPT.md"
  cp "$PATCH_FILE" "$LOCAL_PATCH_PATH"
  echo "  Copied prompt to: AGENT_PROMPT.md"

  WORKTREE_PATHS+=("$WORKTREE_PATH")
  BRANCH_NAMES+=("$BRANCH_NAME")
done

echo ""
echo "All worktrees ready. Creating tmux session..."

SESSION_NAME="$PROJECT_NAME"

# Check if session already exists
SESSION_EXISTS=false
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  SESSION_EXISTS=true
  echo "Session '$SESSION_NAME' already exists, adding windows to it..."
fi

# Track if we're already inside this session
INSIDE_SESSION=false
if [ -n "$TMUX" ]; then
  CURRENT_SESSION=$(tmux display-message -p '#S')
  if [ "$CURRENT_SESSION" = "$SESSION_NAME" ]; then
    INSIDE_SESSION=true
  fi
fi

# Create session if it doesn't exist (use first patch)
if [ "$SESSION_EXISTS" = false ]; then
  FIRST_PATCH="${PATCH_FILES[0]}"
  FIRST_PATCH_NAME=$(basename "$FIRST_PATCH" .md)
  FIRST_WORKTREE="${WORKTREE_PATHS[0]}"

  tmux new-session -d -s "$SESSION_NAME" -n "$FIRST_PATCH_NAME" -c "$FIRST_WORKTREE"
  tmux send-keys -t "$SESSION_NAME:$FIRST_PATCH_NAME" "claude 'AGENT_PROMPT.md'" Enter
  START_INDEX=1
else
  START_INDEX=0
fi

# Add windows for remaining patches (skip ones that already have windows)
for ((i=START_INDEX; i<${#PATCH_FILES[@]}; i++)); do
  PATCH_FILE="${PATCH_FILES[$i]}"
  PATCH_NAME=$(basename "$PATCH_FILE" .md)
  WORKTREE_PATH="${WORKTREE_PATHS[$i]}"

  # Check if window already exists
  if tmux list-windows -t "$SESSION_NAME" -F '#W' 2>/dev/null | grep -q "^${PATCH_NAME}$"; then
    echo "  Window '$PATCH_NAME' already exists, skipping..."
    continue
  fi

  tmux new-window -t "$SESSION_NAME" -n "$PATCH_NAME" -c "$WORKTREE_PATH"
  tmux send-keys -t "$SESSION_NAME:$PATCH_NAME" "claude 'AGENT_PROMPT.md'" Enter
done

echo ""
if [ "$SESSION_EXISTS" = true ]; then
  echo "Added windows to tmux session '$SESSION_NAME'."
else
  echo "Created tmux session '$SESSION_NAME' with ${#PATCH_FILES[@]} windows."
fi
echo ""
echo "Worktrees created:"
for ((i=0; i<${#PATCH_FILES[@]}; i++)); do
  echo "  - $(basename "${PATCH_FILES[$i]}" .md): ${WORKTREE_PATHS[$i]}"
done
echo ""
echo "Navigation: Ctrl-b n (next), Ctrl-b p (prev), Ctrl-b w (list)"
echo ""

# Attach to session (skip if already inside it)
if [ "$INSIDE_SESSION" = true ]; then
  echo "You're already in session '$SESSION_NAME'. Use Ctrl-b w to see all windows."
else
  echo "Attaching to session..."
  tmux attach -t "$SESSION_NAME"
fi

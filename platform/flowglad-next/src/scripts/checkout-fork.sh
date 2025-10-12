#!/bin/bash

# Script to checkout a branch from a contributor's fork
# Usage: ./checkout-fork.sh username:branch-name

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 username:branch-name"
    echo "Example: $0 AubreyDDD:issue-539"
    exit 1
fi

# Parse the argument
IFS=':' read -r USERNAME BRANCH <<< "$1"

if [ -z "$USERNAME" ] || [ -z "$BRANCH" ]; then
    echo "Error: Invalid format. Use username:branch-name"
    exit 1
fi

# Get the repo name from the current git remote
REPO=$(git config --get remote.origin.url | sed -E 's/.*[:/](.+\/.+)(\.git)?$/\1/' | sed 's/\.git$//')

if [ -z "$REPO" ]; then
    echo "Error: Could not determine repository name"
    exit 1
fi

REMOTE_NAME="temp-${USERNAME}"
FORK_URL="https://github.com/${USERNAME}/${REPO##*/}.git"
LOCAL_BRANCH="${USERNAME}-${BRANCH}"

echo "Adding remote: $REMOTE_NAME -> $FORK_URL"
git remote add "$REMOTE_NAME" "$FORK_URL"

echo "Fetching from $REMOTE_NAME..."
git fetch "$REMOTE_NAME"

echo "Checking out branch: $LOCAL_BRANCH (tracking $REMOTE_NAME/$BRANCH)"
git checkout -b "$LOCAL_BRANCH" "$REMOTE_NAME/$BRANCH"

echo "Removing remote: $REMOTE_NAME"
git remote remove "$REMOTE_NAME"

echo ""
echo "✓ Successfully checked out $USERNAME:$BRANCH as local branch '$LOCAL_BRANCH'"
echo ""
echo "To return to your previous branch and clean up:"
echo "  git checkout main  # or your default branch"
echo "  git branch -D $LOCAL_BRANCH"
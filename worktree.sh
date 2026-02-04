#!/usr/bin/env bash
# File: create_worktree_from_gitignore.sh

set -e

if [ $# -ne 1 ]; then
    echo "Usage: $0 <branch_name>"
    exit 1
fi

BRANCH="$1"
WORKTREE="../$BRANCH"
REPO_ROOT=$(git rev-parse --show-toplevel)

if [ ! -d "$REPO_ROOT/.git" ]; then
    echo "Error: Not inside a Git repository."
    exit 1
fi

echo "Creating worktree for branch '$BRANCH' at '$WORKTREE'..."
git worktree add "$WORKTREE" "$BRANCH"
echo "Worktree created."

echo "Copying files listed in .gitignore using rsync..."

# rsync using .gitignore as exclude list
rsync -av --exclude-from="$REPO_ROOT/.gitignore" --include-from="$REPO_ROOT/.gitignore" --prune-empty-dirs "$REPO_ROOT/" "$WORKTREE/"

echo "All gitignored files copied."
echo "Done!"

#!/usr/bin/env bash
# File: create_worktree_from_gitignore.sh

set -e

DELETE_MODE=false

while getopts "d" opt; do
    case $opt in
        d)
            DELETE_MODE=true
            ;;
        *)
            echo "Usage: $0 [-d] <branch_name>"
            echo "  -d  Delete worktree and branch"
            exit 1
            ;;
    esac
done
shift $((OPTIND - 1))

if [ $# -ne 1 ]; then
    echo "Usage: $0 [-d] <branch_name>"
    echo "  -d  Delete worktree and branch"
    exit 1
fi

BRANCH="$1"
WORKTREE="../$BRANCH"
REPO_ROOT=$(git rev-parse --show-toplevel)

if [ ! -d "$REPO_ROOT/.git" ]; then
    echo "Error: Not inside a Git repository."
    exit 1
fi

if [ "$DELETE_MODE" = true ]; then
    echo "Removing worktree for branch '$BRANCH' at '$WORKTREE'..."
    git worktree remove "$WORKTREE" --force
    echo "Worktree removed."

    echo "Deleting branch '$BRANCH'..."
    git branch -D "$BRANCH"
    echo "Branch deleted."
    echo "Done!"
    exit 0
fi

echo "Creating worktree for branch '$BRANCH' at '$WORKTREE'..."
git worktree add "$WORKTREE" "$BRANCH"
echo "Worktree created."

echo "Copying files listed in .gitignore using rsync..."

# rsync using .gitignore as exclude list
rsync -av --exclude-from="$REPO_ROOT/.gitignore" --include-from="$REPO_ROOT/.gitignore" --prune-empty-dirs "$REPO_ROOT/" "$WORKTREE/"

echo "All gitignored files copied."
echo "Done!"

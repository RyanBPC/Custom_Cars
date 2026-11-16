#!/usr/bin/env bash
# Publishes the site to its public GitHub repository.
#
# The public repository gets a clean copy of the current version: files listed in .publishignore are left out
# (local-only renders and experiments), and commits use GitHub's no-reply address, not a personal email.
# The full local history stays on this computer. Runs after every commit (.git/hooks/post-commit), or by hand:
#     bash tools/publish.sh
#
# One-off setup (already done on Ryan's computer):
#     git config publish.remote https://github.com/<user>/<repo>.git
#     git config publish.name  "Ryan Carr"
#     git config publish.email <id>+<user>@users.noreply.github.com
set -e
# Run from the post-commit hook, git passes the local commit's author (with the personal email) and repository
# paths down to this script. Drop them all so only the publish.* settings below are used.
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE \
      GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE GIT_PREFIX
SRC=$(git rev-parse --show-toplevel)
REMOTE=$(git -C "$SRC" config --get publish.remote || true)
NAME=$(git -C "$SRC" config --get publish.name || true)
EMAIL=$(git -C "$SRC" config --get publish.email || true)
PUB="${PUBLISH_DIR:-$SRC/../custom-cars-public}"
[ -n "$REMOTE" ] && [ -n "$NAME" ] && [ -n "$EMAIL" ] || { echo "publish: not set up (see tools/publish.sh)"; exit 1; }

# One publish at a time: quick commits back to back would otherwise clash in the shared folder.
LOCK="$SRC/.git/publish.lock"
for _ in $(seq 1 120); do mkdir "$LOCK" 2>/dev/null && break; sleep 1; done
mkdir "$LOCK" 2>/dev/null || true   # a lock older than 2 minutes is left over from a crash; take it over
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# The clean copy lives in its own folder next to the project.
if [ ! -d "$PUB/.git" ]; then
  git clone -q "$REMOTE" "$PUB" 2>/dev/null || { mkdir -p "$PUB"; git -C "$PUB" init -q -b main; git -C "$PUB" remote add origin "$REMOTE"; }
fi
git -C "$PUB" pull -q --rebase origin main 2>/dev/null || true

# Replace its files with the current version, minus .publishignore.
find "$PUB" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git -C "$SRC" archive HEAD | tar -x -C "$PUB"
if [ -f "$SRC/.publishignore" ]; then
  while IFS= read -r line; do
    line="${line%%#*}"; line="$(echo "$line" | sed 's/[[:space:]]*$//')"
    [ -n "$line" ] && (cd "$PUB" && rm -rf -- $line)
  done < "$SRC/.publishignore"
fi

cd "$PUB"
git add -A
if git diff --cached --quiet; then echo "publish: nothing new"; exit 0; fi
GIT_AUTHOR_NAME="$NAME" GIT_AUTHOR_EMAIL="$EMAIL" GIT_COMMITTER_NAME="$NAME" GIT_COMMITTER_EMAIL="$EMAIL" \
  git commit -q -m "$(git -C "$SRC" log -1 --format=%B)"
# Never let the personal email out: if it somehow ended up on the commit, undo it and stop.
if [ "$(git log -1 --format='%ae %ce')" != "$EMAIL $EMAIL" ]; then git reset -q --soft HEAD~1; echo "publish: stopped, commit had the wrong email"; exit 1; fi
git branch -M main
git push -q -u origin main
echo "publish: pushed $(git rev-parse --short HEAD)"

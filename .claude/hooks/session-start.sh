#!/bin/bash
# Installs the anatomy skill (github.com/wheresryan22/anatomy) user-wide in
# Claude Code cloud sessions, which start from a fresh container each time.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Pinned to the commit that was reviewed. Bump it deliberately to update.
ANATOMY_REF="${ANATOMY_REF:-240a9bf7c50cc6226148762a1017466fcbc08523}"
DEST="$HOME/.claude/skills/anatomy"

if [ -f "$DEST/SKILL.md" ] && [ "$(git -C "$DEST" rev-parse HEAD 2>/dev/null)" = "$ANATOMY_REF" ]; then
  exit 0
fi

rm -rf "$DEST"
mkdir -p "$DEST"
git -C "$DEST" init -q
git -C "$DEST" remote add origin https://github.com/wheresryan22/anatomy.git
git -C "$DEST" fetch -q --depth 1 origin "$ANATOMY_REF"
git -C "$DEST" checkout -q FETCH_HEAD

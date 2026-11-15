#!/usr/bin/env bash
# Web-session setup for Claude Code on the web. Invoked by the environment's
# setup script so these prerequisites are version-controlled and fixable via PR.
set -euo pipefail

# Run from the repo root no matter where the caller invoked us from.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Deterministic install; fall back to `npm install` if the lockfile ever drifts
# so setup still succeeds. (A fallback is a signal the lock should be re-committed.)
npm ci || npm install

# Ensure the pinned Chromium is present for Playwright/e2e. The managed web image
# already ships Chromium under PLAYWRIGHT_BROWSERS_PATH along with the OS libs it
# needs, so this is normally a fast no-op.
#
# Do NOT pass --with-deps: it forces Playwright to run `apt-get`, which exits 100
# on this image because a preinstalled third-party PPA (ondrej/php) changed its
# Release label — unrelated to this repo, and fatal under `set -e`. The OS libs
# are already present, so the browser download alone is all we need. Guard with
# `|| true` so a transient download hiccup can't abort the whole setup.
npx playwright install chromium || true

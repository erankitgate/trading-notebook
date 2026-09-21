#!/usr/bin/env bash
# Commit, push to main, and watch the Pages deploy. Usage: scripts/deploy.sh "message"
set -euo pipefail
cd "$(dirname "$0")/.."
msg="${1:-Update notebook}"
bash scripts/check.sh
git add -A
if git diff --cached --quiet; then echo "nothing to commit"; else git commit -m "$msg"; fi
git push origin main
sleep 4
run=$(gh run list --workflow "Deploy notebook to GitHub Pages" --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run" --exit-status
url=$(gh api "repos/$(gh repo view --json nameWithOwner --jq .nameWithOwner)/pages" --jq .html_url)
echo "live: $url ($(curl -s -o /dev/null -w '%{http_code}' "$url"))"

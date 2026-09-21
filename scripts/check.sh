#!/usr/bin/env bash
# Syntax-check every module and run the unit tests. Fast; run before every commit.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
for f in js/*.js js/lib/*.js js/views/*.js tests/unit/*.js tests/e2e/*.js; do
  if ! node --check "$f" 2>/dev/null; then echo "syntax error: $f"; node --check "$f" || true; fail=1; fi
done
[ "$fail" = 0 ] && echo "syntax ok ($(ls js/*.js js/lib/*.js js/views/*.js | wc -l | tr -d ' ') modules)"
# Key-shaped strings only (a service_role JWT carries "role":"service_role" in its payload; anon JWTs are fine).
if grep -rn --include=*.js --include=*.html --include=*.yml --include=*.json -E 'sbp_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl' --exclude-dir=node_modules . ; then
  echo "!! looks like a secret is in the tree"; exit 1
fi
node --test tests/unit/

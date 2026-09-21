---
description: Check, test, commit, push and watch the GitHub Pages deploy until green
argument-hint: commit message
---
Ship the current changes. Commit message: $ARGUMENTS (write a good one yourself if empty).

1. `npm run check` (syntax + unit tests). If Chrome is available also `npm run test:e2e`. Fix failures before continuing.
2. `git status` — make sure no secrets (service_role key, tokens, .env) are staged. Only `config.js` may contain the anon key.
3. `git add -A && git commit -m "<message>"` and `git push origin main`.
4. `gh run watch --exit-status` on the latest "Deploy notebook to GitHub Pages" run. If it fails, `gh run view --log-failed`, fix, and repeat.
5. `curl -sI https://erankitgate.github.io/trading-notebook/` must be 200; also check `js/main.js` and `css/app.css` are served.
6. Reply with the commit hash, the run URL, and the live URL. Nothing else.

# SPEC: My Trading Notebook

This file is the complete brief for Claude Code. Read all of it, then complete every task in "Your job" from top to bottom. Stop and ask the owner only when a step needs them to log in or click something in a browser.

---

## 1. What this is

A personal trading journal website for one person (the owner, an Indian options trader). It works on phone and laptop, syncs live between them, and is private to the owner.

It has a front page (index) and two sections:

1. **Daily trade diary** — one page per trading day.
2. **Daily learning** — notes on new concepts learned, with links to full guides.

More sections may be added later, so keep the code easy to extend.

## 2. Current state (already done)

The code in this folder is complete and working. Do not rewrite it from scratch. Your job is mainly to deploy it, connect it, and verify it.

| Item | Status |
|---|---|
| `index.html` | Page markup and all CSS (light and dark mode) |
| `app.js` | All app logic: login, data loading, live sync, views, forms |
| `config.js` | Supabase URL and anon key, already filled in |
| `supabase/schema.sql` | Database schema (already applied to the live project) |
| `.github/workflows/deploy.yml` | GitHub Actions workflow that deploys to GitHub Pages on every push to `main` |
| Supabase project | Created and set up (details below) |
| GitHub repo | **Not created yet** |
| GitHub Pages | **Not enabled yet** |
| Supabase login redirect URL | **Not set yet** |

### Supabase project (live)

- Organization: `Ankit' Trade` (id `uwjgvycmmjxqnuvdjkus`)
- Project name: `trading-notebook`
- Project ref: `owpcomcmvwiutlulojts`
- Region: `ap-south-1` (Mumbai), free plan
- API URL: `https://owpcomcmvwiutlulojts.supabase.co`
- The anon (public) key is already in `config.js`. It is safe in a public website because row-level security is on.
- Tables `diary_entries`, `learning_notes`, `highlights` exist with RLS policies and are added to the `supabase_realtime` publication. The Supabase security advisor reports no issues.

## 3. Tech stack (keep it)

- Plain HTML + CSS + vanilla JavaScript. No build step, no framework, no npm dependencies for the site.
- `@supabase/supabase-js@2` loaded from jsDelivr CDN.
- Font: Figtree from Google Fonts, with system fallbacks.
- Hosting: GitHub Pages via GitHub Actions.
- Database, login and live sync: Supabase (Postgres + Auth + Realtime).
- Login: email magic link (no passwords).

## 4. Features (all already built; use this to verify)

### Front page (Index)
- Title "My Trading Notebook" and a button "+ Add today's trades".
- **Red box "Read this before you trade"** at the top:
  - Shows pinned reminders from the `highlights` table, each with a × to remove.
  - Automatically shows every **repeated mistake** (same mistake name on 2 or more different days) with a red count badge like "×3" and the last date it happened.
  - Has an input to pin a new reminder.
- Stats: total P&L, trading days, green days, lessons saved.
- "Plan for next session": the latest diary day's next-day strategy.
- Index list: 1) Daily trade diary, 2) Daily learning, with counts.
- Recent 5 diary days.

### Daily trade diary
- List of days, newest first, showing date, title, day P&L (green/red), and a red "repeat mistake" tag if that day contains a repeated mistake.
- **Day page** shows, in order:
  1. Date, title, day P&L, market and mood tags, Edit button.
  2. **Yesterday's plan**: the previous diary day's "strategy for next day", plus whether the owner followed it (yes/partly/no + note).
  3. **Trades table**: instrument, Buy/Sell, qty, entry, exit (blank = open), P&L, "why I took it", "what happened".
  4. **Mistakes**: amber cards; a repeated mistake turns red with "repeated ×N".
  5. What went well, lesson of the day.
  6. **Strategy for next day** (green box).
  7. Notes, and previous/next day navigation.
- **Add/edit form** with add/remove rows for trades and mistakes.
  - If P&L is left blank but entry, exit and qty are filled, P&L = (exit − entry) × qty for Buy, (entry − exit) × qty for Sell.
  - The mistake name field suggests names used before (a datalist), so repeats get counted consistently. Matching is case-insensitive and trimmed.
  - One page per date (unique per user). Saving a duplicate date shows a clear message.
  - Delete page with confirmation.

### Daily learning
- List of notes: date, tags, title, summary, key points, "Open full guide" button (opens in new tab), Edit.
- Add/edit/delete form.
- If there are no notes, show a button that adds the first note: "Option chain explained" (the content is in `OPTION_CHAIN_NOTE` in `app.js`, linking to `https://claude.ai/artifact/EN5MxFBRKkbHbdwBjXtUTF`).

### Everywhere
- Live sync indicator ("Live sync on") and Sign out link in the footer.
- Changes made on one device appear on another within a second or two, without reload.
- Works on a 360px-wide phone; tables scroll sideways inside their own box.
- Light and dark mode follow the device setting.

## 5. Data model (already in the database)

`diary_entries`: `id uuid`, `user_id uuid (default auth.uid())`, `date date`, `title`, `market`, `mood`, `plan_followed ('yes'|'partly'|'no'|null)`, `plan_note`, `trades jsonb [{instrument, side, qty, entry, exit, pnl, reason, result}]`, `mistakes jsonb [{tag, detail}]`, `went_well jsonb [string]`, `lessons jsonb [string]`, `next_day_strategy jsonb [string]`, `notes`, `created_at`, `updated_at`. Unique `(user_id, date)`.

`learning_notes`: `id`, `user_id`, `date`, `title`, `summary`, `points jsonb [string]`, `url`, `tags jsonb [string]`, `created_at`.

`highlights`: `id`, `user_id`, `text`, `created_at`.

RLS on all three: authenticated users can only select/insert/update/delete rows where `user_id = auth.uid()`.

## 6. Security rules (must follow)

- **Never** put the Supabase `service_role` key, a database password, a GitHub token, or a Supabase access token in any file, commit, or log. Only the anon key goes in `config.js`.
- Never disable RLS.
- Use the owner's existing logins on this computer (`gh auth login`, `supabase login`). Never ask the owner to paste tokens or passwords into the chat.

---

## 7. Your job (do these in order)

### Task 1: Check tools
- Check `git --version` and `gh --version`. If missing, tell the owner exactly what to install (Git from git-scm.com, GitHub CLI from cli.github.com) and wait.
- Run `gh auth status`. If not logged in, ask the owner to run `gh auth login` (GitHub.com → HTTPS → Login with a web browser) and wait.

### Task 2: Create the GitHub repo and push
- Get the owner's GitHub username with `gh api user --jq .login`. Call it `USERNAME` below.
- In this folder: `git init`, `git branch -M main`, commit all files with message "Initial notebook".
- Create a **public** repo named `trading-notebook` and push: `gh repo create trading-notebook --public --source=. --remote=origin --push`.
- Confirm `.github/workflows/deploy.yml` is in the pushed repo.

### Task 3: Enable GitHub Pages with Actions
- Enable Pages with the workflow build type:
  `gh api -X POST repos/USERNAME/trading-notebook/pages -f build_type=workflow`
  (If it already exists, use `-X PUT` with the same field.)
- Trigger the deploy: `gh workflow run "Deploy notebook to GitHub Pages"`, then watch it with `gh run watch`.
- If it fails, read the logs (`gh run view --log-failed`), fix the cause, commit, push, and repeat until green.
- Site URL will be: `https://USERNAME.github.io/trading-notebook/`
- Verify with `curl -sI` that the site returns HTTP 200, and that `config.js` and `app.js` are served.

### Task 4: Set Supabase login redirect
Goal: in project `owpcomcmvwiutlulojts`, set **Site URL** to `https://USERNAME.github.io/trading-notebook/` and add the same URL to **Redirect URLs**.

Preferred way (automatic):
- Check for the Supabase CLI (`supabase --version`; install via `npm i -g supabase` or the official instructions if missing). Ask the owner to run `supabase login` if needed.
- Use the Supabase Management API with the owner's CLI access token (read it from the CLI's login, never print it):
  `PATCH https://api.supabase.com/v1/projects/owpcomcmvwiutlulojts/config/auth`
  with JSON `{"site_url": "https://USERNAME.github.io/trading-notebook/", "uri_allow_list": "https://USERNAME.github.io/trading-notebook/"}`.
- Confirm with a `GET` on the same endpoint.

Fallback (manual): tell the owner the exact clicks: supabase.com → project `trading-notebook` → Authentication → URL Configuration → paste the URL into Site URL and Redirect URLs → Save.

### Task 5: First login (owner does this)
- Tell the owner to open the site, enter their email, and click the link from their inbox **on the same device**.
- Ask them to confirm they see the notebook front page with "Live sync on" in the footer.

### Task 6: Lock sign-ups
After the owner confirms they are logged in, stop anyone else from creating an account:
- Management API: `PATCH .../config/auth` with `{"disable_signup": true}`, then confirm with `GET`.
- Fallback: Supabase → Authentication → Sign In / Providers → Email → turn off "Allow new users to sign up".

### Task 7: Verify end to end
Walk the owner through this checklist (or test yourself if you can use a browser):
1. Front page loads, red box is visible.
2. Learning → "Add the option chain guide" creates the first note, and "Open full guide" opens the claude.ai link.
3. Diary → New day → add one trade (Buy, qty 10, entry 100, exit 110, P&L blank) → Save → day P&L shows +₹100.
4. Add mistake "Exited too early" on two different dates → it shows in red "×2" on the front page.
5. Write a "strategy for next day" on one date; the next date's page shows it under "Yesterday's plan".
6. Pin a reminder on the front page; it appears; × removes it.
7. Open the site on a phone and a laptop at the same time; a change on one appears on the other without reload.

### Task 8: Report back
Give the owner a short summary with:
- The live site URL.
- The GitHub repo URL.
- Anything that still needs a manual click.
- How to add to phone home screen: Chrome → ⋮ → Add to Home screen.

---

## 8. Making changes later

When the owner asks for new features:
- Keep the same stack (no frameworks, no build step) unless the owner asks otherwise.
- Keep the visual style: notebook page with red margin line, Figtree font, green (`--up`) for profit/plans, red (`--down`) for losses/repeated mistakes, amber for one-time mistakes.
- Database changes: write a new SQL migration file in `supabase/` (for example `002_add_screenshots.sql`), apply it with the Supabase CLI (`supabase link --project-ref owpcomcmvwiutlulojts` then `supabase db push`, or run it in the SQL editor), and always add RLS policies for new tables.
- Commit and push to `main`; GitHub Actions redeploys automatically. Check `gh run watch` until green.

---
description: Record today's account balance (drives the hero card and balance chart)
argument-hint: amount in rupees, optional date and note — e.g. "226400" or "2026-09-22 226400 after charges"
---
Record my account balance: $ARGUMENTS

- Parse the amount (accept "2.27 lakh", "227000", "2,27,000"), an optional date (default today, IST) and an optional note.
- Upsert into `capital_log` via the Supabase MCP (`execute_sql`, project `owpcomcmvwiutlulojts`, `user_id` from
  `select id from auth.users order by created_at limit 1`), on conflict `(user_id, date)` update `amount` and `note`.
- If the diary has no page for that date and the balance moved vs the previous entry, tell me the difference and ask if I want to log the day.
- Reply in one line: the new balance, the change since the previous entry, and the change since the starting capital in `settings`.

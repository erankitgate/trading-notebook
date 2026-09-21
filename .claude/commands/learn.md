---
description: Explain a trading concept as a full guide (published Artifact) and save a learning note that links to it
argument-hint: topic, e.g. "IV crush", "OI build-up reading", "Wyckoff spring"
---
Teach me: $ARGUMENTS

1. Write a complete, practical guide on the topic for an Indian index-options trader (Nifty/BankNifty/Sensex, lot sizes, expiry
   rhythm, STT and charges where relevant). Plain language, worked examples with real-looking numbers, what to do and what not to
   do, and a short "how this shows up on my terminal / option chain" section. Publish it as an Artifact (load the artifact-design
   skill first) so it opens on my phone.
2. Save a `learning_notes` row via the Supabase MCP (`execute_sql`, project `owpcomcmvwiutlulojts`, set `user_id` from
   `select id from auth.users order by created_at limit 1`): `date` = today, `title`, one-line `summary`, 4–7 `points` (the things
   worth remembering), `url` = the artifact link, `tags` = 1–3 tags (reuse existing tags from the table where they fit).
   If the MCP isn't available, print the SQL for me to paste.
3. Reply with the artifact link and the key points only. No preamble.

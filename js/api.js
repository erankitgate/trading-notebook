/* Supabase data layer. Everything the app reads or writes goes through here,
   so views never touch the client directly. api.demo.js mirrors this interface. */

export const TABLES = ['diary_entries', 'learning_notes', 'highlights', 'setups', 'rules', 'settings', 'reviews', 'capital_log', 'market_briefs', 'trade_plans'];

export function createApi(cfg) {
  if (!window.supabase) throw new Error('Supabase library did not load. Check your connection and reload.');
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const unwrap = (r) => { if (r.error) throw r.error; return r.data; };

  return {
    kind: 'supabase',
    /* ---- auth ---- */
    onAuth(cb) { sb.auth.onAuthStateChange((_evt, session) => cb(session?.user ?? null)); },
    signIn(email) { return sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }).then(unwrap); },
    /** The login email carries a 6-digit code as well as the link; the code works on any device. */
    verifyCode(email, token) { return sb.auth.verifyOtp({ email, token, type: 'email' }).then(unwrap); },
    signInPassword(email, password) { return sb.auth.signInWithPassword({ email, password }).then(unwrap); },
    setPassword(password) { return sb.auth.updateUser({ password }).then(unwrap); },
    signOut() { return sb.auth.signOut(); },

    /* ---- reads ---- */
    async loadAll() {
      const [diary, learn, pins, setups, rules, settings, reviews, capital, briefs, plans] = await Promise.all([
        sb.from('diary_entries').select('*').order('date', { ascending: false }),
        sb.from('learning_notes').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
        sb.from('highlights').select('*').order('created_at', { ascending: true }),
        sb.from('setups').select('*').order('created_at', { ascending: true }),
        sb.from('rules').select('*').order('sort', { ascending: true }).order('created_at', { ascending: true }),
        sb.from('settings').select('*').maybeSingle(),
        sb.from('reviews').select('*').order('week_start', { ascending: false }),
        sb.from('capital_log').select('*').order('date', { ascending: false }),
        sb.from('market_briefs').select('*').order('date', { ascending: false }).limit(20),
        sb.from('trade_plans').select('*').order('date', { ascending: false }).order('sort', { ascending: true }).limit(50),
      ].map((p) => p.then(unwrap)));
      return { diary, learn, pins, setups, rules, settings: settings || null, reviews, capital, briefs, plans };
    },

    /* ---- writes (all scoped by RLS to the signed-in user) ---- */
    insert(table, row) { return sb.from(table).insert(row).select().single().then(unwrap); },
    update(table, id, row) { return sb.from(table).update(row).eq('id', id).select().single().then(unwrap); },
    remove(table, id) { return sb.from(table).delete().eq('id', id).then(unwrap); },
    /** settings has user_id as its key; upsert creates the row on first save. */
    /** One balance per date; re-reporting the same date replaces it. */
    logBalance(row, userId) { return sb.from('capital_log').upsert({ ...row, user_id: userId }, { onConflict: 'user_id,date' }).select().single().then(unwrap); },
    saveSettings(row, userId) { return sb.from('settings').upsert({ ...row, user_id: userId }, { onConflict: 'user_id' }).select().single().then(unwrap); },

    /* ---- live market data via the market-live edge function (owner's session only) ---- */
    async live(op, params = {}) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error('sign in first');
      const q = new URLSearchParams({ op, ...params });
      const r = await fetch(`${cfg.supabaseUrl}/functions/v1/market-live?${q}`, { headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${session.access_token}` } });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || body.errors?.[0]?.message || `live data HTTP ${r.status}`);
      return body.data ?? body;
    },

    /* ---- live sync: any change to any table → onChange(); onStatus(bool) ---- */
    subscribe(onChange, onStatus) {
      let ch = sb.channel('notebook');
      for (const t of TABLES) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange);
      ch.subscribe((status) => onStatus(status === 'SUBSCRIBED'));
      return () => sb.removeChannel(ch);
    },
  };
}

/** Postgres error → human sentence. */
export function explain(err) {
  if (!err) return 'Unknown error';
  if (err.code === '23505') return 'A page for this date already exists. Open it and edit instead.';
  if (err.code === '42501' || /row-level security/i.test(err.message || '')) return 'Not allowed — are you signed in?';
  if (/Failed to fetch|NetworkError/i.test(err.message || '')) return 'No connection. Your change was not saved.';
  return err.message || String(err);
}

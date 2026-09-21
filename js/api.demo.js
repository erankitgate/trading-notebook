/* In-memory stand-in for api.js with realistic sample data.
   Used by `?demo=1` (try the UI without signing in) and by the e2e tests.
   Deterministic: same data every load. Nothing here touches the network. */

import { today, addDays, weekday, weekStart } from './lib/fmt.js';
import { autoPnl } from './lib/stats.js';

let seed = 7;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const uid = () => `demo-${Math.floor(rnd() * 1e9).toString(36)}`;
const USER = { id: 'demo-user', email: 'demo@example.com' };

function build() {
  const setups = [
    { id: uid(), name: 'ORB breakout', description: 'Break of the 15-min opening range with volume, in the direction of the daily trend.', entry_rules: ['Range set by 9:30', 'Break with volume > 1.5× average', 'Nifty trend agrees'], exit_rules: ['Stop below/above range mid', 'Target 1.5R, trail rest'], active: true, notes: '' },
    { id: uid(), name: 'VWAP pullback', description: 'First pullback to VWAP in a trending session.', entry_rules: ['Price above VWAP for 30 min', 'Pullback holds VWAP on a 5-min close'], exit_rules: ['Stop 10 pts below VWAP', 'Exit at prior high'], active: true, notes: '' },
    { id: uid(), name: 'OI wall fade', description: 'Fade a move into the highest-OI strike late in the day.', entry_rules: ['After 1:30 pm', 'Spot within 20 pts of wall', 'No event day'], exit_rules: ['Stop past the wall', 'Book at 1R'], active: false, notes: 'Paused — two big losses in Aug.' },
  ];
  const rules = [
    { id: uid(), text: 'No trades in the first 15 minutes', active: true, sort: 1 },
    { id: uid(), text: 'Max 3 trades a day', active: true, sort: 2 },
    { id: uid(), text: 'Never move the stop further away', active: true, sort: 3 },
    { id: uid(), text: 'Stop for the day after the daily loss limit', active: true, sort: 4 },
  ];
  const settings = { user_id: USER.id, capital: 300000, start_date: addDays(today(), -45), risk_per_trade_pct: 1, daily_max_loss: 6000, max_trades_per_day: 3, checklist: ['Slept 7+ hours, mind is calm', 'Key levels marked (PDH/PDL, OI walls)', 'Event calendar checked', 'Max loss and max trades set', "Yesterday's plan read"] };

  const mistakes = ['Exited too early', 'Chased the entry', 'Moved the stop', 'Traded during news', 'Oversized'];
  const diary = [];
  let d = addDays(today(), -45);
  while (d < today()) {
    if (weekday(d) !== 0 && weekday(d) !== 6 && rnd() > 0.15) {
      const n = 1 + Math.floor(rnd() * 3), trades = [];
      for (let i = 0; i < n; i++) {
        const side = rnd() > 0.35 ? 'Buy' : 'Sell', strike = 24800 + Math.floor(rnd() * 8) * 50, kind = rnd() > 0.5 ? 'CE' : 'PE';
        const entry = 60 + Math.floor(rnd() * 120), win = rnd() > 0.42;
        const move = (win ? 1 : -1) * (8 + Math.floor(rnd() * 30)) * (side === 'Buy' ? 1 : -1);
        const qty = 75 * (1 + Math.floor(rnd() * 2)), stop = side === 'Buy' ? entry - 15 : entry + 15;
        const t = { instrument: `NIFTY ${strike} ${kind}`, side, qty, entry, exit: entry + move, stop, target: side === 'Buy' ? entry + 30 : entry - 30, setup: pick([setups[0].name, setups[1].name, setups[1].name, '']), time_in: `${9 + Math.floor(rnd() * 5)}:${pick(['05', '20', '35', '50'])}`, time_out: '', reason: pick(['Clean ORB with volume', 'VWAP held on the retest', 'Trend day, buying the dip', 'Wall at 25000 holding']), result: pick(['Ran to target', 'Stopped out', 'Booked at 1R', 'Chopped around, scratched']) };
        t.pnl = autoPnl(t); trades.push(t);
      }
      const ms = rnd() > 0.55 ? [{ tag: pick(mistakes), detail: pick(['Saw the setup and jumped before the close', 'Fear after yesterday', 'Had the plan, ignored it']) }] : [];
      if (rnd() > 0.8) ms.push({ tag: 'Exited too early', detail: 'Booked 0.5R then it ran 3R' });
      const broken = rnd() > 0.7 ? [{ id: rules[0].id, text: rules[0].text }] : [];
      const rules_check = rules.map((r) => ({ id: r.id, text: r.text, followed: !broken.some((b) => b.id === r.id) && rnd() > 0.15 }));
      const gross = trades.reduce((s, t) => s + t.pnl, 0);
      diary.push({
        id: uid(), user_id: USER.id, date: d, title: pick(['Trend day, followed the plan', 'Choppy expiry, small size', 'Gap up, faded and reversed', 'One good trade and done', 'Overtraded a range']),
        market: pick(['Nifty gap up, trending', 'Range-bound expiry', 'Gap down, VIX 14', 'Slow grind up']), mood: pick(['Calm', 'FOMO', 'Tired', 'Focused']),
        plan_followed: pick(['yes', 'yes', 'partly', 'no']), plan_note: pick(['', 'Took one extra trade', 'Waited for the level as planned']),
        trades, mistakes: ms, went_well: gross > 0 ? ['Waited for the level', 'Sized correctly'] : ['Cut the loss fast'],
        lessons: [pick(['Expiry moves fast after 1 pm; halve size', 'One good trade is enough', 'Trend days: hold the runner', 'Do not trade the first 15 minutes'])],
        next_day_strategy: [pick(['Buy dips above 25000 only', 'Sit out until 9:45', 'Only ORB setup, max 2 trades', 'Sell rallies into 25200 wall'])],
        notes: '', charges: Math.round(trades.length * (40 + rnd() * 60)), checklist: settings.checklist.map((item, i) => ({ item, done: i < 4 || rnd() > 0.5 })),
        rules_broken: broken, rules_check, watchlist: [{ instrument: 'NIFTY', bias: pick(['bullish', 'bearish', 'neutral']), levels: '24950 / 25120 / 25300', note: 'Wall at 25300' }, { instrument: 'BANKNIFTY', bias: 'neutral', levels: '56200 / 56800', note: '' }],
        created_at: `${d}T16:00:00Z`, updated_at: `${d}T16:00:00Z`,
      });
    }
    d = addDays(d, 1);
  }
  diary.sort((a, b) => (a.date < b.date ? 1 : -1));
  const learn = [{ id: uid(), user_id: USER.id, date: addDays(today(), -3), title: 'Option chain explained: LTP, OI, IV, Greeks', summary: 'How to read every column of an option chain.', points: ['Highest Call OI acts like resistance, highest Put OI like support', 'Theta always hurts buyers; IV crush after events'], url: 'https://claude.ai/artifact/EN5MxFBRKkbHbdwBjXtUTF', tags: ['Options', 'Greeks'], created_at: `${today()}T10:00:00Z` }];
  const pins = [{ id: uid(), user_id: USER.id, text: 'One good trade a day. Then close the terminal.', created_at: `${today()}T09:00:00Z` }];
  const reviews = [{ id: uid(), user_id: USER.id, week_start: weekStart(addDays(today(), -7)), grade: 'B', what_worked: ['Waited for ORB confirmation', 'Sized by risk budget'], what_didnt: ['Two early exits on trend days'], focus: ['Hold runners to 2R with a trailing stop'], notes: '' }];
  const capital = [{ id: uid(), user_id: USER.id, date: addDays(today(), -45), amount: 300000, note: 'Starting capital' }, { id: uid(), user_id: USER.id, date: addDays(today(), -20), amount: 296400, note: '' }, { id: uid(), user_id: USER.id, date: addDays(today(), -1), amount: 303150, note: 'after charges' }];
  const mk = (symbol, name, close, chg, rsi, trend, extra = {}) => ({ symbol, name, close, prev_close: +(close / (1 + chg / 100)).toFixed(2), chg_1d: chg, chg_5d: +(chg * 1.8).toFixed(2), chg_20d: +(chg * 3.1).toFixed(2), rsi, trend, dist_sma20_pct: +(chg * 0.9).toFixed(2), high: +(close * 1.006).toFixed(2), low: +(close * 0.993).toFixed(2), atr: +(close * 0.011).toFixed(2), sma20: +(close * 0.995).toFixed(2), sma50: +(close * 0.98).toFixed(2), sma200: +(close * 0.93).toFixed(2), hi_52w: +(close * 1.09).toFixed(2), lo_52w: +(close * 0.78).toFixed(2), date: addDays(today(), -1), ...extra });
  const nifty = mk('^NSEI', 'Nifty 50', 23414.3, 0.29, 58.2, 'up', { pivots: { pdh: 23461.5, pdl: 23302.1, pivot: 23392.6, r1: 23483.2, r2: 23552, r3: 23642.6, s1: 23323.8, s2: 23233.2, s3: 23164.4 } });
  const briefs = [{ id: uid(), user_id: USER.id, date: today(), as_of: addDays(today(), -1), updated_at: new Date().toISOString(),
    summary: 'Nifty closed up a third day, above the 20-DMA with RSI in the high 50s: an uptrend that is not yet stretched. Crude is soft and the dollar index is flat, which helps. Breadth was positive (31 up, 19 down). Bank Nifty lagged.\nExpiry is Thursday; the 23,500 call wall is the level to respect on the upside, 23,300 the support.',
    plan: ['No trade unless Nifty holds above 23,392 (pivot) for 30 minutes after the open', 'Buy the dip toward 23,320–23,330 (S1) only with a written entry, SL 40 points below, target R1 23,483', 'No positions into the 23,500 wall; book there', 'Single trade. If stopped, done for the day'],
    nifty, indices: [mk('^NSEBANK', 'Bank Nifty', 51280.4, -0.18, 49.5, 'sideways', { pivots: { pdh: 51520, pdl: 51110, pivot: 51303, r1: 51497, r2: 51713, r3: 51907, s1: 51087, s2: 50893, s3: 50677 } }), mk('^INDIAVIX', 'India VIX', 12.84, -2.1, 41, 'down')],
    globals: [mk('CL=F', 'Crude WTI ($)', 61.42, -1.12, 44, 'down'), mk('BZ=F', 'Brent ($)', 65.1, -0.9, 45, 'down'), mk('GC=F', 'Gold ($)', 3712, 0.4, 66, 'up'), mk('DX-Y.NYB', 'Dollar index', 97.3, 0.05, 48, 'sideways'), mk('USDINR=X', 'USD/INR', 88.1, 0.1, 62, 'up'), mk('^TNX', 'US 10Y yield (%)', 4.12, -0.5, 47, 'sideways'), mk('^GSPC', 'S&P 500', 6640, 0.5, 64, 'up'), mk('^IXIC', 'Nasdaq', 22480, 0.7, 66, 'up'), mk('^DJI', 'Dow', 46120, 0.3, 61, 'up'), mk('^VIX', 'US VIX', 15.4, -3, 38, 'down'), mk('^N225', 'Nikkei', 45310, 1.0, 71, 'up'), mk('^HSI', 'Hang Seng', 26450, -0.6, 55, 'up'), mk('000001.SS', 'Shanghai', 3830, 0.2, 58, 'up'), mk('^KS11', 'Kospi', 3450, 0.9, 70, 'up')],
    stocks: [['RELIANCE', 1412, 1.4, 61, 'up'], ['HDFCBANK', 968, -0.4, 47, 'sideways'], ['ICICIBANK', 1421, 0.6, 55, 'up'], ['INFY', 1512, 1.9, 63, 'up'], ['TCS', 3090, 1.1, 46, 'sideways'], ['BHARTIARTL', 1930, 0.3, 58, 'up'], ['ITC', 411, -0.7, 42, 'down'], ['LT', 3660, 0.9, 60, 'up'], ['SBIN', 858, -0.2, 52, 'sideways'], ['AXISBANK', 1105, -1.3, 38, 'down'], ['KOTAKBANK', 2010, 0.1, 50, 'sideways'], ['HINDUNILVR', 2560, -0.9, 36, 'down'], ['BAJFINANCE', 1005, 2.3, 72, 'up'], ['MARUTI', 15840, 1.7, 74, 'up'], ['TATAMOTORS', 712, -2.1, 29, 'down'], ['TATASTEEL', 171, 0.8, 57, 'up'], ['SUNPHARMA', 1620, -0.3, 45, 'sideways'], ['TITAN', 3410, 0.5, 59, 'up'], ['ETERNAL', 331, 3.1, 78, 'up'], ['TRENT', 4590, -1.8, 33, 'down']].map(([sy, c, ch, r, t]) => mk(sy, sy, c, ch, r, t)),
    breadth: { advances: 31, declines: 19, above_sma20: 34, rsi_over_70: ['BAJFINANCE', 'MARUTI', 'ETERNAL'], rsi_under_30: ['TATAMOTORS'] },
    oi: { weekly: { expiry: today(), pcr: 1.1, max_call: 23500, max_put: 23400, call_walls: [[23500, 11.9], [23600, 10.8], [23700, 9.5]], put_walls: [[23400, 16.4], [23300, 16.1], [23000, 12.9]], straddle: 133, expected_move: 105 }, monthly: { expiry: addDays(today(), 7), pcr: 0.85, max_call: 24000, max_put: 23000, call_walls: [[24000, 11.7], [23500, 5.7]], put_walls: [[23000, 8.5], [23300, 5.6]] } },
    report: '## The one-line read\n\nNifty is oversold inside a downtrend. **Weekly expiry tomorrow** — no weekly options.\n\n## Global cues\n\n| Cue | Level | Read |\n|---|---|---|\n| Brent | $99.5, −4.2% | Saudi exports recovering |\n| Dollar index | 100.4 | Firm after the Fed hike |\n\n## Nifty technicals\n\n- Price at the 10-DMA; 20-DMA 23,747 overhead\n- RSI 37, ATR 186\n\n## Plan for the session\n\n1. Manage the open position first\n2. Long only above R1\n3. Otherwise no trade' }];
  const plans = [
    { id: uid(), user_id: USER.id, date: today(), instrument: 'NIFTY 29 SEP 23500 CE', instrument_key: 'NSE_FO|DEMO1', side: 'Buy', entry: 23490, stop: 23395, target: 23620, qty: 75, condition: 'Gap-up holds R1 23,483 for 15 min and crude still down', status: 'waiting', sort: 1, note: 'Nifty spot levels' },
    { id: uid(), user_id: USER.id, date: today(), instrument: 'LAURUSLABS 1900 CE 29 SEP', instrument_key: 'NSE_FO|DEMO2', side: 'Buy', entry: 123.94, stop: 113, target: null, qty: 850, condition: 'Open position from yesterday', status: 'live', fill: 123.94, sort: 0, note: 'SL to break-even if it opens up' },
  ];
  return { diary, learn, pins, setups, rules, settings, reviews, capital, briefs, plans };
}

export function createDemoApi() {
  const db = build();
  const tableOf = { diary_entries: 'diary', learning_notes: 'learn', highlights: 'pins', setups: 'setups', rules: 'rules', reviews: 'reviews', capital_log: 'capital', market_briefs: 'briefs', trade_plans: 'plans' };
  let tick = 0;
  const wiggle = (base, amp) => +(base + Math.sin((tick += 0.7) + base) * amp).toFixed(2);
  let onChange = () => {};
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const ping = () => setTimeout(onChange, 0);
  return {
    kind: 'demo',
    onAuth(cb) { setTimeout(() => cb(USER), 0); },
    signIn() { return Promise.resolve(); },
    verifyCode() { return Promise.resolve(); },
    signInPassword() { return Promise.resolve(); },
    setPassword() { return Promise.resolve(); },
    signOut() { location.href = location.pathname; return Promise.resolve(); },
    loadAll() { return Promise.resolve(clone(db)); },
    insert(table, row) {
      const list = db[tableOf[table]];
      if (table === 'diary_entries' && list.some((e) => e.date === row.date)) return Promise.reject({ code: '23505', message: 'duplicate key' });
      const full = { id: uid(), user_id: USER.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
      list.push(full); if (table === 'diary_entries') list.sort((a, b) => (a.date < b.date ? 1 : -1)); ping(); return Promise.resolve(clone(full));
    },
    update(table, id, row) { const list = db[tableOf[table]]; const i = list.findIndex((x) => x.id === id); Object.assign(list[i], row, { updated_at: new Date().toISOString() }); ping(); return Promise.resolve(clone(list[i])); },
    remove(table, id) { const list = db[tableOf[table]]; const i = list.findIndex((x) => x.id === id); if (i >= 0) list.splice(i, 1); ping(); return Promise.resolve(); },
    saveSettings(row) { db.settings = { ...(db.settings || {}), ...row, user_id: USER.id }; ping(); return Promise.resolve(clone(db.settings)); },
    logBalance(row) { const i = db.capital.findIndex((c) => c.date === row.date); const full = { id: uid(), user_id: USER.id, created_at: new Date().toISOString(), ...row }; if (i >= 0) db.capital[i] = { ...db.capital[i], ...row }; else db.capital.push(full); db.capital.sort((a, b) => (a.date < b.date ? 1 : -1)); ping(); return Promise.resolve(clone(full)); },
    subscribe(cb, onStatus) { onChange = cb; setTimeout(() => onStatus(true), 0); return () => { onChange = () => {}; }; },
    live(op, params = {}) {
      const q = (k, base, amp, prev) => ({ [k.replace('|', ':')]: { last_price: wiggle(base, amp), net_change: +(wiggle(base, amp) - prev).toFixed(2), ohlc: { open: prev + 20, high: base + amp, low: base - amp, close: prev }, instrument_token: k } });
      if (op === 'quote' || op === 'ltp') { const keys = String(params.keys || '').split(','); const out = {}; for (const k of keys) Object.assign(out, k.includes('Bank') ? q(k, 56480, 60, 56470.65) : k.includes('VIX') ? q(k, 11.3, 0.2, 11.25) : k.includes('DEMO1') ? q(k, 118, 6, 112) : k.includes('DEMO2') ? q(k, 124, 4, 119.3) : q(k, 23450, 40, 23414.3)); return Promise.resolve(out); }
      if (op === 'chain') return Promise.resolve([23300, 23400, 23500, 23600].map((s) => ({ strike_price: s, pcr: 1.1, call_options: { market_data: { oi: (24000 - s) * 300, ltp: Math.max(5, 23450 - s + 60) } }, put_options: { market_data: { oi: (s - 22800) * 250, ltp: Math.max(5, s - 23450 + 60) } } })));
      if (op === 'status') return Promise.resolve({ status: 'NORMAL_OPEN' });
      return Promise.resolve({});
    },
  };
}

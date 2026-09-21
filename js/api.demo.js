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
  const settings = { user_id: USER.id, capital: 300000, risk_per_trade_pct: 1, daily_max_loss: 6000, max_trades_per_day: 3, checklist: ['Slept 7+ hours, mind is calm', 'Key levels marked (PDH/PDL, OI walls)', 'Event calendar checked', 'Max loss and max trades set', "Yesterday's plan read"] };

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
      const gross = trades.reduce((s, t) => s + t.pnl, 0);
      diary.push({
        id: uid(), user_id: USER.id, date: d, title: pick(['Trend day, followed the plan', 'Choppy expiry, small size', 'Gap up, faded and reversed', 'One good trade and done', 'Overtraded a range']),
        market: pick(['Nifty gap up, trending', 'Range-bound expiry', 'Gap down, VIX 14', 'Slow grind up']), mood: pick(['Calm', 'FOMO', 'Tired', 'Focused']),
        plan_followed: pick(['yes', 'yes', 'partly', 'no']), plan_note: pick(['', 'Took one extra trade', 'Waited for the level as planned']),
        trades, mistakes: ms, went_well: gross > 0 ? ['Waited for the level', 'Sized correctly'] : ['Cut the loss fast'],
        lessons: [pick(['Expiry moves fast after 1 pm; halve size', 'One good trade is enough', 'Trend days: hold the runner', 'Do not trade the first 15 minutes'])],
        next_day_strategy: [pick(['Buy dips above 25000 only', 'Sit out until 9:45', 'Only ORB setup, max 2 trades', 'Sell rallies into 25200 wall'])],
        notes: '', charges: Math.round(trades.length * (40 + rnd() * 60)), checklist: settings.checklist.map((item, i) => ({ item, done: i < 4 || rnd() > 0.5 })),
        rules_broken: broken, watchlist: [{ instrument: 'NIFTY', bias: pick(['bullish', 'bearish', 'neutral']), levels: '24950 / 25120 / 25300', note: 'Wall at 25300' }, { instrument: 'BANKNIFTY', bias: 'neutral', levels: '56200 / 56800', note: '' }],
        created_at: `${d}T16:00:00Z`, updated_at: `${d}T16:00:00Z`,
      });
    }
    d = addDays(d, 1);
  }
  diary.sort((a, b) => (a.date < b.date ? 1 : -1));
  const learn = [{ id: uid(), user_id: USER.id, date: addDays(today(), -3), title: 'Option chain explained: LTP, OI, IV, Greeks', summary: 'How to read every column of an option chain.', points: ['Highest Call OI acts like resistance, highest Put OI like support', 'Theta always hurts buyers; IV crush after events'], url: 'https://claude.ai/artifact/EN5MxFBRKkbHbdwBjXtUTF', tags: ['Options', 'Greeks'], created_at: `${today()}T10:00:00Z` }];
  const pins = [{ id: uid(), user_id: USER.id, text: 'One good trade a day. Then close the terminal.', created_at: `${today()}T09:00:00Z` }];
  const reviews = [{ id: uid(), user_id: USER.id, week_start: weekStart(addDays(today(), -7)), grade: 'B', what_worked: ['Waited for ORB confirmation', 'Sized by risk budget'], what_didnt: ['Two early exits on trend days'], focus: ['Hold runners to 2R with a trailing stop'], notes: '' }];
  return { diary, learn, pins, setups, rules, settings, reviews };
}

export function createDemoApi() {
  const db = build();
  const tableOf = { diary_entries: 'diary', learning_notes: 'learn', highlights: 'pins', setups: 'setups', rules: 'rules', reviews: 'reviews' };
  let onChange = () => {};
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const ping = () => setTimeout(onChange, 0);
  return {
    kind: 'demo',
    onAuth(cb) { setTimeout(() => cb(USER), 0); },
    signIn() { return Promise.resolve(); },
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
    subscribe(cb, onStatus) { onChange = cb; setTimeout(() => onStatus(true), 0); return () => { onChange = () => {}; }; },
  };
}

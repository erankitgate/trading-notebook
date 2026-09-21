/* Single in-memory store. Views read from it; api writes then reload it. */

export const DEFAULT_SETTINGS = Object.freeze({
  capital: null, risk_per_trade_pct: 1, daily_max_loss: null, max_trades_per_day: 3,
  checklist: ['Slept 7+ hours, mind is calm', 'Key levels marked (PDH/PDL, OI walls)', 'Event calendar checked (RBI/Fed/expiry/results)', 'Max loss and max trades set for today', "Yesterday's plan and repeated mistakes read"],
});

export const S = {
  user: null, loaded: false,
  diary: [], learn: [], pins: [], setups: [], rules: [], settings: null, reviews: [],
};

export function setData(d) { Object.assign(S, d); S.loaded = true; }
export function clearData() { setData({ diary: [], learn: [], pins: [], setups: [], rules: [], settings: null, reviews: [] }); S.loaded = false; }
/** Settings with defaults filled in (settings row may not exist yet). */
export const settings = () => ({ ...DEFAULT_SETTINGS, ...(S.settings || {}) });
export const entryByDate = (date) => S.diary.find((e) => e.date === date);

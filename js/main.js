/* Boot: pick the data layer, wire auth + live sync, dispatch routes to views. */

import { createApi } from './api.js';
import { createDemoApi } from './api.demo.js';
import { S, setData, clearData } from './state.js';
import { parseHash, go as goTo, inForm } from './router.js';
import { $, $$, esc, toast } from './lib/dom.js';
import * as home from './views/home.js';
import * as diary from './views/diary.js';
import * as diaryForm from './views/diaryForm.js';
import * as analytics from './views/analytics.js';
import * as playbook from './views/playbook.js';
import * as learn from './views/learn.js';
import * as reviews from './views/reviews.js';
import * as settingsView from './views/settings.js';
import * as market from './views/market.js';
import * as liveView from './views/live.js';
import * as login from './views/login.js';

const app = $('#app'), tabs = $('#tabs'), foot = $('#foot'), live = $('#live');
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const cfg = window.NOTEBOOK_CONFIG || {};

/* ---------- context handed to every view ---------- */
let leaveFns = [];
const ctx = {
  app, demo: DEMO, api: null, query: new URLSearchParams(),
  go: (hash) => goTo(hash, route),
  reload,
  /** Register cleanup to run when the user leaves the current view. */
  onLeave: (fn) => leaveFns.push(fn),
  setNav(name) {
    tabs.hidden = foot.hidden = !name;
    for (const a of $$('a', tabs)) { if (a.dataset.r === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  },
};

/* ---------- routing ---------- */
function route() {
  for (const fn of leaveFns.splice(0)) { try { fn(); } catch { /* ignore */ } }
  if (!S.user) { login.render(ctx); return; }
  if (!S.loaded) { ctx.setNav(null); app.innerHTML = '<p class="status">Opening your notebook…</p>'; return; }
  const { path: [a, b, c], query } = parseHash();
  ctx.query = query;
  try {
    if (a === 'diary' && b === 'new') diaryForm.render(ctx, null, true);
    else if (a === 'diary' && b && c === 'edit') diaryForm.render(ctx, b, false);
    else if (a === 'diary' && b) diary.entry(ctx, b);
    else if (a === 'diary') diary.list(ctx);
    else if (a === 'analytics') analytics.render(ctx);
    else if (a === 'market') market.render(ctx, b);
    else if (a === 'live') liveView.render(ctx);
    else if (a === 'playbook' && b === 'new') playbook.form(ctx, null);
    else if (a === 'playbook' && b && c === 'edit') playbook.form(ctx, b);
    else if (a === 'playbook') playbook.list(ctx);
    else if (a === 'learn' && b === 'new') learn.form(ctx, null);
    else if (a === 'learn' && b && c === 'edit') learn.form(ctx, b);
    else if (a === 'learn') learn.list(ctx);
    else if (a === 'reviews' && b) reviews.form(ctx, b);
    else if (a === 'reviews') reviews.list(ctx);
    else if (a === 'settings') settingsView.render(ctx);
    else home.render(ctx);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<h1>Something went wrong</h1><p class="sub">${esc(e.message || e)}</p><p class="mt"><a class="btn" href="#/">Back to the front page</a></p>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------- data ---------- */
async function reload() {
  setData(await ctx.api.loadAll());
  if (!inForm()) route();
}
let reloadTimer = null;
const scheduleReload = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => reload().catch((e) => console.warn('reload failed', e)), 300); };
const setLive = (on) => { live.classList.toggle('on', on); live.classList.toggle('off', !on && !navigator.onLine); $('span', live).textContent = on ? (DEMO ? 'Demo mode' : 'Live sync on') : navigator.onLine ? 'Reconnecting' : 'Offline'; };
window.addEventListener('online', () => { setLive(false); scheduleReload(); });
window.addEventListener('offline', () => setLive(false));

/* ---------- start ---------- */
if (!DEMO && (!cfg.supabaseUrl || !cfg.supabaseAnonKey || /YOUR_/.test(cfg.supabaseUrl))) {
  app.innerHTML = '<h1>Almost there</h1><p class="sub">The notebook isn\'t connected to its database yet. Fill in <code>config.js</code> (or the SUPABASE_URL / SUPABASE_ANON_KEY repository secrets) and redeploy.</p>';
} else {
  try { ctx.api = DEMO ? createDemoApi() : createApi(cfg); }
  catch (e) { app.innerHTML = `<h1>Could not start</h1><p class="sub">${esc(e.message)}</p>`; }
}
if (ctx.api) {
  $('#logout').onclick = () => ctx.api.signOut();
  let started = false;
  ctx.api.onAuth(async (user) => {
    S.user = user;
    if (!user) { started = false; clearData(); route(); return; }
    if (started) return; // token refreshes also fire this callback
    started = true;
    route();
    try {
      setData(await ctx.api.loadAll());
      route();
      ctx.api.subscribe(scheduleReload, setLive);
    } catch (e) {
      console.error(e);
      app.innerHTML = `<h1>Could not load</h1><p class="sub">${esc(e.message || e)}</p><p class="sub small mt">If this is the first run, make sure the migrations in <code>supabase/migrations</code> were applied.</p>`;
    }
  });
}
window.addEventListener('unhandledrejection', (ev) => { console.error(ev.reason); toast(`Something went wrong: ${ev.reason?.message || ev.reason}`, 'bad', 5000); });

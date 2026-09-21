/* Sign in with an email magic link. */

import { esc, busy } from '../lib/dom.js';
import { explain } from '../api.js';

export function render(ctx, msg) {
  ctx.setNav(null);
  ctx.app.innerHTML = `<div class="login"><h1>Sign in</h1><p class="sub">Enter your email. You'll get a login link — no password needed. Open it on this same device.</p>
    <form id="lg" novalidate><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" inputmode="email" required><button class="btn" type="submit">Send login link</button></form>
    <p class="err" id="err" role="alert">${esc(msg || '')}</p>
    <p class="small muted">Just looking? <a href="?demo=1#/">Open the demo</a> with sample data — nothing is saved.</p></div>`;
  const f = ctx.app.querySelector('#lg'), err = f.parentElement.querySelector('#err');
  f.onsubmit = (ev) => {
    ev.preventDefault(); err.textContent = '';
    const email = f.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Enter a valid email address.'; f.email.focus(); return; }
    busy(f.querySelector('button'), 'Sending…', async () => {
      try {
        await ctx.api.signIn(email);
        ctx.app.innerHTML = `<div class="login"><h1>Check your email</h1><p class="sub">We sent a login link to <strong>${esc(email)}</strong>. Open it on this device to get in.</p><p class="small muted mt">No email after a minute? Check spam. Links can be requested only a couple of times an hour.</p></div>`;
      } catch (e) { err.textContent = /rate limit/i.test(e.message || '') ? 'Too many login emails requested. Wait an hour and try again, or open a link already in your inbox.' : explain(e); }
    });
  };
}

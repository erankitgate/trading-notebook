/* Sign in with an email: the mail carries a link (same device) and a 6-digit code (any device). */

import { esc, busy } from '../lib/dom.js';
import { explain } from '../api.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rateLimited = (e) => (/rate limit|too many/i.test(e?.message || '') ? 'Too many login emails requested. Wait an hour, or use a code already in your inbox.' : explain(e));

export function render(ctx, msg) {
  ctx.setNav(null);
  let remembered = '';
  try { remembered = localStorage.getItem('notebook.email') || ''; } catch { /* private mode */ }
  ctx.app.innerHTML = `<div class="login"><h1>Sign in</h1><p class="sub">Enter your email. You'll get a mail with a login link and a 6-digit code — no password.</p>
    <form id="lg" novalidate><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="username" inputmode="email" value="${esc(remembered)}" required>
      <label for="pw">Password <span class="muted">(leave blank to get an email instead)</span></label><input id="pw" name="password" type="password" autocomplete="current-password">
      <div class="acts"><button class="btn" type="submit">Sign in</button><button class="btn ghost" type="button" id="sendMail">Email me a link / code</button></div></form>
    <p class="err" id="err" role="alert">${esc(msg || '')}</p>
    <p class="small muted">Already have a code? <a href="#" id="haveCode">Enter it</a>. Just looking? <a href="?demo=1#/">Open the demo</a> with sample data.</p></div>`;
  const f = ctx.app.querySelector('#lg'), err = ctx.app.querySelector('#err');
  const codeStep = (email) => {
    ctx.app.innerHTML = `<div class="login"><h1>Check your email</h1><p class="sub">We sent a login email to <strong>${esc(email)}</strong>. Either tap the link in it on this device, or type the 6-digit code from it below (works on any device).</p>
      <form id="cf" novalidate><label for="code">6-digit code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required><button class="btn" type="submit">Sign in</button></form>
      <p class="err" id="err2" role="alert"></p><p class="small muted">No email after a minute? Check spam. <a href="#" id="back">Use a different email</a>.</p></div>`;
    const cf = ctx.app.querySelector('#cf'), err2 = ctx.app.querySelector('#err2');
    cf.code.focus();
    ctx.app.querySelector('#back').onclick = (ev) => { ev.preventDefault(); render(ctx); };
    cf.onsubmit = (ev) => {
      ev.preventDefault(); err2.textContent = '';
      const code = cf.code.value.replace(/\D/g, '');
      if (code.length !== 6) { err2.textContent = 'Enter the 6 digits from the email.'; cf.code.focus(); return; }
      busy(cf.querySelector('button'), 'Checking…', async () => {
        try { await ctx.api.verifyCode(email, code); /* onAuth takes over from here */ }
        catch (e) { err2.textContent = /expired|invalid/i.test(e.message || '') ? 'That code is wrong or has expired. Request a new email.' : explain(e); }
      });
    };
  };
  ctx.app.querySelector('#haveCode').onclick = (ev) => {
    ev.preventDefault(); const email = f.email.value.trim();
    if (!EMAIL.test(email)) { err.textContent = 'Enter your email first.'; f.email.focus(); return; }
    codeStep(email);
  };
  const remember = (email) => { try { localStorage.setItem('notebook.email', email); } catch { /* ignore */ } };
  const sendMail = () => {
    err.textContent = '';
    const email = f.email.value.trim();
    if (!EMAIL.test(email)) { err.textContent = 'Enter a valid email address.'; f.email.focus(); return; }
    busy(f.querySelector('#sendMail'), 'Sending…', async () => {
      try { await ctx.api.signIn(email); remember(email); codeStep(email); }
      catch (e) { err.textContent = rateLimited(e); }
    });
  };
  f.querySelector('#sendMail').onclick = sendMail;
  f.onsubmit = (ev) => {
    ev.preventDefault(); err.textContent = '';
    const email = f.email.value.trim(), password = f.password.value;
    if (!EMAIL.test(email)) { err.textContent = 'Enter a valid email address.'; f.email.focus(); return; }
    if (!password) { sendMail(); return; }
    busy(f.querySelector('[type=submit]'), 'Signing in…', async () => {
      try { await ctx.api.signInPassword(email, password); remember(email); /* onAuth takes over */ }
      catch (e) { err.textContent = /invalid login/i.test(e.message || '') ? 'Wrong email or password.' : explain(e); f.password.focus(); }
    });
  };
}

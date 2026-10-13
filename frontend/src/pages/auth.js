import { api, setToken } from '../api.js';
import { $, actions, copyText } from '../ui.js';

export function mount(root, { onAuthed }) {
  let mode = 'login', pending = null;

  const field = (id, label, type = 'text', extra = '') =>
    `<label for="${id}">${label}</label><input id="${id}" type="${type}" ${extra}>`;

  function draw() {
    const m = mode;
    root.innerHTML = `<div id="auth"><div class="ac">
      <h1>${m === 'login' ? 'Welcome back' : m === 'register' ? 'Create your account' : 'Reset password'}</h1>
      <p class="sub">Keep your word. Know who keeps theirs.</p>
      ${m === 'register' ? field('a-name', 'Your name', 'text', 'maxlength="40" autocomplete="name"') +
        field('a-username', 'Username', 'text', 'maxlength="20" autocapitalize="none" autocomplete="username" placeholder="letters, numbers, underscore"') : ''}
      ${field('a-email', 'Email', 'email', 'maxlength="120" autocomplete="email"')}
      ${m === 'reset' ? field('a-key', 'Recovery key', 'text', 'placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off"') : ''}
      ${field('a-pass', m === 'reset' ? 'New password' : 'Password', 'password', `maxlength="128" autocomplete="${m === 'login' ? 'current-password' : 'new-password'}"`)}
      <p class="err" id="a-err" role="alert"></p>
      <button class="wide go" data-act="go">${m === 'login' ? 'Log in' : m === 'register' ? 'Create account' : 'Reset password'}</button>
      <button class="wide" data-act="switch" style="border-color:transparent">${m === 'login' ? 'New here? Create an account' : 'Back to log in'}</button>
      ${m === 'login' ? '<button class="wide" data-act="reset" style="border-color:transparent">Forgot password?</button>' : ''}
    </div></div>`;
  }

  function showKey(key) {
    root.innerHTML = `<div id="auth"><div class="ac">
      <h2>Save your recovery key</h2>
      <p class="note">This is the only way to reset a forgotten password. It will not be shown again, so store it somewhere safe.</p>
      <div class="rkey">${key}</div>
      <button class="wide" data-act="copy">Copy key</button>
      <button class="wide go" data-act="done">I saved it, continue</button>
    </div></div>`;
  }

  actions(root, async (act, btn) => {
    const err = $('#a-err');
    if (act === 'switch') { mode = mode === 'login' ? 'register' : 'login'; return draw(); }
    if (act === 'reset') { mode = 'reset'; return draw(); }
    if (act === 'copy') { btn.textContent = (await copyText($('.rkey').textContent)) ? 'Copied' : 'Select the key and copy it'; return; }
    if (act === 'done') { return onAuthed(pending); }
    if (act === 'go') {
      err.textContent = '';
      const v = id => ($(id) ? $(id).value.trim() : '');
      const email = v('#a-email'), password = $('#a-pass').value;
      try {
        let res;
        if (mode === 'login') res = await api('/auth/login', { method: 'POST', body: { email, password } });
        else if (mode === 'register') res = await api('/auth/register', { method: 'POST', body: { name: v('#a-name'), username: v('#a-username').toLowerCase(), email, password } });
        else res = await api('/auth/reset', { method: 'POST', body: { email, recovery_key: v('#a-key'), new_password: password } });
        setToken(res.token);
        pending = res.user;
        if (res.recovery_key) showKey(res.recovery_key); else onAuthed(res.user);
      } catch (e) { err.textContent = e.message; }
    }
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const go = root.querySelector('[data-act="go"]'); go && go.click(); }
  });
  draw();
}

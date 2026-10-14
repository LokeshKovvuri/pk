import './styles.css';
import { api, hasToken, openSocket, setToken } from './api.js';
import { $, applyTheme, esc } from './ui.js';
import { checkAlerts } from './alerts.js';
import * as auth from './pages/auth.js';
import * as promises from './pages/promises.js';
import * as insights from './pages/insights.js';
import * as feed from './pages/feed.js';
import * as hub from './pages/hub.js';
import * as me from './pages/me.js';

const PAGES = { promises, insights, feed, chats: hub, me };
const TABS = [['promises', 'Promises'], ['insights', 'Insights'], ['feed', 'Feed'], ['chats', 'Chats'], ['me', 'Me']];

const listeners = {};
const bus = {
  on(type, fn) { (listeners[type] = listeners[type] || new Set()).add(fn); return () => listeners[type].delete(fn); },
  emit(type, data) { (listeners[type] || []).forEach(fn => fn(data)); }
};

let user, tab = 'promises', cleanup, closeSocket;

async function refreshHeader() {
  try {
    const s = await api('/stats');
    $('#pct').textContent = s.kept_pct == null ? '\u2013' : `${s.kept_pct}%`;
    $('#ring').style.setProperty('--pct', s.kept_pct || 0);
    const d = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    $('#sub').textContent = `${d} \u00b7 ${s.open} open ${s.open === 1 ? 'promise' : 'promises'}`;
  } catch { /* header is cosmetic */ }
}

function logout() {
  closeSocket && closeSocket();
  setToken(null);
  location.reload();
}

const ctx = { get user() { return user; }, bus, refreshHeader, logout, go: t => show(t), setUser: u => { user = u; $('#hi').textContent = `Hi ${u.name.split(' ')[0]}`; } };

function show(t) {
  tab = t;
  cleanup && cleanup();
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  // A fresh element per page, so listeners from the previous page can never fire on this one.
  const page = document.createElement('div');
  page.id = 'page';
  $('#page').replaceWith(page);
  scrollTo(0, 0);
  cleanup = PAGES[t].mount(page, ctx);
}

function startApp(u) {
  user = u;
  $('#app').innerHTML = `<main>
    <div class="hd"><div class="b" style="align-items:center;gap:14px">
      <div class="ring" id="ring"><div id="pct">\u2013</div></div>
      <div class="grow"><div class="hi" id="hi">Hi ${esc(u.name.split(' ')[0])}</div><div class="m" id="sub"></div></div>
    </div></div>
    <div id="page"></div>
  </main>
  <nav class="nav" aria-label="Main">${TABS.map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</nav>`;
  $('.nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.t); });
  closeSocket = openSocket(m => bus.emit(m.type, m), () => bus.emit('socket-open'));
  refreshHeader();
  show(tab);
  checkAlerts().catch(() => {});
  setInterval(() => checkAlerts().catch(() => {}), 30 * 60 * 1000);
}

async function boot() {
  applyTheme();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  if (hasToken()) {
    try { return startApp(await api('/me')); } catch { setToken(null); }
  }
  auth.mount($('#app'), { onAuthed: async () => startApp(await api('/me')) });
}

boot();

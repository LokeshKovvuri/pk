import './styles.css';
import { api, hasToken, openSocket, setToken } from './api.js';
import { $, esc } from './ui.js';
import * as auth from './pages/auth.js';
import * as promises from './pages/promises.js';
import * as insights from './pages/insights.js';
import * as feed from './pages/feed.js';
import * as chats from './pages/chats.js';
import * as shared from './pages/shared.js';
import * as friends from './pages/friends.js';
import * as me from './pages/me.js';

const PAGES = { promises, insights, feed, chats, shared, friends, me };
const TABS = [['promises', 'Promises'], ['insights', 'Insights'], ['feed', 'Feed'], ['chats', 'Chats'],
  ['shared', 'Shared'], ['friends', 'Friends'], ['me', 'Me']];

const listeners = {};
const bus = {
  on(type, fn) { (listeners[type] = listeners[type] || new Set()).add(fn); return () => listeners[type].delete(fn); },
  emit(type, data) { (listeners[type] || []).forEach(fn => fn(data)); }
};

let user, tab = 'promises', cleanup, closeSocket;

async function refreshHeader() {
  try {
    const s = await api('/stats');
    $('#pct').innerHTML = s.kept_pct == null ? '\u2013<small>no data</small>' : `${s.kept_pct}%<small>kept</small>`;
    $('#ring').style.setProperty('--pct', s.kept_pct || 0);
    $('#sub').textContent = `Hi ${user.name.split(' ')[0]}. ${s.open} open ${s.open === 1 ? 'promise' : 'promises'}`;
  } catch { /* header is cosmetic */ }
}

function logout() {
  closeSocket && closeSocket();
  setToken(null);
  location.reload();
}

const ctx = { get user() { return user; }, bus, refreshHeader, logout, setUser: u => { user = u; } };

function show(t) {
  tab = t;
  cleanup && cleanup();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  const page = $('#page');
  page.innerHTML = '';
  cleanup = PAGES[t].mount(page, ctx);
}

function startApp(u) {
  user = u;
  $('#app').innerHTML = `<main>
    <div class="top">
      <div class="ring" id="ring"><div><span id="pct">\u2013</span></div></div>
      <div><h1>Promise Keeper</h1><p class="sub" id="sub">Hi ${esc(u.name.split(' ')[0])}</p></div>
    </div>
    <div class="seg" id="tabs">${TABS.map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</div>
    <div id="page"></div>
  </main>`;
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.t); });
  closeSocket = openSocket(m => bus.emit(m.type, m), () => bus.emit('socket-open'));
  refreshHeader();
  show(tab);
}

async function boot() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  if (hasToken()) {
    try { return startApp(await api('/me')); } catch { setToken(null); }
  }
  auth.mount($('#app'), { onAuthed: async () => startApp(await api('/me')) });
}

boot();

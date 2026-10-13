import { toast } from './ui.js';

const BASE = import.meta.env.VITE_API_URL || '';
let token = localStorage.getItem('pk-token');

export const hasToken = () => !!token;
export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('pk-token', t); else localStorage.removeItem('pk-token');
}

export async function api(path, { method = 'GET', body } = {}) {
  // Free hosts put idle servers to sleep; tell the user why the first request is slow.
  const wake = setTimeout(() => toast('Waking the server, this can take up to a minute...', 8000), 4000);
  let res;
  try {
    res = await fetch(BASE + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection.');
  } finally {
    clearTimeout(wake);
  }
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    setToken(null);
    location.reload();
    throw new Error('Please sign in again.');
  }
  if (!res.ok) {
    let msg = 'Something went wrong.';
    try {
      const j = await res.json();
      msg = typeof j.detail === 'string' ? j.detail : (j.detail || []).map(d => d.msg).join('. ') || msg;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

/** Live updates (chat). Reconnects automatically with backoff. Returns a function that closes it. */
export function openSocket(onMessage, onOpen) {
  const origin = (BASE || location.origin).replace(/^http/, 'ws');
  let ws, closed = false, tries = 0;
  const connect = () => {
    ws = new WebSocket(`${origin}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => { tries = 0; onOpen && onOpen(); };
    ws.onmessage = e => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore */ } };
    ws.onclose = () => { if (!closed) setTimeout(connect, Math.min(15000, 1000 * 2 ** tries++)); };
  };
  connect();
  return () => { closed = true; ws && ws.close(); };
}

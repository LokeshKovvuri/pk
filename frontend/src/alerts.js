import { api } from './api.js';
import { isoDate } from './ui.js';

const KEY = 'pk-alerts', SEEN = 'pk-alerts-seen';

export const alertsOn = () => localStorage.getItem(KEY) === '1' && 'Notification' in window && Notification.permission === 'granted';

export async function enableAlerts() {
  if (!('Notification' in window)) throw new Error('This browser does not support notifications.');
  const r = await Notification.requestPermission();
  if (r !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings.');
  localStorage.setItem(KEY, '1');
  await checkAlerts(true);
}

export function disableAlerts() { localStorage.removeItem(KEY); }

/** Shows one notification per day (and per change) for promises that are due today or overdue. */
export async function checkAlerts(force = false) {
  if (!alertsOn()) return;
  const rows = await api('/promises?status=open');
  const today = isoDate();
  const late = rows.filter(p => p.due && p.due < today).length;
  const now = rows.filter(p => p.due === today).length;
  if (!late && !now) return;
  const key = `${today}|${late}|${now}`;
  if (!force && localStorage.getItem(SEEN) === key) return;
  localStorage.setItem(SEEN, key);
  const body = `${now} due today, ${late} overdue`;
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.ready;
    if (reg) return await reg.showNotification('Promise Keeper', { body, icon: '/icon-192.png' });
  } catch { /* fall back below */ }
  new Notification('Promise Keeper', { body });
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
export const attr = s => esc(s).replace(/"/g, '&quot;');

const pad = n => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };

export function daysUntil(due) {
  const a = new Date(due + 'T00:00:00'), t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((a - t) / 864e5);
}

export function dueText(due) {
  if (!due) return 'No due date';
  const n = daysUntil(due);
  if (n < 0) return `<b class="late">${-n} ${n === -1 ? 'day' : 'days'} overdue</b>`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}

export function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
  return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd';
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  const t = document.createElement('textarea');
  t.value = text; t.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* ignore */ }
  t.remove();
  return ok;
}

/** First tap arms the button ("Tap again"), second tap within 3s runs it. Returns true when confirmed. */
export function confirmTap(btn, armedLabel = 'Tap again to confirm') {
  if (btn.dataset.arm === '1') return true;
  const label = btn.textContent;
  btn.dataset.arm = '1';
  btn.textContent = armedLabel;
  setTimeout(() => { btn.dataset.arm = ''; btn.textContent = label; }, 3000);
  return false;
}

/** Event delegation: runs handler(actionName, button, event) for clicks on [data-act]. */
export function actions(root, handler) {
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    try { await handler(b.dataset.act, b, e); } catch (err) { toast(err.message || 'Something went wrong'); }
  });
}

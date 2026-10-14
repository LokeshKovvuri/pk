import { api } from '../api.js';
import { $, actions, attr, avatar, confirmTap, esc, getTheme, setTheme, toast } from '../ui.js';
import { alertsOn, disableAlerts, enableAlerts } from '../alerts.js';

export function mount(root, ctx) {
  let me, stats;

  function draw() {
    const badges = [['1', 'First promise', stats.closed >= 1], ['7', '7-day streak', stats.best_streak >= 7],
      ['10', '10 kept', stats.kept >= 10], ['\u2713', 'Perfect month', stats.months.some(m => m.kept >= 5 && m.missed === 0)]];
    const theme = getTheme();
    root.innerHTML = `<div class="p"><div class="b" style="align-items:center;gap:14px">${avatar(me.name, 56)}<div class="grow"><div class="n" style="font-weight:800;font-size:20px">@${esc(me.username)}</div><div class="meta">${esc(me.email)}</div></div></div>
      <label for="mn">Name</label><input id="mn" maxlength="40" value="${attr(me.name)}">
      <button class="wide go" data-act="save">Save name</button></div>
      <div class="group">Status</div><div class="p"><div class="meta">${me.status ? `Showing to friends: <b>${esc(me.status)}</b>${me.status_until ? ' \u00b7 clears ' + new Date(me.status_until).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''}` : 'No status right now. Friends see it next to your name.'}</div>
      <div class="chips wrap" role="group" aria-label="Quick statuses">${['Available', 'Busy', 'At work', 'Out of town', 'Keeping my word'].map(t => `<button type="button" data-act="preset" data-t="${t}">${t}</button>`).join('')}</div>
      <label for="ms">Custom status</label><input id="ms" maxlength="100" placeholder="What are you up to?" value="${attr(me.status)}">
      <label for="mh">Clear after</label><select id="mh"><option value="1">1 hour</option><option value="4">4 hours</option><option value="24" selected>24 hours</option><option value="0">Never</option></select>
      <div class="row"><button type="button" data-act="clearstatus">Clear</button><button class="go" type="button" data-act="status">Save status</button></div></div>
      <div class="group">Badges</div><div class="p"><div class="badges">${badges.map(([n, l, on]) => `<div class="badge ${on ? '' : 'off'}"><div class="av ${on ? 't0' : 't3'}" style="width:52px;height:52px;font-size:20px;margin:0 auto">${n}</div><div class="m">${l}</div></div>`).join('')}</div></div>
      <div class="group">Reminders</div><div class="p"><div class="b" style="align-items:center"><div class="grow"><div class="t" style="font-weight:600">Due-date alerts</div><div class="meta">A notification when a promise is due today or overdue. Works while the app is open or running in the background.</div></div>
      <button class="sw ${alertsOn() ? 'on' : ''}" role="switch" aria-checked="${alertsOn()}" aria-label="Due-date alerts" data-act="alerts"></button></div><p class="err" id="aerr" role="alert"></p></div>
      <div class="group">Appearance</div><div class="seg">${['auto', 'light', 'dark'].map(t => `<button data-act="theme" data-t="${t}" class="${theme === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
      <div class="group">Account</div><div class="p"><div class="meta">Your name, username and status can be found by other users. Posts, stories and chats are visible only to friends. Blocked people: ${me.blocked_count}.</div>
      ${me.blocked_count ? '<button class="wide" data-act="unblock">Clear block list</button>' : ''}
      <button class="wide" data-act="export">Download my promises (JSON)</button><button class="wide" data-act="logout">Log out</button></div>`;
  }

  actions(root, async (act, b) => {
    if (act === 'save') {
      me = { ...me, ...(await api('/me', { method: 'PATCH', body: { name: $('#mn', root).value.trim() } })) };
      ctx.setUser(me); toast('Saved'); return draw();
    }
    if (act === 'preset') { $('#ms', root).value = b.dataset.t; return; }
    if (act === 'status' || act === 'clearstatus') {
      const text = act === 'clearstatus' ? '' : $('#ms', root).value.trim();
      me = { ...me, ...(await api('/me', { method: 'PATCH', body: { status: text, status_hours: +$('#mh', root).value } })) };
      toast(text ? 'Status saved' : 'Status cleared'); return draw();
    }
    if (act === 'alerts') {
      try { if (alertsOn()) disableAlerts(); else await enableAlerts(); } catch (e) { $('#aerr', root).textContent = e.message; return; }
      return draw();
    }
    if (act === 'theme') { setTheme(b.dataset.t); return draw(); }
    if (act === 'unblock') { await api('/blocks', { method: 'DELETE' }); me = await api('/me'); return draw(); }
    if (act === 'export') {
      const [open, closed] = await Promise.all([api('/promises?status=open'), api('/promises?status=closed')]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify([...open, ...closed], null, 2)], { type: 'application/json' }));
      a.download = 'promise-keeper-export.json'; a.click(); URL.revokeObjectURL(a.href); return;
    }
    if (act === 'logout') { if (!confirmTap(b, 'Tap again to log out')) return; ctx.logout(); }
  });

  Promise.all([api('/me'), api('/stats')]).then(([m, s]) => { me = m; stats = s; draw(); }).catch(e => toast(e.message));
}

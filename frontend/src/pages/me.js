import { api } from '../api.js';
import { $, actions, attr, confirmTap, esc, toast } from '../ui.js';

export function mount(root, ctx) {
  let me;

  function draw() {
    root.innerHTML = `<div class="person"><div class="n">@${esc(me.username)}</div><div class="meta">${esc(me.email)} \u00b7 share your username so friends can find you</div>
      <label for="mn">Name</label><input id="mn" maxlength="40" value="${attr(me.name)}">
      <label for="ms">Status</label><input id="ms" maxlength="100" placeholder="What are you up to?" value="${attr(me.status)}">
      <button class="wide go" data-act="save">Save profile</button></div>
      <div class="person"><div class="meta">Your name, username and status can be found by other users. Posts, stories and chats are visible only to friends. Blocked people: ${me.blocked_count}.</div>
      ${me.blocked_count ? '<button class="wide" data-act="unblock">Clear block list</button>' : ''}
      <button class="wide" data-act="export">Download my promises (JSON)</button>
      <button class="wide" data-act="logout">Log out</button></div>`;
  }

  actions(root, async (act, b) => {
    if (act === 'save') {
      me = await api('/me', { method: 'PATCH', body: { name: $('#mn', root).value.trim(), status: $('#ms', root).value.trim() } });
      ctx.setUser(me); ctx.refreshHeader(); toast('Saved'); return draw();
    }
    if (act === 'unblock') { await api('/blocks', { method: 'DELETE' }); me = await api('/me'); return draw(); }
    if (act === 'export') {
      const [open, closed] = await Promise.all([api('/promises?status=open'), api('/promises?status=closed')]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify([...open, ...closed], null, 2)], { type: 'application/json' }));
      a.download = 'promise-keeper-export.json'; a.click(); URL.revokeObjectURL(a.href); return;
    }
    if (act === 'logout') { if (!confirmTap(b, 'Tap again to log out')) return; ctx.logout(); }
  });

  api('/me').then(m => { me = m; draw(); }).catch(e => toast(e.message));
}

import { api } from '../api.js';
import { $, actions, avatar, confirmTap, esc, toast } from '../ui.js';

export function mount(root) {
  let friends = [], reqs = { incoming: [], outgoing: [] };

  function draw() {
    const keep = $('#fq', root) ? $('#fq', root).value : '', res = $('#fres', root) ? $('#fres', root).innerHTML : '';
    root.innerHTML = `<div class="person"><label for="fq" style="margin-top:0">Find a friend by username</label>
      <input id="fq" placeholder="username" autocapitalize="none" autocomplete="off" value="${esc(keep)}">
      <button class="wide go" data-act="find">Search</button><div id="fres">${res}</div></div>
      ${reqs.incoming.length ? `<div class="group">Friend requests</div>${reqs.incoming.map(r => `<div class="p"><div class="t">${esc(r.user.name)}</div><div class="meta">@${esc(r.user.username)} wants to be friends</div>
        <div class="act"><button class="keep" data-act="accept" data-id="${r.id}">Accept</button><button data-act="decline" data-id="${r.id}">Decline</button></div></div>`).join('')}` : ''}
      ${reqs.outgoing.length ? `<div class="group">Sent</div>${reqs.outgoing.map(r => `<div class="p"><div class="t">${esc(r.user.name)}</div><div class="meta">@${esc(r.user.username)} \u00b7 waiting</div>
        <div class="act"><button data-act="decline" data-id="${r.id}">Cancel</button></div></div>`).join('')}` : ''}
      <div class="group">Your friends</div>
      ${friends.length ? friends.map(f => `<div class="p"><div class="b" style="align-items:center;gap:12px">${avatar(f.user.name)}<div class="grow"><div class="t">${esc(f.user.name)}</div><div class="meta">@${esc(f.user.username)}${f.user.status ? ' \u00b7 ' + esc(f.user.status) : ''}</div></div></div>
        <div class="act"><button data-act="unfriend" data-id="${f.friendship_id}">Unfriend</button><button data-act="block" data-id="${f.user.id}">Block</button><button class="del" data-act="report" data-id="${f.user.id}">Report</button></div></div>`).join('')
        : '<div class="empty">No friends yet. Search a username above.</div>'}`;
  }

  async function load() { [friends, reqs] = await Promise.all([api('/friends'), api('/friends/requests')]); draw(); }

  actions(root, async (act, b) => {
    const id = b.dataset.id;
    if (act === 'find') {
      const name = $('#fq', root).value.trim().toLowerCase(), out = $('#fres', root);
      if (!name) return;
      try {
        const u = await api(`/users/search?username=${encodeURIComponent(name)}`);
        out.innerHTML = `<div class="p"><div class="t">${esc(u.name)}</div><div class="meta">@${esc(u.username)}</div><div class="act"><button class="keep" data-act="add" data-name="${esc(u.username)}">Send friend request</button></div></div>`;
      } catch (e) { out.innerHTML = `<p class="note">${esc(e.message)}</p>`; }
      return;
    }
    if (act === 'add') { await api('/friends/requests', { method: 'POST', body: { username: b.dataset.name } }); b.textContent = 'Request sent'; return setTimeout(() => load().catch(() => {}), 600); }
    if (act === 'accept') { await api(`/friends/requests/${id}/accept`, { method: 'POST' }); return load(); }
    if (act === 'decline') { await api(`/friends/requests/${id}`, { method: 'DELETE' }); return load(); }
    if (act === 'unfriend') { if (!confirmTap(b)) return; await api(`/friends/${id}`, { method: 'DELETE' }); return load(); }
    if (act === 'block') { if (!confirmTap(b)) return; await api('/blocks', { method: 'POST', body: { user_id: +id } }); return load(); }
    if (act === 'report') { await api('/reports', { method: 'POST', body: { kind: 'user', target_id: +id } }); b.textContent = 'Reported'; }
  });

  load().catch(e => toast(e.message));
}

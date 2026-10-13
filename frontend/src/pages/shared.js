import { api } from '../api.js';
import { $, actions, confirmTap, esc, toast } from '../ui.js';

export function mount(root, ctx) {
  let friends = [], rows = [];

  function card(r, mine) {
    const who = mine ? r.to_user : r.from_user, st = r.status === 'kept' ? 'Kept' : r.status === 'broken' ? 'Missed' : 'Open';
    return `<div class="p ${r.status === 'broken' ? 'late' : ''}" style="${r.status === 'kept' ? 'border-left-color:var(--good)' : ''}">
      <div class="t">${esc(r.text)}</div><div class="meta">${mine ? 'To' : 'From'} ${esc(who.name)}${r.due ? ' \u00b7 due ' + esc(r.due) : ''} \u00b7 ${st}</div><div class="act">
      ${!mine && r.status === 'open' ? `<button class="keep" data-act="kept" data-id="${r.id}">They kept it</button><button data-act="broken" data-id="${r.id}">They missed it</button>` : ''}
      ${mine ? `<button class="del" data-act="del" data-id="${r.id}">Delete</button>` : ''}</div></div>`;
  }

  function draw() {
    if (!friends.length) { root.innerHTML = '<div class="empty">Add a friend to make a promise to them that they can confirm.</div>'; return; }
    const toMe = rows.filter(r => r.to_user.id === ctx.user.id), fromMe = rows.filter(r => r.from_user.id === ctx.user.id);
    root.innerHTML = `<div class="person"><label for="sf" style="margin-top:0">Promise something to a friend</label>
      <select id="sf">${friends.map(f => `<option value="${f.friendship_id}">${esc(f.user.name)} (@${esc(f.user.username)})</option>`).join('')}</select>
      <label for="st">The promise</label><input id="st" maxlength="120" placeholder="Send you the recipe">
      <label for="sd">Due date (optional)</label><input id="sd" type="date">
      <button class="wide go" data-act="make">Make promise</button></div>
      <div class="group">Promised to you</div>${toMe.length ? toMe.map(r => card(r, false)).join('') : '<div class="empty">Nothing yet.</div>'}
      <div class="group">You promised</div>${fromMe.length ? fromMe.map(r => card(r, true)).join('') : '<div class="empty">Nothing yet.</div>'}`;
  }

  async function load() { rows = await api('/shared'); draw(); }

  actions(root, async (act, b) => {
    if (act === 'make') {
      const text = $('#st', root).value.trim();
      if (!text) return toast('Write the promise first.');
      await api('/shared', { method: 'POST', body: { friendship_id: +$('#sf', root).value, text, due: $('#sd', root).value || null } });
      return load();
    }
    if (act === 'kept' || act === 'broken') { await api(`/shared/${b.dataset.id}/close`, { method: 'POST', body: { status: act } }); return load(); }
    if (act === 'del') {
      if (!confirmTap(b, 'Tap again to delete')) return;
      await api(`/shared/${b.dataset.id}`, { method: 'DELETE' });
      return load();
    }
  });

  Promise.all([api('/friends'), api('/shared')]).then(([f, r]) => { friends = f; rows = r; draw(); }).catch(e => toast(e.message));
}

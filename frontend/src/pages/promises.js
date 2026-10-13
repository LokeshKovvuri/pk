import { api } from '../api.js';
import { $, actions, attr, confirmTap, copyText, daysUntil, dueText, esc, plusDays, toast } from '../ui.js';

export function mount(root, ctx) {
  let sub = 'owe', items = [], q = '', editId = null, timer;

  root.innerHTML = `
    <div class="seg"><button data-s="owe" class="on">I owe</button><button data-s="owed">They owe</button><button data-s="history">History</button></div>
    <div id="pl"></div>
    <button class="fab" data-act="new">+ New promise</button>
    <dialog id="dlg">
      <h2 id="dt">New promise</h2>
      <label for="f-dir">Who made it?</label>
      <select id="f-dir"><option value="mine">I promised someone</option><option value="theirs">Someone promised me</option></select>
      <label for="f-text">The promise</label><input id="f-text" maxlength="120" placeholder="Send the photos from the trip">
      <label for="f-person">Person</label><input id="f-person" list="people" maxlength="40" placeholder="Sam" autocomplete="off"><datalist id="people"></datalist>
      <label for="f-note">Note (optional)</label><input id="f-note" maxlength="140">
      <label for="f-due">Due date (optional)</label><input id="f-due" type="date">
      <div class="chips"><button type="button" data-d="0">Today</button><button type="button" data-d="1">Tomorrow</button><button type="button" data-d="7">Next week</button></div>
      <label for="f-rep">Repeat</label>
      <select id="f-rep"><option value="">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select>
      <p class="err" id="err" role="alert"></p>
      <div class="row"><button type="button" data-act="cancel">Cancel</button><button class="go" type="button" data-act="save">Save promise</button></div>
    </dialog>`;

  const dlg = $('#dlg', root), list = $('#pl', root);
  const byId = id => items.find(p => p.id === +id);

  async function load() {
    const status = sub === 'history' ? 'closed' : 'open';
    items = await api(`/promises?status=${status}${q ? '&q=' + encodeURIComponent(q) : ''}`);
    draw();
  }

  function card(p) {
    const mine = p.direction === 'mine', late = p.due && daysUntil(p.due) < 0;
    return `<div class="p ${mine ? '' : 'theirs'} ${late ? 'late' : ''}"><div class="t">${esc(p.text)}</div>
      ${p.note ? `<div class="meta">${esc(p.note)}</div>` : ''}
      <div class="meta">${mine ? 'To' : 'From'} ${esc(p.person)} \u00b7 ${dueText(p.due)}${p.repeat ? ' \u00b7 repeats ' + p.repeat : ''}</div>
      <div class="act"><button class="keep" data-act="kept" data-id="${p.id}">${mine ? 'I kept it' : 'They kept it'}</button>
      <button data-act="broken" data-id="${p.id}">${mine ? 'I missed it' : 'They missed it'}</button>
      <button data-act="edit" data-id="${p.id}">Edit</button><button data-act="msg" data-id="${p.id}">Message</button>
      <button class="del" data-act="del" data-id="${p.id}">Delete</button></div></div>`;
  }

  function historyCard(p) {
    return `<div class="p" style="border-left-color:var(--${p.status === 'kept' ? 'good' : 'bad'})"><div class="t">${esc(p.text)}</div>
      <div class="meta">${p.direction === 'mine' ? 'To' : 'From'} ${esc(p.person)} \u00b7 ${p.status === 'kept' ? 'Kept' : 'Missed'}${p.late ? ' (late)' : ''} \u00b7 ${new Date(p.closed_at).toLocaleDateString()}</div>
      <div class="act"><button data-act="reopen" data-id="${p.id}">Reopen</button><button class="del" data-act="del" data-id="${p.id}">Delete</button></div></div>`;
  }

  function draw() {
    if (sub === 'history') {
      const has = $('#hq', root);
      if (!has) list.innerHTML = '<input id="hq" type="search" placeholder="Search promises or people" aria-label="Search" style="margin-bottom:12px"><div id="hl"></div>';
      $('#hl', root).innerHTML = items.length ? items.map(historyCard).join('') : `<div class="empty">${q ? 'No matches.' : 'Closed promises will appear here.'}</div>`;
      return;
    }
    const dir = sub === 'owe' ? 'mine' : 'theirs', open = items.filter(p => p.direction === dir);
    if (!open.length) {
      list.innerHTML = `<div class="empty">${dir === 'mine' ? 'You owe nobody anything. Add a promise the moment you make one, while you still remember it.' : 'Nobody owes you anything right now. Log what others promise you so it does not get forgotten.'}</div>`;
      return;
    }
    const g = { Overdue: [], 'This week': [], Later: [], 'No date': [] };
    open.forEach(p => { if (!p.due) g['No date'].push(p); else { const n = daysUntil(p.due); (n < 0 ? g.Overdue : n <= 7 ? g['This week'] : g.Later).push(p); } });
    list.innerHTML = Object.entries(g).filter(([, v]) => v.length).map(([k, v]) => `<div class="group">${k}</div>${v.map(card).join('')}`).join('');
  }

  function openForm(p) {
    editId = p ? p.id : null;
    $('#dt', root).textContent = p ? 'Edit promise' : 'New promise';
    $('#f-dir', root).value = p ? p.direction : (sub === 'owed' ? 'theirs' : 'mine');
    $('#f-text', root).value = p ? p.text : '';
    $('#f-person', root).value = p ? p.person : '';
    $('#f-note', root).value = p ? p.note : '';
    $('#f-due', root).value = p && p.due ? p.due : '';
    $('#f-rep', root).value = p ? p.repeat : '';
    $('#err', root).textContent = '';
    $('#people', root).innerHTML = [...new Set(items.map(i => i.person))].map(n => `<option value="${attr(n)}">`).join('');
    dlg.showModal();
    $('#f-text', root).focus();
  }

  async function save() {
    const body = { direction: $('#f-dir', root).value, text: $('#f-text', root).value.trim(), person: $('#f-person', root).value.trim(),
      note: $('#f-note', root).value.trim(), due: $('#f-due', root).value || null, repeat: $('#f-rep', root).value };
    if (!body.text || !body.person) { $('#err', root).textContent = 'Add both the promise and the person.'; return; }
    try {
      await api(editId ? `/promises/${editId}` : '/promises', { method: editId ? 'PATCH' : 'POST', body });
    } catch (e) { $('#err', root).textContent = e.message; return; }
    dlg.close();
    if (!editId) sub = body.direction === 'mine' ? 'owe' : 'owed';
    setSeg();
    await load();
    ctx.refreshHeader();
  }

  const setSeg = () => root.querySelectorAll('.seg button[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === sub));

  root.querySelector('.seg').addEventListener('click', e => {
    const b = e.target.closest('button[data-s]'); if (!b) return;
    sub = b.dataset.s; q = ''; setSeg(); list.innerHTML = ''; load().catch(err => toast(err.message));
  });
  root.addEventListener('input', e => {
    if (e.target.id !== 'hq') return;
    q = e.target.value; clearTimeout(timer); timer = setTimeout(() => load().catch(() => {}), 250);
  });
  $('.chips', root).addEventListener('click', e => { const b = e.target.closest('button'); if (b) $('#f-due', root).value = plusDays(+b.dataset.d); });

  actions(root, async (act, b) => {
    const id = b.dataset.id;
    if (act === 'new') return openForm(null);
    if (act === 'cancel') return dlg.close();
    if (act === 'save') return save();
    if (act === 'edit') return openForm(byId(id));
    if (act === 'msg') {
      const p = byId(id), late = p.due && daysUntil(p.due) < 0;
      const text = p.direction === 'theirs' ? `Hi ${p.person}, a friendly reminder about: ${p.text}. No rush if plans changed, just let me know!`
        : `Hi ${p.person}, I haven't forgotten: ${p.text}. ${late ? 'Sorry it is late. ' : ''}I'll get it done soon.`;
      b.textContent = (await copyText(text)) ? 'Copied' : 'Copy failed';
      return setTimeout(() => { b.textContent = 'Message'; }, 2000);
    }
    if (act === 'del') {
      if (!confirmTap(b, 'Tap again to delete')) return;
      await api(`/promises/${id}`, { method: 'DELETE' });
    } else if (act === 'reopen') {
      await api(`/promises/${id}/reopen`, { method: 'POST' });
    } else if (act === 'kept' || act === 'broken') {
      await api(`/promises/${id}/close`, { method: 'POST', body: { status: act } });
    } else return;
    await load();
    ctx.refreshHeader();
  });

  load().catch(err => toast(err.message));
}

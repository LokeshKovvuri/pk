import { api } from '../api.js';
import { $, actions, attr, avatar, confirmTap, copyText, daysUntil, duePill, esc, isoDate, plusDays, toast } from '../ui.js';

export function mount(root, ctx) {
  let sub = 'owe', items = [], openAll = [], closedAll = [], q = '', editId = null, timer, selDay = isoDate();
  const known = {};

  root.innerHTML = `
    <div class="seg"><button data-s="owe" class="on">I owe</button><button data-s="owed">They owe</button><button data-s="week">Week</button><button data-s="history">History</button></div>
    <div id="pl"></div>
    <button class="fab" data-act="new">+ New promise</button>
    <dialog id="dlg">
      <div class="handle"></div>
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
  const remember = rows => rows.forEach(p => { known[p.id] = p; });

  async function load() {
    if (sub === 'history') {
      items = await api(`/promises?status=closed${q ? '&q=' + encodeURIComponent(q) : ''}`);
      remember(items);
    } else if (sub === 'week') {
      [openAll, closedAll] = await Promise.all([api('/promises?status=open'), api('/promises?status=closed')]);
      remember(openAll);
    } else {
      items = await api('/promises?status=open');
      remember(items);
    }
    draw();
  }

  function card(p) {
    const mine = p.direction === 'mine', late = p.due && daysUntil(p.due) < 0, id = ` data-id="${p.id}"`;
    return `<div class="p ${late ? 'late' : ''}"><div class="b" style="align-items:center;gap:12px">${avatar(p.person)}
      <div class="grow"><div class="t">${esc(p.text)}</div><div class="meta">${mine ? 'To' : 'From'} ${esc(p.person)}${p.note ? ' \u00b7 ' + esc(p.note) : ''}${p.repeat ? ' \u00b7 repeats ' + p.repeat : ''}</div></div>${duePill(p.due)}</div>
      <div class="act"><button class="keep" data-act="kept"${id}>${mine ? 'I kept it' : 'They kept it'}</button>
      <button data-act="broken"${id}>${mine ? 'I missed it' : 'They missed it'}</button>
      <button data-act="msg"${id}>Message</button><button data-act="edit"${id}>Edit</button>
      <button class="del" data-act="del"${id}>Delete</button></div></div>`;
  }

  function historyCard(p) {
    const kept = p.status === 'kept';
    return `<div class="p"><div class="b" style="align-items:center;gap:12px">${avatar(p.person)}
      <div class="grow"><div class="t">${esc(p.text)}</div><div class="meta">${p.direction === 'mine' ? 'To' : 'From'} ${esc(p.person)} \u00b7 ${new Date(p.closed_at).toLocaleDateString()}</div></div>
      <span class="pill ${kept ? 'mint' : 'red'}">${kept ? 'Kept' : 'Missed'}${p.late ? ' (late)' : ''}</span></div>
      <div class="act"><button data-act="reopen" data-id="${p.id}">Reopen</button><button class="del" data-act="del" data-id="${p.id}">Delete</button></div></div>`;
  }

  function drawWeek() {
    const t = new Date(), mon = new Date(t);
    mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const days = [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return isoDate(d); });
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const inWeek = iso => iso >= days[0] && iso <= days[6];
    const doneN = closedAll.filter(p => p.closed_at && inWeek(isoDate(new Date(p.closed_at)))).length;
    const dueN = openAll.filter(p => p.due && inWeek(p.due)).length;
    const total = doneN + dueN, pct = total ? Math.round(doneN / total * 100) : 0, today = isoDate();
    const day = openAll.filter(p => p.due === selDay || (selDay === today && p.due && p.due < today));
    const label = selDay === today ? 'Today' : new Date(selDay + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    list.innerHTML = `<div class="p strip">${days.map((iso, i) => `<button class="day ${iso === selDay ? 'on' : ''}" data-act="day" data-d="${iso}"><small>${names[i]}</small><b>${+iso.slice(8)}</b><i class="${openAll.some(p => p.due === iso) ? 'dot' : ''}"></i></button>`).join('')}</div>
      <div class="p"><div class="rl" style="margin:0"><b>Week progress</b><span>${doneN} of ${total} done</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="group">${esc(label)}</div>${day.length ? day.map(card).join('') : '<div class="empty">Nothing due. Enjoy the day.</div>'}`;
  }

  function draw() {
    if (sub === 'week') return drawWeek();
    if (sub === 'history') {
      if (!$('#hq', root)) list.innerHTML = '<input id="hq" type="search" placeholder="Search promises or people" aria-label="Search" style="margin-bottom:12px"><div id="hl"></div>';
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
    const chip = (n, l, k) => `<div class="sumc ${k}"><b>${n}</b><span>${l}</span></div>`;
    const today = open.filter(p => p.due && daysUntil(p.due) === 0).length;
    list.innerHTML = `<div class="sum">${chip(g.Overdue.length, 'Overdue', 'red')}${chip(today, 'Today', 'amber')}${chip(g['This week'].length, 'This week', 'mint')}</div>` +
      Object.entries(g).filter(([, v]) => v.length).map(([k, v]) => `<div class="group">${k}</div>${v.map(card).join('')}`).join('');
  }

  function openForm(p) {
    editId = p ? p.id : null;
    $('#dt', root).textContent = p ? 'Edit promise' : 'New promise';
    $('#f-dir', root).value = p ? p.direction : (sub === 'owed' ? 'theirs' : 'mine');
    $('#f-text', root).value = p ? p.text : '';
    $('#f-person', root).value = p ? p.person : '';
    $('#f-note', root).value = p ? p.note : '';
    $('#f-due', root).value = p && p.due ? p.due : (!p && sub === 'week' ? selDay : '');
    $('#f-rep', root).value = p ? p.repeat : '';
    $('#err', root).textContent = '';
    $('#people', root).innerHTML = [...new Set(Object.values(known).map(i => i.person))].map(n => `<option value="${attr(n)}">`).join('');
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
    if (!editId && sub !== 'week') sub = body.direction === 'mine' ? 'owe' : 'owed';
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
    if (act === 'day') { selDay = b.dataset.d; return drawWeek(); }
    if (act === 'edit') return openForm(known[id]);
    if (act === 'msg') {
      const p = known[id], late = p.due && daysUntil(p.due) < 0;
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

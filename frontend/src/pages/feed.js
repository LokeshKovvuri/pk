import { api } from '../api.js';
import { $, actions, ago, avatar, confirmTap, esc, toast } from '../ui.js';

const BGS = ['teal', 'violet', 'amber', 'coral', 'blue', 'dark'];
const STORY_MS = 5000;

export function mount(root, ctx) {
  let data = { stories: [], posts: [] }, kind = 'post', bg = 'teal', timer, viewer = null, order = [];

  const unseen = g => (g.items.some(s => !s.viewed) ? 1 : 0);
  function groups() {
    const m = new Map();
    data.stories.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(s => {
      if (!m.has(s.author.id)) m.set(s.author.id, { author: s.author, items: [] });
      m.get(s.author.id).items.push(s);
    });
    return [...m.values()].sort((a, b) => (b.author.id === ctx.user.id) - (a.author.id === ctx.user.id) || unseen(b) - unseen(a));
  }

  const postCard = p => `<div class="p"><div class="b" style="align-items:center;gap:10px">${avatar(p.author.name, 36)}
    <div class="grow"><div class="t">${esc(p.author.name)}</div><div class="meta" style="margin:0">@${esc(p.author.username)}${p.author.status ? ' \u00b7 ' + esc(p.author.status) : ''} \u00b7 ${ago(p.created_at)}</div></div></div>
    <div style="margin:10px 0;overflow-wrap:anywhere">${esc(p.text)}</div>
    <div class="act"><button data-act="like" data-id="${p.id}">${p.liked ? '\u2665' : '\u2661'} ${p.likes}</button>
    ${p.mine ? `<button class="del" data-act="del" data-id="${p.id}">Delete</button>` : `<button class="del" data-act="report" data-id="${p.id}">Report</button>`}</div></div>`;

  function draw() {
    const gs = groups(), isStory = kind === 'story';
    $('#fl', root).innerHTML = `<div class="stories">
      <button class="sb" data-act="addstory" aria-label="Add a story"><div class="addb">+</div><span>Add story</span></button>
      ${gs.map(g => `<button class="sb" data-act="open" data-g="${g.author.id}"><div class="ringw ${unseen(g) ? 'new' : ''}">${avatar(g.author.name, 52)}</div><span>${g.author.id === ctx.user.id ? 'Your story' : esc(g.author.name.split(' ')[0])}</span></button>`).join('')}</div>
      <div class="group">Friends</div>${data.posts.length ? data.posts.map(postCard).join('') : '<div class="empty">No posts yet. Add friends to see their updates.</div>'}`;
    $('#bgrow', root).hidden = !isStory;
    root.querySelectorAll('#bgrow button').forEach(b => b.classList.toggle('on', b.dataset.b === bg));
    $('#pk', root).value = kind;
  }

  async function load() { data = await api('/feed'); draw(); }

  /* ---- story viewer ---- */
  const ov = () => $('#sv', root);
  function closeViewer() { clearTimeout(timer); const o = ov(); if (o) o.remove(); viewer = null; }
  function next() {
    const g = viewer.g;
    if (viewer.i < g.items.length - 1) { viewer.i++; return renderStory(); }
    const gs = order, at = gs.findIndex(x => x.author.id === g.author.id);
    if (at < gs.length - 1) { viewer = { g: gs[at + 1], i: 0 }; return renderStory(); }
    closeViewer(); load().catch(() => {});
  }
  function prev() { if (viewer.i > 0) { viewer.i--; renderStory(); } else renderStory(); }
  function renderStory() {
    clearTimeout(timer);
    const { g, i } = viewer, s = g.items[i];
    let o = ov();
    if (!o) { o = document.createElement('div'); o.id = 'sv'; root.appendChild(o); }
    o.className = `sv bg-${s.bg || 'teal'}`;
    o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', `Story by ${g.author.name}`);
    o.innerHTML = `<div class="svp">${g.items.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'now' : ''}"></i>`).join('')}</div>
      <div class="svh">${avatar(g.author.name, 36)}<div class="grow"><b>${esc(g.author.name)}</b><div>${ago(s.created_at)}</div></div><button class="svx" data-act="closestory" aria-label="Close story">\u00d7</button></div>
      <div class="svt">${esc(s.text)}</div>
      <button class="svn prev" data-act="sprev" aria-label="Previous story"></button><button class="svn next" data-act="snext" aria-label="Next story"></button>
      ${s.mine ? `<button class="svs" data-act="viewers" data-id="${s.id}">Seen by ${s.views}</button>` : ''}`;
    if (!s.mine && !s.viewed) { s.viewed = true; api(`/posts/${s.id}/view`, { method: 'POST' }).catch(() => {}); }
    timer = setTimeout(next, STORY_MS);
  }

  root.innerHTML = `<div class="p"><label for="pt" style="margin-top:0">Share something</label>
    <textarea id="pt" maxlength="500" placeholder="Kept my promise to Sam today!"></textarea>
    <select id="pk" style="margin-top:8px"><option value="post">Post to feed</option><option value="story">Story (disappears in 24 hours)</option></select>
    <div class="bgc" id="bgrow" hidden role="group" aria-label="Story background">${BGS.map(b => `<button type="button" class="bg-${b}" data-act="bg" data-b="${b}" aria-label="${b} background"></button>`).join('')}</div>
    <button class="wide" data-act="score">Fill in my reliability score</button>
    <button class="wide go" data-act="share">Share</button></div>
    <div id="fl"></div><button class="wide" data-act="refresh">Refresh</button>`;

  root.addEventListener('change', e => { if (e.target.id === 'pk') { kind = e.target.value; draw(); } });
  document.addEventListener('keydown', onKey);
  function onKey(e) { if (!viewer) return; if (e.key === 'Escape') closeViewer(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); }

  actions(root, async (act, b) => {
    if (act === 'refresh') return load();
    if (act === 'bg') { bg = b.dataset.b; return draw(); }
    if (act === 'addstory') { kind = 'story'; draw(); $('#pt', root).focus(); return; }
    if (act === 'open') {
      order = groups(); const g = order.find(x => x.author.id === +b.dataset.g); if (!g) return;
      const first = g.items.findIndex(s => !s.viewed);
      viewer = { g, i: first < 0 ? 0 : first }; return renderStory();
    }
    if (act === 'closestory') { closeViewer(); return load(); }
    if (act === 'snext') return next();
    if (act === 'sprev') return prev();
    if (act === 'viewers') {
      clearTimeout(timer);
      const people = await api(`/posts/${b.dataset.id}/viewers`);
      const old = $('.svl', root); if (old) old.remove();
      b.insertAdjacentHTML('afterend', `<div class="svl">${people.length ? people.map(u => `<div class="b" style="align-items:center;gap:10px;margin:6px 0">${avatar(u.name, 32)}<div><b>${esc(u.name)}</b> <span class="meta">@${esc(u.username)}</span></div></div>`).join('') : '<div class="meta">No one has seen this yet.</div>'}</div>`);
      return;
    }
    if (act === 'score') {
      const s = await api('/stats');
      if (!s.closed) return toast('Close a few promises first.');
      $('#pt', root).value = `I have kept ${s.kept} of ${s.closed} promises (${s.kept_pct}%). Current streak: ${s.streak}.`;
      return;
    }
    if (act === 'share') {
      const text = $('#pt', root).value.trim();
      if (!text) return toast('Write something first.');
      await api('/posts', { method: 'POST', body: { kind, text, bg: kind === 'story' ? bg : '' } });
      $('#pt', root).value = '';
      toast(kind === 'story' ? 'Story added' : 'Posted');
      return load();
    }
    if (act === 'like') { await api(`/posts/${b.dataset.id}/like`, { method: 'POST' }); return load(); }
    if (act === 'report') { await api('/reports', { method: 'POST', body: { kind: 'post', target_id: +b.dataset.id } }); b.textContent = 'Reported'; return; }
    if (act === 'del') {
      if (!confirmTap(b, 'Tap again to delete')) return;
      await api(`/posts/${b.dataset.id}`, { method: 'DELETE' });
      return load();
    }
  });

  load().catch(e => toast(e.message));
  return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); };
}

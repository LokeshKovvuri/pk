import { api } from '../api.js';
import { $, actions, ago, avatar, confirmTap, esc, toast } from '../ui.js';

export function mount(root, ctx) {
  let data = { stories: [], posts: [] };

  const card = (p, story) => `<div class="p"><div class="b" style="align-items:center;gap:10px">${avatar(p.author.name, 36)}<div class="grow"><div class="t">${esc(p.author.name)}</div><div class="meta" style="margin:0">@${esc(p.author.username)} \u00b7 ${ago(p.created_at)}</div></div></div><div style="margin:10px 0">${esc(p.text)}</div>
    <div class="meta">${''}${story ? ` \u00b7 ends in ${Math.max(1, Math.round((new Date(p.expires_at) - Date.now()) / 36e5))}h` : ''}</div>
    <div class="act"><button data-act="like" data-id="${p.id}">${p.liked ? '\u2665' : '\u2661'} ${p.likes}</button>
    ${p.mine ? `<button class="del" data-act="del" data-id="${p.id}">Delete</button>` : `<button class="del" data-act="report" data-id="${p.id}">Report</button>`}</div></div>`;

  function draw() {
    $('#fl', root).innerHTML =
      (data.stories.length ? `<div class="group">Stories</div>${data.stories.map(p => card(p, true)).join('')}` : '') +
      `<div class="group">Feed</div>` +
      (data.posts.length ? data.posts.map(p => card(p)).join('') : '<div class="empty">No posts yet. Add friends to see their updates.</div>');
  }

  async function load() { data = await api('/feed'); draw(); }

  root.innerHTML = `<div class="person"><label for="pt" style="margin-top:0">Share something</label>
    <textarea id="pt" maxlength="500" style="font-size:16px" placeholder="Kept my promise to Sam today!"></textarea>
    <select id="pk" style="margin-top:8px"><option value="post">Post to feed</option><option value="story">Story (disappears in 24 hours)</option></select>
    <button class="wide" data-act="score">Fill in my reliability score</button>
    <button class="wide go" data-act="share">Share</button></div>
    <div id="fl"></div><button class="wide" data-act="refresh">Refresh</button>`;

  actions(root, async (act, b) => {
    if (act === 'refresh') return load();
    if (act === 'score') {
      const s = await api('/stats');
      if (!s.closed) return toast('Close a few promises first.');
      $('#pt', root).value = `I have kept ${s.kept} of ${s.closed} promises (${s.kept_pct}%). Current streak: ${s.streak}.`;
      return;
    }
    if (act === 'share') {
      const text = $('#pt', root).value.trim();
      if (!text) return toast('Write something first.');
      await api('/posts', { method: 'POST', body: { kind: $('#pk', root).value, text } });
      $('#pt', root).value = '';
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
}

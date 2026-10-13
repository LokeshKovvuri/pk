import { api } from '../api.js';
import { $, actions, esc, toast } from '../ui.js';

export function mount(root, ctx) {
  let friends = [], open = null, msgs = [];
  const offs = [];

  function paint() {
    const box = $('#msgs', root);
    if (!box) return;
    box.innerHTML = msgs.length ? msgs.map(m => `<div class="bub ${m.sender_id === ctx.user.id ? 'me' : ''}">${esc(m.text)}</div>`).join('') : '<div class="meta">Say hello.</div>';
    box.scrollTop = box.scrollHeight;
  }

  async function loadThread() {
    const last = msgs.length ? msgs[msgs.length - 1].id : 0;
    const fresh = await api(`/chats/${open.friendship_id}/messages?after=${last}`);
    msgs = msgs.concat(fresh.filter(m => !msgs.some(x => x.id === m.id)));
    paint();
  }

  function list() {
    open = null; msgs = [];
    root.innerHTML = friends.length
      ? friends.map(f => `<div class="p"><div class="t">${esc(f.user.name)}</div><div class="meta">@${esc(f.user.username)}${f.user.status ? ' \u00b7 ' + esc(f.user.status) : ''}</div>
        <div class="act"><button class="keep" data-act="open" data-id="${f.friendship_id}">Chat</button></div></div>`).join('')
      : '<div class="empty">Add a friend first, then you can chat.</div>';
  }

  function thread(f) {
    open = f; msgs = [];
    root.innerHTML = `<button class="wide" data-act="back" style="margin:0 0 10px">Back</button>
      <div class="group" style="margin-top:0">${esc(f.user.name)} @${esc(f.user.username)}</div>
      <div id="msgs" class="person"></div>
      <div class="row"><input id="ci" maxlength="1000" placeholder="Message" autocomplete="off" style="flex:3"><button class="go" data-act="send" style="flex:1">Send</button></div>`;
    paint();
    loadThread().catch(e => toast(e.message));
  }

  offs.push(ctx.bus.on('message', ({ message }) => {
    if (open && message.friendship_id === open.friendship_id && !msgs.some(m => m.id === message.id)) { msgs.push(message); paint(); }
    else if (message.sender_id !== ctx.user.id && !open) toast('New message');
  }));
  offs.push(ctx.bus.on('socket-open', () => { if (open) loadThread().catch(() => {}); }));

  root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'ci') { e.preventDefault(); root.querySelector('[data-act="send"]').click(); } });
  actions(root, async (act, b) => {
    if (act === 'open') return thread(friends.find(f => f.friendship_id === +b.dataset.id));
    if (act === 'back') return list();
    if (act === 'send') {
      const input = $('#ci', root), text = input.value.trim();
      if (!text) return;
      input.value = '';
      const m = await api(`/chats/${open.friendship_id}/messages`, { method: 'POST', body: { text } });
      if (!msgs.some(x => x.id === m.id)) { msgs.push(m); paint(); }
    }
  });

  api('/friends').then(f => { friends = f; list(); }).catch(e => toast(e.message));
  return () => offs.forEach(off => off());
}

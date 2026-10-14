import * as chats from './chats.js';
import * as shared from './shared.js';
import * as friends from './friends.js';

const SUBS = { chats, shared, friends };
let sub = 'chats'; // remembered while the app is open

export function mount(root, ctx) {
  root.innerHTML = `<div class="seg"><button data-s="chats">Chats</button><button data-s="shared">Shared</button><button data-s="friends">Friends</button></div><div id="hubbody"></div>`;
  let cleanup;
  function show(s) {
    cleanup && cleanup();
    sub = s;
    root.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
    const body = document.createElement('div');   // fresh element: no stale listeners from the previous sub-page
    body.id = 'hubbody';
    root.querySelector('#hubbody').replaceWith(body);
    cleanup = SUBS[s].mount(body, ctx);
  }
  root.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.s); });
  show(sub);
  return () => cleanup && cleanup();
}

import { api } from '../api.js';
import { esc, toast } from '../ui.js';

const bar = (label, kept, total) => total
  ? `<div class="rl"><span>${esc(label)}</span><b>${Math.round(kept / total * 100)}% \u00b7 ${kept} of ${total} kept</b></div><div class="bar"><i style="width:${kept / total * 100}%"></i></div>`
  : `<div class="rl"><span>${esc(label)}</span><b>No closed promises yet</b></div>`;

export function mount(root) {
  root.innerHTML = '<div class="empty">Loading...</div>';
  api('/stats').then(s => {
    if (!s.closed && s.others_pct == null) {
      root.innerHTML = '<div class="empty">Close a few promises as kept or missed and your insights will show up here.</div>';
      return;
    }
    const pct = v => (v == null ? '\u2013' : v + '%');
    const tile = (v, l) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`;
    const months = s.months.map(m => {
      const [y, mo] = m.month.split('-').map(Number), n = m.kept + m.missed;
      return `<div class="rl"><span>${new Date(y, mo - 1).toLocaleString(undefined, { month: 'short' })}</span><b>${n ? `${m.kept} kept \u00b7 ${m.missed} missed` : '\u2013'}</b></div><div class="bar"><i style="width:${n ? m.kept / n * 100 : 0}%"></i></div>`;
    }).join('');
    const people = s.people.map(p => `<div class="person"><div class="n">${esc(p.person)}</div>${bar('Yours to them', p.mine_kept, p.mine_total)}${bar('Theirs to you', p.theirs_kept, p.theirs_total)}</div>`).join('');
    root.innerHTML = `<div class="tiles">${tile(pct(s.kept_pct), 'You keep your word')}${tile(pct(s.others_pct), 'Others keep theirs')}${tile(s.streak, 'Current streak')}${tile(s.best_streak, 'Best streak')}${tile(pct(s.on_time_pct), 'Kept on time')}${tile(s.open, 'Still open')}</div>
      <div class="group">Your last 6 months</div><div class="person">${months}</div>
      ${people ? `<div class="group">By person</div>${people}` : ''}`;
  }).catch(e => { root.innerHTML = ''; toast(e.message); });
}

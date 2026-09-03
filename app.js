/* =========================================================================
   Soccer Coacher — vanilla JS, no build step, no backend.
   All state lives in localStorage on this device.
   ========================================================================= */

'use strict';

/* ---------- Field geometry (metres, standard full-size pitch) ---------- */

const F = {
  L: 105,          // goal line to goal line
  W: 68,           // touchline to touchline
  M: 4,            // drawing margin outside the pitch (room for the goals)
  PEN_D: 16.5,     // penalty area depth
  PEN_W: 40.32,    // penalty area width
  GOAL_A_D: 5.5,   // goal area depth
  GOAL_A_W: 18.32, // goal area width
  SPOT: 11,        // penalty spot from goal line
  R: 9.15,         // centre circle / penalty arc radius
  GOAL_W: 7.32,
  GOAL_D: 2,
  CORNER: 1
};
const VB_W = F.L + F.M * 2;   // 113
const VB_H = F.W + F.M * 2;   // 76

/* Field coords <-> percentage of the pitch container. */
const pctX = x => ((x + F.M) / VB_W) * 100;
const pctY = y => ((y + F.M) / VB_H) * 100;
const fldX = p => (p / 100) * VB_W - F.M;
const fldY = p => (p / 100) * VB_H - F.M;

/* ---------- Palette ---------- */

const COLORS = [
  '#1d3557', '#e63946', '#f4a261', '#ffd166',
  '#2a9d8f', '#4361ee', '#7b2cbf', '#ef476f',
  '#06d6a0', '#8d6e63', '#ffffff', '#111111'
];
/* Labels need readable contrast against the dot. */
const LIGHT_FILL = new Set(['#ffd166', '#f4a261', '#ffffff', '#06d6a0']);
const inkFor = c => (LIGHT_FILL.has(c) ? '#10241a' : '#ffffff');

/* ---------- View presets ---------- */

const PRESETS = {
  full: { fx: 0.5, fy: 0.5, z: 1.0 },
  def:  { fx: pctX(F.L * 0.25) / 100, fy: 0.5, z: 1.55 },
  att:  { fx: pctX(F.L * 0.75) / 100, fy: 0.5, z: 1.55 }
};

/* ---------- State ---------- */

const STORE_KEY = 'soccer-coacher/v1';

const defaultState = () => ({
  v: 1,
  players: [],
  ball: null,
  view: { preset: 'full', ...PRESETS.full },
  dur: 1200,
  formations: [],
  active: null
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const d = defaultState();
    return {
      ...d, ...s,
      view: { ...d.view, ...(s.view || {}) },
      players: Array.isArray(s.players) ? s.players : [],
      formations: Array.isArray(s.formations) ? s.formations : []
    };
  } catch (err) {
    console.warn('Could not read saved data, starting fresh.', err);
    return defaultState();
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (err) { console.warn('Could not save.', err); }
  }, 150);
}

const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* Identity used to reconcile a player across saved positions:
   the label if it has one, otherwise the internal id. */
const keyOf = p => (p.label && p.label.trim())
  ? 'L:' + p.label.trim().toUpperCase()
  : 'U:' + p.uid;

/* ---------- DOM ---------- */

const $ = sel => document.querySelector(sel);
const stage   = $('#stage');
const pitch   = $('#pitch');
const layer   = $('#layer');
const bar     = $('#bar');
const drawer  = $('#drawer');
const scrim   = $('#scrim');
const editor  = $('#editor');

/* ---------- Field drawing ---------- */

function fieldSVG() {
  const { L, W, M, PEN_D, PEN_W, GOAL_A_D, GOAL_A_W, SPOT, R, GOAL_W, GOAL_D, CORNER } = F;
  const midY = W / 2;
  const penY = (W - PEN_W) / 2;
  const gaY  = (W - GOAL_A_W) / 2;
  const goalY = (W - GOAL_W) / 2;

  // Where the penalty arc crosses the edge of the penalty area.
  const dx = PEN_D - SPOT;
  const dy = Math.sqrt(R * R - dx * dx);

  const stripes = [];
  const nStripes = 10;
  for (let i = 0; i < nStripes; i++) {
    if (i % 2 === 0) continue;
    stripes.push(`<rect x="${(i * L) / nStripes}" y="0" width="${L / nStripes}" height="${W}" fill="var(--grass-dark)"/>`);
  }

  return `
<svg class="field" viewBox="${-M} ${-M} ${VB_W} ${VB_H}" preserveAspectRatio="none" aria-hidden="true">
  <rect x="${-M}" y="${-M}" width="${VB_W}" height="${VB_H}" fill="var(--grass-deep)"/>
  <rect x="0" y="0" width="${L}" height="${W}" fill="var(--grass)"/>
  <g>${stripes.join('')}</g>

  <g fill="none" stroke="var(--line)" stroke-width="0.35" stroke-linecap="round">
    <!-- boundary + halfway -->
    <rect x="0" y="0" width="${L}" height="${W}"/>
    <line x1="${L / 2}" y1="0" x2="${L / 2}" y2="${W}"/>
    <circle cx="${L / 2}" cy="${midY}" r="${R}"/>

    <!-- left penalty + goal area -->
    <rect x="0" y="${penY}" width="${PEN_D}" height="${PEN_W}"/>
    <rect x="0" y="${gaY}" width="${GOAL_A_D}" height="${GOAL_A_W}"/>
    <path d="M ${PEN_D} ${midY - dy} A ${R} ${R} 0 0 1 ${PEN_D} ${midY + dy}"/>

    <!-- right penalty + goal area -->
    <rect x="${L - PEN_D}" y="${penY}" width="${PEN_D}" height="${PEN_W}"/>
    <rect x="${L - GOAL_A_D}" y="${gaY}" width="${GOAL_A_D}" height="${GOAL_A_W}"/>
    <path d="M ${L - PEN_D} ${midY + dy} A ${R} ${R} 0 0 1 ${L - PEN_D} ${midY - dy}"/>

    <!-- corner arcs -->
    <path d="M 0 ${CORNER} A ${CORNER} ${CORNER} 0 0 0 ${CORNER} 0"/>
    <path d="M ${L - CORNER} 0 A ${CORNER} ${CORNER} 0 0 0 ${L} ${CORNER}"/>
    <path d="M ${CORNER} ${W} A ${CORNER} ${CORNER} 0 0 0 0 ${W - CORNER}"/>
    <path d="M ${L} ${W - CORNER} A ${CORNER} ${CORNER} 0 0 0 ${L - CORNER} ${W}"/>

    <!-- goals -->
    <rect x="${-GOAL_D}" y="${goalY}" width="${GOAL_D}" height="${GOAL_W}" fill="rgba(255,255,255,.14)"/>
    <rect x="${L}" y="${goalY}" width="${GOAL_D}" height="${GOAL_W}" fill="rgba(255,255,255,.14)"/>
  </g>

  <g fill="var(--line)">
    <circle cx="${L / 2}" cy="${midY}" r="0.45"/>
    <circle cx="${SPOT}" cy="${midY}" r="0.45"/>
    <circle cx="${L - SPOT}" cy="${midY}" r="0.45"/>
  </g>
</svg>`;
}

pitch.insertAdjacentHTML('afterbegin', fieldSVG());

/* ---------- Ball artwork ---------- */

function ballSVG() {
  const pent = (cx, cy, r, rot) => {
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = ((-90 + rot + i * 72) * Math.PI) / 180;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return `<polygon points="${pts.join(' ')}"/>`;
  };
  // Seams run out from the centre pentagon's corners. Kept deliberately sparse —
  // the ball is only ~35px across on a tablet, so extra panels turn to mush.
  const seams = [];
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    const c = Math.cos(a), s = Math.sin(a);
    seams.push(`<line x1="${(50 + 17 * c).toFixed(2)}" y1="${(50 + 17 * s).toFixed(2)}" x2="${(50 + 45 * c).toFixed(2)}" y2="${(50 + 45 * s).toFixed(2)}"/>`);
  }
  return `
<svg viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="#fff" stroke="#141414" stroke-width="6"/>
  <g stroke="#141414" stroke-width="7" stroke-linecap="round">${seams.join('')}</g>
  <g fill="#141414">${pent(50, 50, 19, 0)}</g>
</svg>`;
}

/* ---------- Layout: fit the pitch, then pan/zoom ---------- */

function applyView() {
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  const ar = VB_W / VB_H;

  let bw = sw, bh = sw / ar;
  if (bh > sh) { bh = sh; bw = sh * ar; }

  const bx = (sw - bw) / 2;
  const by = (sh - bh) / 2;

  pitch.style.width  = bw + 'px';
  pitch.style.height = bh + 'px';
  pitch.style.left   = bx + 'px';
  pitch.style.top    = by + 'px';
  pitch.style.fontSize = bw / 40 + 'px';   // tokens & labels scale with the pitch

  const { fx, fy, z } = state.view;

  // Put the focus point at the centre of the stage, but never reveal
  // empty space beside the field when the field is big enough to cover it.
  const axis = (base, offset, stageSize, focus) => {
    const size = base * z;
    if (size <= stageSize) return (stageSize - size) / 2 - offset;
    const want = base * (0.5 - z * focus);
    const min = stageSize - offset - size;
    const max = -offset;
    return Math.min(max, Math.max(min, want));
  };

  const tx = axis(bw, bx, sw, fx);
  const ty = axis(bh, by, sh, fy);

  pitch.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
}

/* ---------- Render ---------- */

const els = new Map();   // uid -> element
let ballEl = null;
let animTimer = null;

function createPlayerEl(p) {
  const el = document.createElement('div');
  el.className = 'player';
  el.dataset.uid = p.uid;
  el.innerHTML = '<span class="lbl"></span>';
  attachDrag(el, p.uid);
  return el;
}

function updatePlayerEl(el, p) {
  el.style.left = pctX(p.x) + '%';
  el.style.top  = pctY(p.y) + '%';
  el.style.setProperty('--c', p.color);
  el.style.setProperty('--t', inkFor(p.color));
  const label = (p.label || '').trim();
  el.dataset.len = Math.min(4, label.length);
  const span = el.querySelector('.lbl');
  if (span.textContent !== label) span.textContent = label;
}

function render({ animate = false } = {}) {
  if (animate) {
    layer.style.setProperty('--dur', state.dur + 'ms');
    layer.classList.add('anim');
    clearTimeout(animTimer);
    animTimer = setTimeout(() => layer.classList.remove('anim'), state.dur + 120);
  }

  const entering = [];
  const seen = new Set();

  for (const p of state.players) {
    seen.add(p.uid);
    let el = els.get(p.uid);
    if (!el) {
      el = createPlayerEl(p);
      if (animate) { el.classList.add('enter'); entering.push(el); }
      layer.appendChild(el);
      els.set(p.uid, el);
    }
    updatePlayerEl(el, p);
  }

  for (const [id, el] of [...els]) {
    if (seen.has(id)) continue;
    els.delete(id);
    exit(el, animate);
  }

  if (state.ball) {
    if (!ballEl) {
      ballEl = document.createElement('div');
      ballEl.className = 'ball';
      ballEl.innerHTML = ballSVG();
      attachDrag(ballEl, '@ball');
      if (animate) { ballEl.classList.add('enter'); entering.push(ballEl); }
      layer.appendChild(ballEl);
    }
    ballEl.style.left = pctX(state.ball.x) + '%';
    ballEl.style.top  = pctY(state.ball.y) + '%';
  } else if (ballEl) {
    exit(ballEl, animate);
    ballEl = null;
  }

  if (entering.length) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      entering.forEach(el => el.classList.remove('enter'));
    }));
  }

  $('#toggle-ball').textContent = state.ball ? 'Remove Ball' : 'Add Ball';
  $('#welcome').hidden = state.players.length > 0 || !!state.ball;
}

function exit(el, animate) {
  if (!animate) { el.remove(); return; }
  el.classList.add('enter');
  setTimeout(() => el.remove(), state.dur + 120);
}

/* ---------- Dragging ---------- */

const TAP_SLOP = 8;   // px of movement still counted as a tap

function attachDrag(el, id) {
  let startX = 0, startY = 0, moved = false, grabDX = 0, grabDY = 0, active = null;

  // Window-level move/up listeners: they keep working whether or not pointer
  // capture was granted, so a finger that outruns the dot never drops the drag.
  function detach() {
    active = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }

  function onMove(ev) {
    if (ev.pointerId !== active) return;
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < TAP_SLOP) return;
    moved = true;
    if (ev.cancelable) ev.preventDefault();
    setPos(id, ev.clientX + grabDX, ev.clientY + grabDY);
  }

  function onUp(ev) {
    if (ev.pointerId !== active) return;
    const wasTap = !moved && ev.type === 'pointerup';
    detach();
    el.classList.remove('grabbed');
    if (moved) {
      setActive(null);
      save();
    } else if (wasTap && id !== '@ball') {
      openEditor(id);
    }
  }

  el.addEventListener('pointerdown', ev => {
    if (ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (active !== null) detach();

    active = ev.pointerId;
    // Nice to have, not required — and it throws on some synthetic/edge pointers.
    try { el.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }

    layer.classList.remove('anim');
    el.classList.add('grabbed');
    moved = false;
    startX = ev.clientX;
    startY = ev.clientY;

    // Keep the token under the finger instead of snapping its centre there.
    const r = el.getBoundingClientRect();
    grabDX = (r.left + r.width / 2) - ev.clientX;
    grabDY = (r.top + r.height / 2) - ev.clientY;

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}

function setPos(id, clientX, clientY) {
  const r = pitch.getBoundingClientRect();
  const px = clamp(((clientX - r.left) / r.width) * 100, 0, 100);
  const py = clamp(((clientY - r.top) / r.height) * 100, 0, 100);
  const x = fldX(px), y = fldY(py);

  if (id === '@ball') {
    if (!state.ball) return;
    state.ball.x = x; state.ball.y = y;
    if (ballEl) { ballEl.style.left = px + '%'; ballEl.style.top = py + '%'; }
    return;
  }
  const p = state.players.find(q => q.uid === id);
  if (!p) return;
  p.x = x; p.y = y;
  const el = els.get(id);
  if (el) { el.style.left = px + '%'; el.style.top = py + '%'; }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- Adding tokens ---------- */

/* Centre of what's currently on screen, in field coords. */
function viewCentre() {
  const r = pitch.getBoundingClientRect();
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const cx = clamp((sw / 2 - r.left) / r.width, 0, 1);
  const cy = clamp((sh / 2 - r.top) / r.height, 0, 1);
  return { x: fldX(cx * 100), y: fldY(cy * 100) };
}

function addPlayer() {
  const c = viewCentre();
  const n = state.players.length;
  // Spread new dots in a small grid so they never land on top of each other.
  const col = n % 4, row = Math.floor(n / 4) % 4;
  const p = {
    uid: uid(),
    label: '',
    color: COLORS[n % COLORS.length],
    x: clamp(c.x + (col - 1.5) * 9, -2, F.L + 2),
    y: clamp(c.y + (row - 1.5) * 9, -2, F.W + 2)
  };
  state.players.push(p);
  setActive(null);
  render();
  save();
}

function toggleBall() {
  if (state.ball) {
    state.ball = null;
  } else {
    const c = viewCentre();
    state.ball = { x: c.x, y: c.y };
  }
  setActive(null);
  render();
  save();
}

/* ---------- Player editor ---------- */

let editing = null;

const colorRow = $('#ed-colors');
COLORS.forEach(c => {
  const b = document.createElement('button');
  b.type = 'button';
  b.style.background = c;
  b.dataset.color = c;
  b.setAttribute('aria-label', 'Colour ' + c);
  b.addEventListener('click', () => {
    const p = state.players.find(q => q.uid === editing);
    if (!p) return;
    p.color = c;
    markSwatch(c);
    const el = els.get(p.uid);
    if (el) updatePlayerEl(el, p);
    setActive(null);
    save();
  });
  colorRow.appendChild(b);
});

const markSwatch = c => colorRow.querySelectorAll('button')
  .forEach(b => b.classList.toggle('on', b.dataset.color === c));

function openEditor(id) {
  const p = state.players.find(q => q.uid === id);
  if (!p) return;
  editing = id;

  els.forEach((el, k) => el.classList.toggle('selected', k === id));

  $('#ed-label').value = p.label || '';
  markSwatch(p.color);
  editor.hidden = false;

  // Anchor near the dot, clamped inside the window.
  const r = els.get(id).getBoundingClientRect();
  const w = editor.offsetWidth, h = editor.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  let top = r.bottom + 14;
  if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 14);
  editor.style.left = clamp(left, 10, window.innerWidth - w - 10) + 'px';
  editor.style.top = clamp(top, 10, window.innerHeight - h - 10) + 'px';
}

function closeEditor() {
  editor.hidden = true;
  editing = null;
  els.forEach(el => el.classList.remove('selected'));
}

$('#ed-label').addEventListener('input', ev => {
  const p = state.players.find(q => q.uid === editing);
  if (!p) return;
  p.label = ev.target.value.replace(/\s+/g, ' ').trimStart();
  const el = els.get(p.uid);
  if (el) updatePlayerEl(el, p);
  setActive(null);
  save();
});
$('#ed-label').addEventListener('keydown', ev => { if (ev.key === 'Enter') closeEditor(); });

$('#ed-done').addEventListener('click', closeEditor);

$('#ed-delete').addEventListener('click', () => {
  const id = editing;
  closeEditor();
  state.players = state.players.filter(q => q.uid !== id);
  setActive(null);
  render();
  save();
});

/* Tapping empty grass dismisses the editor. */
stage.addEventListener('pointerdown', () => { if (!editor.hidden) closeEditor(); });

/* ---------- Saved positions ---------- */

function snapshot() {
  return {
    players: state.players.map(p => ({ uid: p.uid, label: p.label || '', color: p.color, x: p.x, y: p.y })),
    ball: state.ball ? { ...state.ball } : null
  };
}

async function savePositions() {
  if (!state.players.length && !state.ball) {
    await alertModal('Nothing to save', 'Add some players to the field first.');
    return;
  }
  const suggestion = state.formations.length ? '' : 'Default';
  const name = await promptModal('Name this setup', 'e.g. Default, Corner, Attack Right', suggestion);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  const existing = state.formations.find(f => f.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    const ok = await confirmModal('Replace "' + existing.name + '"?', 'A setup with that name already exists.');
    if (!ok) return;
    Object.assign(existing, snapshot());
    setActive(existing.id);
  } else {
    const f = { id: 'f' + Date.now().toString(36), name: trimmed, ...snapshot() };
    state.formations.push(f);
    setActive(f.id);
  }
  renderFormations();
  save();
}

function applyFormation(f) {
  const byKey = new Map();
  state.players.forEach(p => byKey.set(keyOf(p), p));
  const claimed = new Set();

  state.players = f.players.map(t => {
    // Reconcile: same label (or same internal id) means the same kid,
    // so reuse the existing token and let it slide to the new spot.
    const match = byKey.get(keyOf(t));
    let id = match && !claimed.has(match.uid) ? match.uid : t.uid;
    if (claimed.has(id)) id = uid();
    claimed.add(id);
    return { uid: id, label: t.label || '', color: t.color, x: t.x, y: t.y };
  });

  state.ball = f.ball ? { ...f.ball } : null;
  setActive(f.id);
  closeEditor();
  render({ animate: true });
  save();
}

function setActive(id) {
  state.active = id;
  bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.id === id));
}

function renderFormations() {
  bar.textContent = '';
  bar.hidden = state.formations.length === 0;

  state.formations.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = f.id;
    b.textContent = f.name;
    b.classList.toggle('active', f.id === state.active);
    b.addEventListener('click', () => applyFormation(f));
    bar.appendChild(b);
    if (i < 9) b.title = 'Shortcut: press ' + (i + 1);
  });

  const list = $('#formation-list');
  list.textContent = '';
  $('#formation-empty').hidden = state.formations.length > 0;

  state.formations.forEach((f, i) => {
    const li = document.createElement('li');

    const name = document.createElement('span');
    name.className = 'fname';
    name.textContent = f.name;
    const count = document.createElement('span');
    count.className = 'fcount';
    count.textContent = ` · ${f.players.length} player${f.players.length === 1 ? '' : 's'}${f.ball ? ' + ball' : ''}`;
    name.appendChild(count);

    const up = mkBtn('↑', 'Move up', () => { move(i, -1); });
    const down = mkBtn('↓', 'Move down', () => { move(i, 1); });
    const update = mkBtn('Update', 'Overwrite with the current field', async () => {
      const ok = await confirmModal('Update "' + f.name + '"?', 'This replaces the saved setup with what is on the field right now.');
      if (!ok) return;
      Object.assign(f, snapshot());
      setActive(f.id);
      renderFormations();
      save();
    });
    const rename = mkBtn('Rename', 'Rename', async () => {
      const n = await promptModal('Rename setup', '', f.name);
      if (n === null || !n.trim()) return;
      f.name = n.trim();
      renderFormations();
      save();
    });
    const del = mkBtn('✕', 'Delete', async () => {
      const ok = await confirmModal('Delete "' + f.name + '"?', 'The players on the field are not affected.');
      if (!ok) return;
      state.formations = state.formations.filter(x => x.id !== f.id);
      if (state.active === f.id) state.active = null;
      renderFormations();
      save();
    });
    del.classList.add('x');

    li.append(name, up, down, update, rename, del);
    list.appendChild(li);
  });

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.formations.length) return;
    const arr = state.formations;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    renderFormations();
    save();
  }
}

function mkBtn(text, title, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.title = title;
  b.addEventListener('click', fn);
  return b;
}

/* ---------- Settings drawer ---------- */

function openDrawer() {
  closeEditor();
  drawer.hidden = false;
  scrim.hidden = false;
  syncControls();
}
function closeDrawer() {
  drawer.hidden = true;
  scrim.hidden = true;
}

$('#gear').addEventListener('click', () => (drawer.hidden ? openDrawer() : closeDrawer()));
$('#drawer-close').addEventListener('click', closeDrawer);
scrim.addEventListener('click', closeDrawer);

$('#add-player').addEventListener('click', addPlayer);
$('#toggle-ball').addEventListener('click', toggleBall);
$('#save-pos').addEventListener('click', savePositions);

$('#view-preset').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-preset]');
  if (!b) return;
  const key = b.dataset.preset;
  state.view = { preset: key, ...PRESETS[key] };
  applyView();
  syncControls();
  save();
});

$('#zoom').addEventListener('input', ev => {
  state.view.z = parseFloat(ev.target.value);
  $('#zoom-val').textContent = state.view.z.toFixed(2).replace(/0$/, '') + '×';
  applyView();
  save();
});

$('#dur').addEventListener('input', ev => {
  state.dur = parseInt(ev.target.value, 10);
  $('#dur-val').textContent = (state.dur / 1000).toFixed(1) + 's';
  save();
});

$('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (err) { console.warn('Full screen unavailable.', err); }
  setTimeout(syncControls, 200);
});

$('#reset').addEventListener('click', async () => {
  const ok = await confirmModal('Reset everything?', 'Removes all players, the ball and every saved position from this device. This cannot be undone.');
  if (!ok) return;
  state = defaultState();
  localStorage.removeItem(STORE_KEY);
  els.forEach(el => el.remove());
  els.clear();
  if (ballEl) { ballEl.remove(); ballEl = null; }
  renderFormations();
  render();
  applyView();
  syncControls();
  closeDrawer();
});

function syncControls() {
  $('#zoom').value = state.view.z;
  $('#zoom-val').textContent = Number(state.view.z).toFixed(2).replace(/0$/, '') + '×';
  $('#dur').value = state.dur;
  $('#dur-val').textContent = (state.dur / 1000).toFixed(1) + 's';
  $('#view-preset').querySelectorAll('button')
    .forEach(b => b.classList.toggle('on', b.dataset.preset === state.view.preset));
  $('#toggle-ball').textContent = state.ball ? 'Remove Ball' : 'Add Ball';
  $('#fullscreen').textContent = document.fullscreenElement ? 'Exit Full Screen' : 'Enter Full Screen';
}

/* ---------- Modal helpers ---------- */

const modal = $('#modal');
let modalResolve = null;

function showModal({ title, msg, input, defaultValue = '', okText = 'OK', cancel = true }) {
  $('#modal-title').textContent = title;
  const m = $('#modal-msg');
  m.textContent = msg || '';
  m.hidden = !msg;
  const inp = $('#modal-input');
  inp.hidden = !input;
  inp.value = defaultValue;
  inp.placeholder = msg || '';
  $('#modal-ok').textContent = okText;
  $('#modal-cancel').hidden = !cancel;
  modal.hidden = false;
  if (input) setTimeout(() => { inp.focus(); inp.select(); }, 30);
  return new Promise(res => { modalResolve = res; });
}

function finishModal(value) {
  modal.hidden = true;
  const res = modalResolve;
  modalResolve = null;
  if (res) res(value);
}

$('#modal-ok').addEventListener('click', () => {
  const inp = $('#modal-input');
  finishModal(inp.hidden ? true : inp.value);
});
$('#modal-cancel').addEventListener('click', () => finishModal(null));
$('#modal-input').addEventListener('keydown', ev => {
  if (ev.key === 'Enter') $('#modal-ok').click();
  if (ev.key === 'Escape') finishModal(null);
});

const promptModal = (title, msg, defaultValue) =>
  showModal({ title, msg, input: true, defaultValue, okText: 'Save' });
const confirmModal = (title, msg) =>
  showModal({ title, msg, okText: 'Yes' }).then(v => v === true);
const alertModal = (title, msg) =>
  showModal({ title, msg, okText: 'OK', cancel: false });

/* ---------- Keyboard shortcuts (handy on a laptop) ---------- */

document.addEventListener('keydown', ev => {
  if (ev.target.matches('input, textarea')) return;
  if (ev.key >= '1' && ev.key <= '9') {
    const f = state.formations[Number(ev.key) - 1];
    if (f) applyFormation(f);
  }
  if (ev.key === 'Escape') { closeEditor(); closeDrawer(); }
});

/* ---------- Boot ---------- */

window.addEventListener('resize', applyView);
window.addEventListener('orientationchange', () => setTimeout(applyView, 120));
document.addEventListener('fullscreenchange', () => { applyView(); syncControls(); });
document.addEventListener('gesturestart', ev => ev.preventDefault());   // iOS pinch-zoom

renderFormations();
render();
applyView();
syncControls();

(() => {
'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

/* ---------- world layout ---------- */

const LOCATIONS = {
  desk:    { x: 40,  y: 40,  w: 170, h: 130, label: 'Intern Desk',      wallSide: 'top' },
  partner: { x: 510, y: 40,  w: 170, h: 130, label: "Partner's Office", wallSide: 'top' },
  coffee:  { x: 40,  y: 390, w: 170, h: 130, label: 'Coffee Kitchen',   wallSide: 'bottom' },
  meeting: { x: 510, y: 390, w: 170, h: 130, label: 'Meeting Room',     wallSide: 'bottom' },
  printer: { x: 300, y: 215, w: 120, h: 130, label: 'Printer Nook',     wallSide: 'mid' },
};

for (const key in LOCATIONS) {
  const z = LOCATIONS[key];
  if (z.wallSide === 'top') {
    z.furniture = { x: z.x + 18, y: z.y, w: z.w - 36, h: 54 };
  } else if (z.wallSide === 'bottom') {
    z.furniture = { x: z.x + 18, y: z.y + z.h - 54, w: z.w - 36, h: 54 };
  } else {
    z.furniture = { x: z.x + 14, y: z.y + 34, w: z.w - 28, h: 58 };
  }
  z.interact = { x: z.x - 14, y: z.y - 14, w: z.w + 28, h: z.h + 28 };
}

const DECOR_PLANTS = [ { x: 255, y: 60 }, { x: 465, y: 470 } ];

/* ---------- flavor text pools ---------- */

const STARTUPS = ['Uber for Dogs', 'Blockchain Lemonade Stand', 'AI Sock Matcher', 'NFT Plant Waterer',
  'SaaS for Sandwiches', 'Tinder for Houseplants', 'Crypto Birdhouses', 'Subscription Air',
  'Drone-Delivered Donuts', 'Quantum Nap App', 'Artisanal Wifi', 'Influencer for Hire'];
const ASKS = ['$500K for 10% equity', 'a $2M seed round', '$50K from friends & family',
  '$10M Series A (lol)', '$1 and a hug', '$3M at a $90M valuation, trust me'];
const PARTNERS = ['Partner Chad', 'Partner Vanessa', 'Dr. Lee', 'Managing Director Kim', 'Partner Omar'];
const TOPICS = ['Term Sheet Negotiation', 'Due Diligence Sync', 'Founder Check-in', 'All-Hands Standup', 'Board Prep'];
const PRINT_JOBS = ['the term sheet', '50 copies of the deck', 'the NDA packet', 'expense reports', 'the cap table'];
const JARGON = ['Runway', 'Burn Rate', 'Valuation', 'Churn', 'ARR', 'Term Sheet', 'Dilution', 'Vesting', 'Cap Table', 'Convertible Note'];
const ARROW_ICONS = { ArrowUp: '⬆️', ArrowDown: '⬇️', ArrowLeft: '⬅️', ArrowRight: '➡️' };
const ARROW_KEYS = Object.keys(ARROW_ICONS);

const HAIR_COLORS = ['#6b4226', '#2c2330', '#caa05a', '#a13a3a', '#e8a0c4', '#7fb8d6'];
const OUTFIT_COLORS = ['#5b8fd6', '#3a3142', '#c2455a', '#3f9e6b', '#caa05a', '#8a5fc2'];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- game state ---------- */

const state = {
  started: false,
  paused: false,
  clockMin: 9 * 60,
  energy: 100,
  reputation: 60,
  tasksDone: 0,
  energyDrainAcc: 0,
  spawnAcc: 0,
  spawnNext: 4,
  jitterUntil: 0,
  tasks: [],
  minigame: null,
  ended: false,
  firmName: 'Sunbeam Ventures',
};

const DAY_END_MIN = 18 * 60;
const MIN_PER_SEC = (DAY_END_MIN - state.clockMin) / 150;

const player = {
  x: 360, y: 360, speed: 150, facingRight: true, moving: false, carrying: null,
  lookX: 0, lookY: 1, hairColor: HAIR_COLORS[0], bodyColor: OUTFIT_COLORS[0],
};

let uidCounter = 0;
const uid = () => ++uidCounter;

/* ---------- input ---------- */

const keys = new Set();
let spaceWasDown = false;

window.addEventListener('keydown', e => {
  if (document.activeElement && document.activeElement.id === 'firmNameInput') return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) || e.code === 'Space') {
    e.preventDefault();
  }
  keys.add(e.key.toLowerCase());
  if (state.minigame && state.minigame.type === 'sequence') handleSequenceKeyPress(e.key);
  if (e.code === 'Space' && !spaceWasDown) {
    spaceWasDown = true;
    onSpacePress();
  }
});
window.addEventListener('keyup', e => {
  keys.delete(e.key.toLowerCase());
  if (e.code === 'Space') spaceWasDown = false;
});

function onSpacePress() {
  if (!state.started || state.ended) return;
  const mg = state.minigame;
  if (mg) {
    if (mg.type === 'comboCoffee') {
      if (mg.stageType === 'tamp') handleTampPress();
      else if (mg.stageType === 'shot') handleShotPress();
    }
    return;
  }
  tryInteract();
}

/* ---------- toast ---------- */

const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1700);
}

/* ---------- task helpers ---------- */

const TASK_ICON = { pitch: '📊', coffee: '☕', notes: '📝', print: '🖨️' };

function findTask(pred) { return state.tasks.find(pred); }

function spawnTask() {
  if (state.tasks.length >= 4) return;
  const type = pick(['pitch', 'coffee', 'notes', 'print']);
  let task = { id: uid(), type, status: 'pending' };
  if (type === 'pitch') {
    const startup = pick(STARTUPS), ask = pick(ASKS);
    const mrrGrowth = Math.round(5 + Math.random() * 55);
    const burnMultiple = +(0.5 + Math.random() * 3.5).toFixed(1);
    const repeatFounder = Math.random() < 0.5;
    const score = (mrrGrowth / 10) - burnMultiple * 3 + (repeatFounder ? 5 : 0);
    task.meta = { startup, ask, mrrGrowth, burnMultiple, repeatFounder, isGood: score > 4 };
    task.title = `Review pitch: "${startup}"`;
  } else if (type === 'coffee') {
    const partner = pick(PARTNERS);
    task.meta = { partner };
    task.status = 'brewing';
    task.title = `Brew coffee for ${partner}`;
  } else if (type === 'notes') {
    const topic = pick(TOPICS);
    task.meta = { topic };
    task.title = `Take notes: ${topic}`;
  } else if (type === 'print') {
    const job = pick(PRINT_JOBS);
    task.meta = { job };
    task.title = `Print ${job}`;
  }
  state.tasks.push(task);
  renderTaskList();
}

function removeTask(task) {
  state.tasks = state.tasks.filter(t => t.id !== task.id);
  renderTaskList();
}

function renderTaskList() {
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  if (state.tasks.length === 0) {
    list.innerHTML = '<li class="empty">All caught up! 🎉</li>';
    return;
  }
  for (const t of state.tasks) {
    const li = document.createElement('li');
    li.textContent = `${TASK_ICON[t.type]} ${t.title}`;
    if (t.status === 'brewing') li.classList.add('brewing');
    if (t.status === 'delivering') li.classList.add('delivering');
    list.appendChild(li);
  }
}

/* ---------- HUD ---------- */

function formatClock(min) {
  let h = Math.floor(min / 60) % 24;
  const m = Math.floor(min % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function syncHud() {
  document.getElementById('clock').textContent = formatClock(state.clockMin);
  document.getElementById('energyFill').style.width = `${Math.max(0, state.energy)}%`;
  document.getElementById('repFill').style.width = `${Math.max(0, Math.min(100, state.reputation))}%`;
  document.getElementById('tasksDone').textContent = state.tasksDone;
}

/* ---------- interaction ---------- */

function isPlayerNear(rect) {
  return player.x > rect.x && player.x < rect.x + rect.w && player.y > rect.y && player.y < rect.y + rect.h;
}

function nearestLocationKey() {
  for (const key in LOCATIONS) {
    if (isPlayerNear(LOCATIONS[key].interact)) return key;
  }
  return null;
}

function tryInteract() {
  const key = nearestLocationKey();
  if (!key) return;
  if (key === 'desk') {
    const task = findTask(t => t.type === 'pitch' && t.status === 'pending');
    if (!task) { showToast('Nothing to review right now.'); return; }
    startChoiceMinigame(task);
  } else if (key === 'coffee') {
    const brewTask = findTask(t => t.type === 'coffee' && t.status === 'brewing');
    startComboCoffee(brewTask || null);
  } else if (key === 'partner') {
    const task = findTask(t => t.type === 'coffee' && t.status === 'delivering');
    if (!task || player.carrying !== 'coffee') { showToast('No delivery needed right now.'); return; }
    const rep = { great: 10, ok: 6, poor: 2 }[task.quality];
    applyReputation(rep);
    state.tasksDone++;
    player.carrying = null;
    removeTask(task);
    showToast(`Delivered! +${rep} reputation`);
    syncHud();
  } else if (key === 'meeting') {
    const task = findTask(t => t.type === 'notes' && t.status === 'pending');
    if (!task) { showToast('No meeting right now.'); return; }
    startMemoryMinigame(task);
  } else if (key === 'printer') {
    const task = findTask(t => t.type === 'print' && t.status === 'pending');
    if (!task) { showToast('Nothing to print right now.'); return; }
    startSequenceMinigame(task);
  }
}

function applyReputation(amount) {
  const mult = performance.now() < state.jitterUntil && amount > 0 ? 0.5 : 1;
  state.reputation = Math.max(0, Math.min(100, state.reputation + amount * mult));
}

function closeMinigame() {
  state.minigame = null;
  state.paused = false;
  document.getElementById('minigameOverlay').classList.add('hidden');
}

/* ---------- pitch deck choice minigame ---------- */

function startChoiceMinigame(task) {
  state.paused = true;
  state.energy = Math.max(0, state.energy - 5);
  state.minigame = { type: 'choice', task, resolved: false };
  buildChoiceCard(task);
  document.getElementById('minigameOverlay').classList.remove('hidden');
}

function buildChoiceCard(task) {
  const m = task.meta;
  const card = document.getElementById('minigameCard');
  card.innerHTML = `
    <h2>📊 ${task.title}</h2>
    <p class="flavor">Asking for ${m.ask}.</p>
    <div class="stats-grid">
      <div>📈 MRR growth</div><div>${m.mrrGrowth}%/mo</div>
      <div>🔥 Burn multiple</div><div>${m.burnMultiple}x</div>
      <div>🧑‍💼 Founder</div><div>${m.repeatFounder ? 'Repeat (exited before)' : 'First-time'}</div>
    </div>
    <p class="flavor">Fund it, or pass?</p>
    <div class="choice-row">
      <button id="fundBtn">💰 Fund</button>
      <button id="passBtn" class="secondary">❌ Pass</button>
    </div>
    <div class="feedback" id="choiceFeedback"></div>
  `;
  document.getElementById('fundBtn').onclick = () => resolveChoice(task, true);
  document.getElementById('passBtn').onclick = () => resolveChoice(task, false);
}

function resolveChoice(task, choseFund) {
  const mg = state.minigame;
  if (!mg || mg.resolved) return;
  mg.resolved = true;
  const correct = choseFund === task.meta.isGood;
  const rep = correct ? 10 : -4;
  applyReputation(rep);
  state.tasksDone++;
  removeTask(task);
  const fb = document.getElementById('choiceFeedback');
  const lines = correct
    ? (choseFund ? ['Huge win! The board is thrilled. +10 rep', 'Great call, it 10x\'d already. +10 rep']
                 : ['Dodged a bullet — they imploded a week later. +10 rep'])
    : (choseFund ? ['Yikes, total flop. -4 rep'] : ['Oof, that one would have been a unicorn. -4 rep']);
  fb.textContent = pick(lines);
  fb.className = 'feedback ' + (correct ? 'good' : 'bad');
  document.getElementById('fundBtn').disabled = true;
  document.getElementById('passBtn').disabled = true;
  syncHud();
  setTimeout(closeMinigame, 1100);
}

/* ---------- combo coffee minigame ---------- */

function startComboCoffee(brewTask) {
  state.paused = true;
  state.minigame = { type: 'comboCoffee', brewTask, stageType: 'tamp', tiers: [] };
  document.getElementById('minigameOverlay').classList.remove('hidden');
  buildComboCoffeeCard();
  beginTampStage();
}

function buildComboCoffeeCard() {
  const mg = state.minigame;
  const card = document.getElementById('minigameCard');
  if (mg.stageType === 'tamp') {
    card.innerHTML = `
      <h2>☕ Step 1: Tamp the Grounds</h2>
      <p class="flavor">Press SPACE in rhythm with the pulse!</p>
      <div class="tamp-dot" id="tampDot"></div>
      <div class="feedback" id="tampFeedback"></div>
    `;
  } else if (mg.stageType === 'shot') {
    card.innerHTML = `
      <h2>☕ Step 2: Pull the Shot</h2>
      <p class="flavor">Press SPACE to stop the pour in the gold zone!</p>
      <canvas id="meterCanvas" width="280" height="70"></canvas>
      <div class="feedback" id="shotFeedback"></div>
    `;
  } else if (mg.stageType === 'milk') {
    card.innerHTML = `
      <h2>☕ Step 3: Steam the Milk</h2>
      <p class="flavor">Use ←/→ (or A/D) to hold the marker in the gold zone!</p>
      <canvas id="milkCanvas" width="280" height="70"></canvas>
      <div class="bar" style="width:260px;margin:6px auto;"><div class="fill energy" id="milkTimer" style="width:100%"></div></div>
      <div class="feedback" id="milkFeedback"></div>
    `;
  }
}

function beginTampStage() {
  const mg = state.minigame;
  mg.tampHits = 0;
  mg.tampBeatsDone = 0;
  mg.tampBeatActive = false;
  const totalBeats = 4;
  const beat = () => {
    if (state.minigame !== mg || mg.stageType !== 'tamp') return;
    mg.tampBeatActive = true;
    const dot = document.getElementById('tampDot');
    if (dot) dot.classList.add('lit');
    setTimeout(() => {
      if (state.minigame !== mg) return;
      mg.tampBeatActive = false;
      const dot2 = document.getElementById('tampDot');
      if (dot2) dot2.classList.remove('lit');
      mg.tampBeatsDone++;
      if (mg.tampBeatsDone < totalBeats) setTimeout(beat, 350);
      else setTimeout(finishTampStage, 400);
    }, 300);
  };
  setTimeout(beat, 600);
}

function handleTampPress() {
  const mg = state.minigame;
  const fb = document.getElementById('tampFeedback');
  if (mg.tampBeatActive) {
    mg.tampHits++;
    if (fb) { fb.textContent = 'Nice!'; fb.className = 'feedback good'; }
  } else if (fb) {
    fb.textContent = 'Miss!';
    fb.className = 'feedback bad';
  }
}

function finishTampStage() {
  const mg = state.minigame;
  const tier = mg.tampHits >= 4 ? 2 : mg.tampHits >= 2 ? 1 : 0;
  mg.tiers.push(tier);
  advanceComboStage('shot');
}

function advanceComboStage(next) {
  const mg = state.minigame;
  mg.stageType = next;
  if (next === 'shot') {
    mg.shotLo = 30 + Math.random() * 35;
    mg.shotHi = mg.shotLo + 14;
    mg.shotValue = 0;
    mg.shotStartTime = performance.now();
    mg.shotResolved = false;
  } else if (next === 'milk') {
    mg.milkValue = 50;
    mg.milkVel = (Math.random() < 0.5 ? -1 : 1) * 18;
    mg.milkInBand = 0;
    mg.milkStartTime = performance.now();
    mg.milkDuration = 6000;
  } else if (next === 'done') {
    finishComboCoffee();
    return;
  }
  buildComboCoffeeCard();
}

function handleShotPress() {
  const mg = state.minigame;
  if (mg.shotResolved) return;
  mg.shotResolved = true;
  const success = mg.shotValue >= mg.shotLo && mg.shotValue <= mg.shotHi;
  const great = success && Math.abs(mg.shotValue - (mg.shotLo + mg.shotHi) / 2) < (mg.shotHi - mg.shotLo) / 4;
  mg.tiers.push(great ? 2 : success ? 1 : 0);
  const fb = document.getElementById('shotFeedback');
  if (fb) {
    fb.textContent = success ? (great ? 'Perfect pull!' : 'Good shot.') : 'Off target.';
    fb.className = 'feedback ' + (success ? 'good' : 'bad');
  }
  setTimeout(() => advanceComboStage('milk'), 700);
}

function drawShotMeter() {
  const mg = state.minigame;
  const mc = document.getElementById('meterCanvas');
  if (!mc) return;
  const mctx = mc.getContext('2d');
  const t = (performance.now() - mg.shotStartTime) / 1000;
  if (!mg.shotResolved) mg.shotValue = 50 + 48 * Math.sin(t * 2.6);
  mctx.clearRect(0, 0, 280, 70);
  mctx.fillStyle = '#f3ecf7';
  roundRect(mctx, 10, 28, 260, 16, 8); mctx.fill();
  const loX = 10 + (mg.shotLo / 100) * 260;
  const zoneW = ((mg.shotHi - mg.shotLo) / 100) * 260;
  mctx.fillStyle = '#ffe08a';
  roundRect(mctx, loX, 28, zoneW, 16, 6); mctx.fill();
  const markerX = 10 + (Math.max(0, Math.min(100, mg.shotValue)) / 100) * 260;
  mctx.fillStyle = mg.shotResolved ? '#57c97f' : '#ff6fa8';
  mctx.beginPath(); mctx.arc(markerX, 36, 9, 0, Math.PI * 2); mctx.fill();
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.stroke();
}

function updateMilkStage(dt) {
  const mg = state.minigame;
  const elapsed = performance.now() - mg.milkStartTime;
  if (elapsed >= mg.milkDuration) { finishMilkStage(); return; }
  mg.milkVel += (Math.random() - 0.5) * 40 * dt;
  if (keys.has('arrowleft') || keys.has('a')) mg.milkVel -= 70 * dt;
  if (keys.has('arrowright') || keys.has('d')) mg.milkVel += 70 * dt;
  mg.milkVel = Math.max(-60, Math.min(60, mg.milkVel));
  mg.milkValue += mg.milkVel * dt;
  if (mg.milkValue <= 0 || mg.milkValue >= 100) mg.milkVel *= -0.5;
  mg.milkValue = Math.max(0, Math.min(100, mg.milkValue));
  if (mg.milkValue >= 40 && mg.milkValue <= 60) mg.milkInBand += dt * 1000;
  drawMilkMeter(elapsed);
}

function drawMilkMeter(elapsed) {
  const mc = document.getElementById('milkCanvas');
  if (!mc) return;
  const mctx = mc.getContext('2d');
  const mg = state.minigame;
  mctx.clearRect(0, 0, 280, 70);
  mctx.fillStyle = '#f3ecf7';
  roundRect(mctx, 10, 28, 260, 16, 8); mctx.fill();
  mctx.fillStyle = '#ffe08a';
  roundRect(mctx, 10 + 0.4 * 260, 28, 0.2 * 260, 16, 6); mctx.fill();
  const markerX = 10 + (mg.milkValue / 100) * 260;
  mctx.fillStyle = '#7fd6c2';
  mctx.beginPath(); mctx.arc(markerX, 36, 9, 0, Math.PI * 2); mctx.fill();
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.stroke();
  const timerEl = document.getElementById('milkTimer');
  if (timerEl) timerEl.style.width = `${Math.max(0, 100 - (elapsed / mg.milkDuration) * 100)}%`;
}

function finishMilkStage() {
  const mg = state.minigame;
  if (mg.stageType !== 'milk') return;
  const ratio = mg.milkInBand / mg.milkDuration;
  const tier = ratio >= 0.7 ? 2 : ratio >= 0.35 ? 1 : 0;
  mg.tiers.push(tier);
  mg.stageType = 'milkdone';
  const fb = document.getElementById('milkFeedback');
  if (fb) {
    fb.textContent = tier === 2 ? 'Silky smooth foam!' : tier === 1 ? 'Decent foam.' : 'Milk everywhere...';
    fb.className = 'feedback ' + (tier === 0 ? 'bad' : 'good');
  }
  setTimeout(() => advanceComboStage('done'), 800);
}

function tierIcon(t) { return t === 2 ? '🟢' : t === 1 ? '🟡' : '🔴'; }

function finishComboCoffee() {
  const mg = state.minigame;
  const avg = mg.tiers.reduce((a, b) => a + b, 0) / mg.tiers.length;
  const tier = avg >= 1.6 ? 'great' : avg >= 0.8 ? 'ok' : 'poor';
  const brewTask = mg.brewTask;
  let text, good;
  if (brewTask) {
    brewTask.status = 'delivering';
    brewTask.title = `Deliver coffee to ${brewTask.meta.partner}`;
    brewTask.quality = tier;
    player.carrying = 'coffee';
    renderTaskList();
    text = { great: 'A masterpiece brew! ☕✨', ok: 'A solid cup.', poor: 'Burnt and weak, but caffeinated.' }[tier];
    good = tier !== 'poor';
  } else {
    const before = state.energy;
    const restore = { great: 28, ok: 16, poor: 8 }[tier];
    state.energy = Math.min(100, state.energy + restore);
    if (tier === 'great' && before >= 80) {
      state.jitterUntil = performance.now() + 12000;
      showToast('Whoa, caffeine rush! ⚡');
    }
    text = `${{ great: 'Incredible cup!', ok: 'Pretty good.', poor: 'Drinkable, barely.' }[tier]} +${restore} energy`;
    good = tier !== 'poor';
  }
  syncHud();
  const card = document.getElementById('minigameCard');
  card.innerHTML = `
    <h2>☕ Coffee Complete</h2>
    <p class="flavor">Tamp ${tierIcon(mg.tiers[0])} &nbsp; Shot ${tierIcon(mg.tiers[1])} &nbsp; Milk ${tierIcon(mg.tiers[2])}</p>
    <div class="feedback ${good ? 'good' : 'bad'}">${text}</div>
  `;
  setTimeout(closeMinigame, 1300);
}

/* ---------- memory minigame (meeting notes) ---------- */

function startMemoryMinigame(task) {
  state.paused = true;
  state.energy = Math.max(0, state.energy - 5);
  const pool = shuffle([...JARGON]);
  const sequence = pool.slice(0, 4);
  const decoys = pool.slice(4, 6);
  const gridWords = shuffle([...sequence, ...decoys]);
  state.minigame = { type: 'memory', task, sequence, gridWords, picks: [], phase: 'show', resolved: false };
  document.getElementById('minigameOverlay').classList.remove('hidden');
  buildMemoryCard();
  runMemoryShow();
}

function buildMemoryCard() {
  const mg = state.minigame;
  const card = document.getElementById('minigameCard');
  card.innerHTML = `
    <h2>📝 ${mg.task.title}</h2>
    <p class="flavor" id="memoryFlavor">Watch the order closely...</p>
    <div class="memory-grid" id="memoryGrid"></div>
    <div class="feedback" id="memoryFeedback"></div>
  `;
  const grid = document.getElementById('memoryGrid');
  mg.gridWords.forEach(w => {
    const btn = document.createElement('button');
    btn.className = 'memory-chip';
    btn.textContent = w;
    btn.dataset.word = w;
    btn.disabled = true;
    btn.onclick = () => handleMemoryPick(w, btn);
    grid.appendChild(btn);
  });
}

function runMemoryShow() {
  const mg = state.minigame;
  let i = 0;
  const step = () => {
    if (state.minigame !== mg) return;
    const chips = [...document.querySelectorAll('.memory-chip')];
    chips.forEach(c => c.classList.remove('flash'));
    if (i >= mg.sequence.length) {
      const flavor = document.getElementById('memoryFlavor');
      if (flavor) flavor.textContent = 'Now click them back in order!';
      mg.phase = 'input';
      chips.forEach(c => c.disabled = false);
      return;
    }
    const chip = chips.find(c => c.dataset.word === mg.sequence[i]);
    if (chip) chip.classList.add('flash');
    i++;
    setTimeout(step, 650);
  };
  setTimeout(step, 500);
}

function handleMemoryPick(word, btn) {
  const mg = state.minigame;
  if (mg.phase !== 'input' || mg.resolved) return;
  const expected = mg.sequence[mg.picks.length];
  mg.picks.push(word);
  btn.disabled = true;
  if (word === expected) {
    btn.classList.add('correct');
    if (mg.picks.length === mg.sequence.length) finishMemory();
  } else {
    btn.classList.add('wrong');
    finishMemory();
  }
}

function finishMemory() {
  const mg = state.minigame;
  mg.resolved = true;
  let correctCount = 0;
  for (let i = 0; i < mg.picks.length; i++) { if (mg.picks[i] === mg.sequence[i]) correctCount++; else break; }
  const tier = correctCount === mg.sequence.length ? 'great' : correctCount >= 2 ? 'ok' : 'poor';
  const rep = { great: 10, ok: 6, poor: 2 }[tier];
  applyReputation(rep);
  state.tasksDone++;
  removeTask(mg.task);
  const fb = document.getElementById('memoryFeedback');
  const lines = { great: `Word-perfect notes! +${rep} reputation`, ok: `Decent notes, missed a beat. +${rep} reputation`, poor: `Notes are a mess. +${rep} reputation` };
  if (fb) { fb.textContent = lines[tier]; fb.className = 'feedback ' + (tier === 'poor' ? 'bad' : 'good'); }
  syncHud();
  setTimeout(closeMinigame, 1200);
}

/* ---------- sequence minigame (printer) ---------- */

function startSequenceMinigame(task) {
  state.paused = true;
  state.energy = Math.max(0, state.energy - 5);
  const sequence = Array.from({ length: 5 }, () => pick(ARROW_KEYS));
  state.minigame = { type: 'sequence', task, sequence, index: 0, mistakes: 0, startTime: performance.now(), duration: 6000, resolved: false };
  document.getElementById('minigameOverlay').classList.remove('hidden');
  buildSequenceCard();
}

function buildSequenceCard() {
  const mg = state.minigame;
  const card = document.getElementById('minigameCard');
  card.innerHTML = `
    <h2>🖨️ ${mg.task.title}</h2>
    <p class="flavor">Press the arrow keys in order before the jam!</p>
    <div class="seq-row" id="seqRow"></div>
    <div class="bar" style="width:260px;margin:10px auto;"><div class="fill energy" id="seqTimer" style="width:100%"></div></div>
    <div class="feedback" id="seqFeedback"></div>
  `;
  renderSeqRow();
}

function renderSeqRow() {
  const mg = state.minigame;
  const row = document.getElementById('seqRow');
  if (!row) return;
  row.innerHTML = mg.sequence.map((k, i) => {
    const cls = i < mg.index ? 'seq-icon done' : i === mg.index ? 'seq-icon active' : 'seq-icon';
    return `<span class="${cls}">${ARROW_ICONS[k]}</span>`;
  }).join('');
}

function handleSequenceKeyPress(key) {
  const mg = state.minigame;
  if (!mg || mg.resolved || !ARROW_KEYS.includes(key)) return;
  if (key === mg.sequence[mg.index]) {
    mg.index++;
    if (mg.index >= mg.sequence.length) finishSequence(true);
    else renderSeqRow();
  } else {
    mg.mistakes++;
    renderSeqRow();
  }
}

function updateSequenceTimer() {
  const mg = state.minigame;
  const el = document.getElementById('seqTimer');
  const elapsed = performance.now() - mg.startTime;
  const remain = Math.max(0, 1 - elapsed / mg.duration);
  if (el) el.style.width = `${remain * 100}%`;
  if (elapsed >= mg.duration && !mg.resolved) finishSequence(false);
}

function finishSequence(completed) {
  const mg = state.minigame;
  if (mg.resolved) return;
  mg.resolved = true;
  const tier = !completed ? 'poor' : mg.mistakes === 0 ? 'great' : mg.mistakes <= 2 ? 'ok' : 'poor';
  const rep = { great: 9, ok: 6, poor: 2 }[tier];
  applyReputation(rep);
  state.tasksDone++;
  removeTask(mg.task);
  const fb = document.getElementById('seqFeedback');
  const lines = { great: `Crisp copies, zero jams! +${rep} reputation`, ok: `Got there with a few jams. +${rep} reputation`, poor: `Total paper jam disaster. +${rep} reputation` };
  if (fb) { fb.textContent = lines[tier]; fb.className = 'feedback ' + (tier === 'poor' ? 'bad' : 'good'); }
  syncHud();
  setTimeout(closeMinigame, 1100);
}

/* ---------- day end ---------- */

function gradeFor(rep) {
  if (rep >= 90) return ['S', "Legendary. They're naming a conference room after you."];
  if (rep >= 75) return ['A', 'Return offer incoming! 🎉'];
  if (rep >= 55) return ['B', "Solid work. They'll keep you around."];
  if (rep >= 35) return ['C', 'Rough day, but you survived.'];
  return ['F', '...maybe consulting is more your speed.'];
}

function triggerDayEnd(reason) {
  if (state.ended) return;
  state.ended = true;
  state.paused = true;
  const [grade, line] = gradeFor(state.reputation);
  const lead = reason === 'exhausted'
    ? 'You collapsed at your desk from sheer exhaustion. Someone covered you with a blanket.'
    : `It's 6 PM. Another day at ${state.firmName}, survived.`;
  const card = document.getElementById('endCard');
  card.innerHTML = `
    <h1>📋 Day Report</h1>
    <p>${lead}</p>
    <div class="grade">${grade}</div>
    <p>${line}</p>
    <div class="stats-grid">
      <div>✅ Tasks done</div><div>${state.tasksDone}</div>
      <div>⭐ Reputation</div><div>${Math.round(state.reputation)}</div>
      <div>⚡ Energy left</div><div>${Math.round(state.energy)}</div>
    </div>
    <button id="playAgainBtn">Try Again 🔁</button>
  `;
  document.getElementById('endOverlay').classList.remove('hidden');
  document.getElementById('playAgainBtn').onclick = () => location.reload();
}

/* ---------- update loop ---------- */

function handleMovement(dt) {
  let dx = 0, dy = 0;
  if (keys.has('arrowup') || keys.has('w')) dy -= 1;
  if (keys.has('arrowdown') || keys.has('s')) dy += 1;
  if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
  if (keys.has('arrowright') || keys.has('d')) dx += 1;

  player.moving = dx !== 0 || dy !== 0;
  if (player.moving) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    player.lookX = dx; player.lookY = dy;
    if (dx > 0.1) player.facingRight = true;
    if (dx < -0.1) player.facingRight = false;

    const jitter = performance.now() < state.jitterUntil;
    const speed = player.speed * (jitter ? 1.5 : 1);
    const nx = player.x + dx * speed * dt;
    const ny = player.y + dy * speed * dt;

    if (!collides(nx, player.y)) player.x = nx;
    if (!collides(player.x, ny)) player.y = ny;

    player.x = Math.max(24, Math.min(W - 24, player.x));
    player.y = Math.max(36, Math.min(H - 24, player.y));
  }
}

function collides(px, py) {
  const box = { x: px - 12, y: py - 14, w: 24, h: 16 };
  for (const key in LOCATIONS) {
    const f = LOCATIONS[key].furniture;
    if (box.x < f.x + f.w && box.x + box.w > f.x && box.y < f.y + f.h && box.y + box.h > f.y) return true;
  }
  return false;
}

function updateMinigameVisuals(dt) {
  const mg = state.minigame;
  if (mg.type === 'comboCoffee') {
    if (mg.stageType === 'shot') drawShotMeter();
    else if (mg.stageType === 'milk') updateMilkStage(dt);
  } else if (mg.type === 'sequence') {
    updateSequenceTimer();
  }
}

function update(dt) {
  if (!state.started || state.ended) return;
  if (state.minigame) { updateMinigameVisuals(dt); return; }
  if (state.paused) return;

  handleMovement(dt);

  state.clockMin += MIN_PER_SEC * dt;
  if (state.clockMin >= DAY_END_MIN) { triggerDayEnd('time'); syncHud(); return; }

  state.energyDrainAcc += dt;
  if (state.energyDrainAcc >= 6) {
    state.energyDrainAcc -= 6;
    state.energy = Math.max(0, state.energy - 1);
    if (state.energy <= 0) { triggerDayEnd('exhausted'); syncHud(); return; }
  }

  state.spawnAcc += dt;
  if (state.spawnAcc >= state.spawnNext) {
    state.spawnAcc = 0;
    state.spawnNext = 10 + Math.random() * 7;
    spawnTask();
  }

  syncHud();
}

/* ---------- rendering ---------- */

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawRoom(zone, fillColor) {
  ctx.fillStyle = fillColor;
  roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 18);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#8a7a98';
  ctx.font = '600 12px Quicksand, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(zone.label, zone.x + zone.w / 2, zone.y + zone.h + 16);
}

function drawDesk(f, withLaptop) {
  ctx.fillStyle = '#e3b27a';
  roundRect(ctx, f.x, f.y, f.w, f.h, 10); ctx.fill();
  ctx.strokeStyle = '#c8935a'; ctx.lineWidth = 2; ctx.stroke();
  if (withLaptop) {
    const lx = f.x + f.w / 2 - 18, ly = f.y + f.h / 2 - 10;
    ctx.fillStyle = '#5b8fd6';
    roundRect(ctx, lx, ly, 36, 22, 4); ctx.fill();
    ctx.fillStyle = '#cfe8ff';
    roundRect(ctx, lx + 4, ly + 4, 28, 14, 2); ctx.fill();
  }
}

function drawCoffeeMachine(f, t) {
  ctx.fillStyle = '#b0b8c4';
  roundRect(ctx, f.x, f.y, f.w, f.h, 10); ctx.fill();
  ctx.strokeStyle = '#8a93a3'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ff6fa8';
  ctx.beginPath();
  ctx.arc(f.x + f.w - 14, f.y + 12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b5847';
  roundRect(ctx, f.x + f.w / 2 - 10, f.y + f.h - 14, 20, 14, 3); ctx.fill();
  ctx.strokeStyle = '#e8e2da';
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    const sx = f.x + f.w / 2 - 6 + i * 10;
    ctx.beginPath();
    ctx.moveTo(sx, f.y - 4);
    ctx.quadraticCurveTo(sx + 5, f.y - 10 - Math.sin(t / 300 + i) * 3, sx, f.y - 18);
    ctx.stroke();
  }
}

function drawMeetingTable(f) {
  ctx.fillStyle = '#d9a066';
  roundRect(ctx, f.x, f.y, f.w, f.h, 24); ctx.fill();
  ctx.strokeStyle = '#b9824e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#f3d9b1';
  const chairPositions = [[-14, -10], [f.w + 14, -10], [-14, f.h + 6], [f.w + 14, f.h + 6]];
  for (const [dx, dy] of chairPositions) {
    ctx.beginPath();
    ctx.arc(f.x + dx, f.y + dy + 10, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPrinter(f, t) {
  ctx.fillStyle = '#9aa3b0';
  roundRect(ctx, f.x, f.y, f.w, f.h, 8); ctx.fill();
  ctx.strokeStyle = '#7b828f'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff';
  roundRect(ctx, f.x + 8, f.y + f.h - 12, f.w - 16, 8, 2); ctx.fill();
  const blink = Math.sin(t / 250) > 0;
  ctx.fillStyle = blink ? '#57c97f' : '#3a8f5a';
  ctx.beginPath();
  ctx.arc(f.x + f.w - 10, f.y + 8, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlant(x, y) {
  ctx.fillStyle = '#c8935a';
  roundRect(ctx, x - 10, y, 20, 14, 3); ctx.fill();
  ctx.fillStyle = '#6fbf7d';
  for (const [dx, dy, r] of [[-6, -4, 9], [6, -4, 9], [0, -14, 11]]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawChibi(c, cx, cyFeet, opts, t) {
  const { bodyColor, skin, hair, glasses, bob, carrying, mirror } = opts;
  c.save();
  c.translate(cx, cyFeet);
  if (mirror) c.scale(-1, 1);

  c.fillStyle = 'rgba(74,63,85,0.18)';
  c.beginPath();
  c.ellipse(0, 2, 16, 5, 0, 0, Math.PI * 2);
  c.fill();

  const y = -bob;

  c.fillStyle = bodyColor;
  roundRect(c, -13, y - 30, 26, 28, 10); c.fill();
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(0, y - 18, 2.4, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(0, y - 11, 2.4, 0, Math.PI * 2); c.fill();

  c.fillStyle = skin;
  roundRect(c, -9, y - 6, 7, 9, 3); c.fill();
  roundRect(c, 2, y - 6, 7, 9, 3); c.fill();

  c.fillStyle = skin;
  c.beginPath();
  c.arc(0, y - 40, 15, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = hair;
  c.beginPath();
  c.arc(0, y - 46, 15.5, Math.PI, 0);
  c.fill();
  roundRect(c, -16, y - 46, 4, 12, 2); c.fill();
  roundRect(c, 12, y - 46, 4, 12, 2); c.fill();

  const lookX = opts.lookX || 0;
  c.fillStyle = '#3a3142';
  c.beginPath(); c.arc(-5 + lookX * 2, y - 40, 1.8, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(5 + lookX * 2, y - 40, 1.8, 0, Math.PI * 2); c.fill();

  c.fillStyle = '#ffb3c6';
  c.globalAlpha = 0.7;
  c.beginPath(); c.arc(-9, y - 36, 2.6, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(9, y - 36, 2.6, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;

  c.strokeStyle = '#a8869c';
  c.lineWidth = 1.4;
  c.beginPath();
  c.arc(0, y - 35, 4, 0.15 * Math.PI, 0.85 * Math.PI);
  c.stroke();

  if (glasses) {
    c.strokeStyle = '#5b4a66';
    c.lineWidth = 1.6;
    c.beginPath(); c.arc(-5, y - 40, 4.5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(5, y - 40, 4.5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(-0.5, y - 40); c.lineTo(0.5, y - 40); c.stroke();
  }

  if (carrying === 'coffee') {
    c.fillStyle = '#fff';
    roundRect(c, -6, y - 24, 10, 10, 2); c.fill();
    c.fillStyle = '#6b4226';
    roundRect(c, -5, y - 23, 8, 4, 1); c.fill();
  }

  c.restore();
}

function drawMarker(zone, icon, t) {
  const bob = Math.sin(t / 260) * 4;
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(icon, zone.x + zone.w / 2, zone.y - 14 + bob);
}

function render(t) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff7ec';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#f3e6d8';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
  for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

  drawRoom(LOCATIONS.desk, '#cfe8ff');
  drawRoom(LOCATIONS.partner, '#ffd6e8');
  drawRoom(LOCATIONS.coffee, '#ffe9a8');
  drawRoom(LOCATIONS.meeting, '#b8f2c9');
  drawRoom(LOCATIONS.printer, '#e3d4f0');

  for (const p of DECOR_PLANTS) drawPlant(p.x, p.y);

  drawDesk(LOCATIONS.desk.furniture, true);
  drawDesk(LOCATIONS.partner.furniture, false);
  drawCoffeeMachine(LOCATIONS.coffee.furniture, t);
  drawMeetingTable(LOCATIONS.meeting.furniture);
  drawPrinter(LOCATIONS.printer.furniture, t);

  const partnerBob = Math.abs(Math.sin(t / 500)) * 1.5;
  drawChibi(ctx, LOCATIONS.partner.x + LOCATIONS.partner.w / 2, LOCATIONS.partner.y + LOCATIONS.partner.h - 16,
    { bodyColor: '#7c8aa3', skin: '#e8b88a', hair: '#3a3142', glasses: true, bob: partnerBob, lookX: 0 }, t);

  if (state.started) {
    if (findTask(t2 => t2.type === 'pitch' && t2.status === 'pending')) drawMarker(LOCATIONS.desk, '📊', t);
    if (findTask(t2 => t2.type === 'coffee' && t2.status === 'brewing')) drawMarker(LOCATIONS.coffee, '☕', t);
    if (findTask(t2 => t2.type === 'coffee' && t2.status === 'delivering')) drawMarker(LOCATIONS.partner, '☕', t);
    if (findTask(t2 => t2.type === 'notes' && t2.status === 'pending')) drawMarker(LOCATIONS.meeting, '📝', t);
    if (findTask(t2 => t2.type === 'print' && t2.status === 'pending')) drawMarker(LOCATIONS.printer, '🖨️', t);
  }

  const bob = player.moving ? Math.abs(Math.sin(t / 110)) * 3 : Math.sin(t / 450) * 1.2;
  drawChibi(ctx, player.x, player.y, {
    bodyColor: player.bodyColor, skin: '#f3c9a0', hair: player.hairColor, glasses: false,
    bob, carrying: player.carrying, mirror: !player.facingRight, lookX: player.lookX,
  }, t);

  if (state.started && !state.ended && !state.minigame) {
    const key = nearestLocationKey();
    if (key) {
      const hasWork =
        (key === 'desk' && findTask(t2 => t2.type === 'pitch' && t2.status === 'pending')) ||
        (key === 'coffee') ||
        (key === 'partner' && findTask(t2 => t2.type === 'coffee' && t2.status === 'delivering')) ||
        (key === 'meeting' && findTask(t2 => t2.type === 'notes' && t2.status === 'pending')) ||
        (key === 'printer' && findTask(t2 => t2.type === 'print' && t2.status === 'pending'));
      if (hasWork) {
        ctx.font = '700 13px Quicksand, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#4a3f55';
        const bx = player.x, by = player.y - 60;
        const text = 'SPACE';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, bx - tw / 2 - 8, by - 12, tw + 16, 20, 8); ctx.fill();
        ctx.fillStyle = '#4a3f55';
        ctx.fillText(text, bx, by + 3);
      }
    }
  }
}

/* ---------- main loop ---------- */

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  render(now);
  requestAnimationFrame(loop);
}

/* ---------- customization screen ---------- */

let chosenHair = HAIR_COLORS[0];
let chosenOutfit = OUTFIT_COLORS[0];

function renderCustomizationPreview() {
  const pc = document.getElementById('previewCanvas');
  if (!pc) return;
  const pctx = pc.getContext('2d');
  pctx.clearRect(0, 0, pc.width, pc.height);
  drawChibi(pctx, pc.width / 2, pc.height - 14, {
    bodyColor: chosenOutfit, skin: '#f3c9a0', hair: chosenHair, glasses: false, bob: 0, carrying: null, mirror: false, lookX: 0,
  }, performance.now());
}

function buildSwatches(containerId, colors, onSelect) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  colors.forEach((color, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch' + (i === 0 ? ' selected' : '');
    btn.style.background = color;
    btn.onclick = () => {
      el.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect(color);
      renderCustomizationPreview();
    };
    el.appendChild(btn);
  });
}

buildSwatches('hairSwatches', HAIR_COLORS, c => { chosenHair = c; });
buildSwatches('outfitSwatches', OUTFIT_COLORS, c => { chosenOutfit = c; });
renderCustomizationPreview();

const firmNameInput = document.getElementById('firmNameInput');
firmNameInput.addEventListener('input', () => {
  const name = firmNameInput.value.trim() || 'Sunbeam Ventures';
  document.getElementById('firmNameWelcome').textContent = name;
});

/* ---------- boot ---------- */

document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('startOverlay').classList.add('hidden');
  document.activeElement.blur();
  player.hairColor = chosenHair;
  player.bodyColor = chosenOutfit;
  state.firmName = firmNameInput.value.trim() || 'Sunbeam Ventures';
  document.getElementById('firmNameHeader').textContent = state.firmName;
  state.started = true;
  spawnTask();
  spawnTask();
  syncHud();
  renderTaskList();
});

renderTaskList();
syncHud();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });

})();

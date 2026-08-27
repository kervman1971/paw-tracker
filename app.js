import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, onValue, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBfwfaeUZVc9giI4IIjWBQBdhhIka9WlPI",
  authDomain: "dog-tracker-df4e5.firebaseapp.com",
  databaseURL: "https://dog-tracker-df4e5-default-rtdb.firebaseio.com",
  projectId: "dog-tracker-df4e5",
  storageBucket: "dog-tracker-df4e5.firebasestorage.app",
  messagingSenderId: "614021854449",
  appId: "1:614021854449:web:698d82460f3a73af816550"
};

let app, db;
try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.error("Firebase init error:", e);
}

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

const TODAY = todayKey();
const dayRef = (path) => ref(db, 'days/' + TODAY + (path ? '/' + path : ''));
const mealsConfigRef = ref(db, 'config/meals');
const weightRef = ref(db, 'weight');
const logRef = ref(db, 'days/' + TODAY + '/log');
const groomingHistoryRef = ref(db, 'grooming_history');
const connectedRef = ref(db, '.info/connected');

// State
let who = 'Kevin';
let defaultMeals = {
  morning: [
    { icon: '💊', label: 'Allergy Pill', kcal: 0, note: 'Give with food', id: 'pill' },
    { icon: '🥣', label: 'Kibble W/ Dust', kcal: 28, note: '¼ cup', id: 'kib1' },
    { icon: '🍠', label: 'Sweet Potato', kcal: 25, note: 'Topper', id: 'sp' },
    { icon: '🦴', label: 'Vibrant Life Treat', kcal: 20, note: '', id: 'vl' },
    { icon: '🥩', label: 'Beef Liver Treat', kcal: 15, note: '', id: 'bl1' }
  ],
  evening: [
    { icon: '🥣', label: 'Kibble W/ Dust', kcal: 28, note: '¼ cup', id: 'kib2' },
    { icon: '🥩', label: 'Beef Liver Treat', kcal: 15, note: '', id: 'bl2' },
    { icon: '🟢', label: 'Greenie', kcal: 30, note: 'Dental Treat', id: 'gr' }
  ]
};

let meals = JSON.parse(localStorage.getItem('geddy_meals')) || defaultMeals;
let groomingDailyItems = [
  { icon: '🪥', label: 'Teeth Brushing', note: 'Enzymatic toothpaste', id: 'teeth' },
  { icon: '🪮', label: 'Daily Coat Brush', note: 'Remove loose fur', id: 'coat_daily' },
  { icon: '👀', label: 'Eye & Paw Wipe', note: 'Wipe tear stains & paws', id: 'wipes' }
];

let checked = JSON.parse(localStorage.getItem(`geddy_checked_${TODAY}`)) || {};
let groomingChecked = JSON.parse(localStorage.getItem(`geddy_grooming_${TODAY}`)) || {};
let activities = JSON.parse(localStorage.getItem(`geddy_activities_${TODAY}`)) || { walk: [], poo: [], water: [], play: [] };
let groomingHistory = JSON.parse(localStorage.getItem('geddy_grooming_history')) || { brush: [], bath: [], nails: [], fleatick: [], ears: [] };
let weightHistory = JSON.parse(localStorage.getItem('geddy_weight_history')) || [];
let logEntries = JSON.parse(localStorage.getItem(`geddy_log_${TODAY}`)) || [];
let actionHistory = [];
let hasTriggeredConfetti = false;

function saveLocal() {
  localStorage.setItem('geddy_meals', JSON.stringify(meals));
  localStorage.setItem(`geddy_checked_${TODAY}`, JSON.stringify(checked));
  localStorage.setItem(`geddy_grooming_${TODAY}`, JSON.stringify(groomingChecked));
  localStorage.setItem(`geddy_activities_${TODAY}`, JSON.stringify(activities));
  localStorage.setItem('geddy_grooming_history', JSON.stringify(groomingHistory));
  localStorage.setItem('geddy_weight_history', JSON.stringify(weightHistory));
  localStorage.setItem(`geddy_log_${TODAY}`, JSON.stringify(logEntries));
}

// DOM Initialization
document.addEventListener('DOMContentLoaded', () => {
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  document.getElementById('dateBadge').textContent = dateStr;
  document.getElementById('weightDate').value = TODAY;

  // Initial Render
  renderChecklist('morning');
  renderChecklist('evening');
  renderGroomingDailyChecklist();
  renderGroomingHistory();
  ['walk', 'poo', 'water', 'play'].forEach(renderActivities);
  renderLog();
  renderWeightHistory();
  updateCal();
  updateBadges();

  // Listeners
  initWhoButtons();
  initTabs();
  initActivityButtons();
  initGroomingLoggers();
  initLogSection();
  initWeightSection();
  initModalDialogs();

  document.getElementById('globalUndoBtn')?.addEventListener('click', undoLastAction);
  document.getElementById('pawAvatar')?.addEventListener('click', () => {
    triggerConfetti(0.3);
    showToast('Woof! Geddy loves you! 🐾');
  });

  setupFirebaseListeners();
});

// Sync Banner & Dot Indicator
function setSyncStatus(isLive) {
  const dot = document.getElementById('liveDot');
  if (dot) {
    dot.className = 'live-dot' + (isLive ? '' : ' error');
    dot.title = isLive ? 'Live Sync Active' : 'Connecting / Local Storage Mode';
  }
}

// Toast System
function showToast(msg, canUndo = false) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  container.innerHTML = '';
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (canUndo) {
    toast.innerHTML = `<span>${msg}</span> <button class="toast-undo" style="background:#FF6B35;color:#fff;border:none;padding:3px 10px;border-radius:99px;font-weight:900;cursor:pointer;margin-left:8px;">↺ Undo</button>`;
    const btn = toast.querySelector('.toast-undo');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        undoLastAction();
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }
  } else {
    toast.textContent = msg;
  }
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 10000);
}

// Confetti
function triggerConfetti(ratio = 1) {
  if (typeof window.confetti === 'function') {
    window.confetti({ particleCount: Math.floor(60 * ratio), spread: 70, origin: { y: 0.6 } });
  }
}

// Caregiver Selection
function initWhoButtons() {
  document.querySelectorAll('.who-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      who = btn.dataset.who;
      document.querySelectorAll('.who-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast(`Logged by ${who}`);
    });
  });
}

// Tabs
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
      btn.classList.add('active');
    });
  });
}

// Undo Stack System
function pushUndoAction(action) {
  actionHistory.push(action);
  updateUndoButtonUI();
}

function updateUndoButtonUI() {
  const btn = document.getElementById('globalUndoBtn');
  if (!btn) return;
  if (actionHistory.length > 0) {
    btn.style.display = 'inline-block';
    btn.textContent = `↺ Undo (${actionHistory.length})`;
  } else {
    btn.style.display = 'none';
  }
}

function undoLastAction() {
  if (actionHistory.length === 0) {
    showToast('Nothing to undo');
    return;
  }
  const action = actionHistory.pop();
  updateUndoButtonUI();

  if (action.type === 'activity') {
    const list = activities[action.category] || [];
    let idx = -1;
    if (action.entry) {
      idx = list.findIndex(e => (action.entry.fbKey && e.fbKey === action.entry.fbKey) || (action.entry.ts && e.ts === action.entry.ts));
    }
    if (idx === -1 && list.length > 0) idx = list.length - 1;
    if (idx !== -1 && list.length > 0) {
      const removed = list.splice(idx, 1)[0];
      saveLocal();
      renderActivities(action.category);
      updateBadges();
      if (db && removed.fbKey && !removed.fbKey.startsWith('loc_')) {
        remove(ref(db, `days/${TODAY}/activities/${action.category}/${removed.fbKey}`));
      }
    }
  } else if (action.type === 'check') {
    if (action.previousVal) checked[action.itemId] = action.previousVal;
    else delete checked[action.itemId];
    saveLocal();
    renderChecklist(action.meal);
    updateCal();
    updateBadges();
    if (db) {
      const u = {}; u['checked/' + action.itemId] = action.previousVal || null;
      update(dayRef(), u);
    }
  } else if (action.type === 'grooming_daily') {
    if (action.previousVal) groomingChecked[action.itemId] = action.previousVal;
    else delete groomingChecked[action.itemId];
    saveLocal();
    renderGroomingDailyChecklist();
    if (db) {
      const u = {}; u['grooming_daily/' + action.itemId] = action.previousVal || null;
      update(dayRef(), u);
    }
  } else if (action.type === 'grooming_history') {
    const list = groomingHistory[action.category] || [];
    let idx = -1;
    if (action.entry) idx = list.findIndex(e => (action.entry.fbKey && e.fbKey === action.entry.fbKey) || (action.entry.ts && e.ts === action.entry.ts));
    if (idx === -1 && list.length > 0) idx = 0;
    if (idx !== -1 && list.length > 0) {
      const removed = list.splice(idx, 1)[0];
      saveLocal();
      renderGroomingHistory();
      if (db && removed.fbKey && !removed.fbKey.startsWith('loc_')) {
        remove(ref(db, `grooming_history/${action.category}/${removed.fbKey}`));
      }
    }
  }

  showToast(`↺ Reversed ${action.label}`);
}

// Firebase Synchronization
function setupFirebaseListeners() {
  if (!db) return;

  onValue(connectedRef, (snap) => {
    setSyncStatus(snap.val() === true);
  }, () => setSyncStatus(false));

  onValue(mealsConfigRef, (snap) => {
    if (snap.exists()) { meals = snap.val(); saveLocal(); }
    renderChecklist('morning');
    renderChecklist('evening');
    updateBadges();
  });

  onValue(dayRef('checked'), (snap) => {
    checked = snap.exists() ? snap.val() : {};
    saveLocal();
    renderChecklist('morning');
    renderChecklist('evening');
    updateCal();
    updateBadges();
  });

  onValue(dayRef('grooming_daily'), (snap) => {
    groomingChecked = snap.exists() ? snap.val() : {};
    saveLocal();
    renderGroomingDailyChecklist();
  });

  onValue(groomingHistoryRef, (snap) => {
    groomingHistory = { brush: [], bath: [], nails: [], fleatick: [], ears: [] };
    if (snap.exists()) {
      const data = snap.val();
      ['brush', 'bath', 'nails', 'fleatick', 'ears'].forEach(t => {
        if (data[t]) {
          groomingHistory[t] = Object.entries(data[t]).map(e => Object.assign({ fbKey: e[0] }, e[1]));
          groomingHistory[t].sort((a, b) => b.ts - a.ts);
        }
      });
    }
    saveLocal();
    renderGroomingHistory();
  });

  onValue(dayRef('activities'), (snap) => {
    activities = { walk: [], poo: [], water: [], play: [] };
    if (snap.exists()) {
      const data = snap.val();
      ['walk', 'poo', 'water', 'play'].forEach(t => {
        if (data[t]) activities[t] = Object.entries(data[t]).map(e => Object.assign({ fbKey: e[0] }, e[1]));
      });
    }
    saveLocal();
    ['walk', 'poo', 'water', 'play'].forEach(renderActivities);
    updateBadges();
  });

  onValue(logRef, (snap) => {
    logEntries = [];
    if (snap.exists()) logEntries = Object.values(snap.val()).sort((a, b) => b.ts - a.ts);
    saveLocal();
    renderLog();
  });

  onValue(weightRef, (snap) => {
    weightHistory = [];
    if (snap.exists()) {
      weightHistory = Object.entries(snap.val()).map(e => Object.assign({ fbKey: e[0] }, e[1]));
      weightHistory.sort((a, b) => a.date.localeCompare(b.date));
    }
    saveLocal();
    renderWeightHistory();
  });
}

// Render Meals Checklist
function renderChecklist(meal) {
  const container = document.getElementById('checklist-' + meal);
  if (!container || !meals[meal]) return;

  container.innerHTML = meals[meal].map(item => {
    const c = checked[item.id];
    return `<div class="check-item${c ? ' done' : ''}" data-id="${item.id}" data-kcal="${item.kcal}" data-meal="${meal}">
      <div class="check-box">${c ? '✓' : ''}</div>
      <span class="item-icon">${item.icon}</span>
      <div class="item-info">
        <div class="item-title">${item.label}</div>
        ${item.note ? `<div class="item-note">${item.note}</div>` : ''}
        ${c ? `<div class="item-who">${c.stamp}</div>` : ''}
      </div>
      <div class="item-kcal">${item.kcal > 0 ? item.kcal + ' kcal' : '0 kcal'}</div>
    </div>`;
  }).join('');

  container.querySelectorAll('.check-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const kcal = parseInt(el.dataset.kcal, 10) || 0;
      const label = el.querySelector('.item-title').textContent;

      if (checked[id]) {
        const prevVal = checked[id];
        delete checked[id];
        saveLocal();
        renderChecklist(meal);
        updateCal();
        updateBadges();
        pushUndoAction({ type: 'check', meal: meal, itemId: id, previousVal: prevVal, label: label });
        if (db) { const u = {}; u['checked/' + id] = null; update(dayRef(), u); }
        addLog(`Unmarked ${label}`);
        showToast(`Unmarked ${label}`, true);
      } else {
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const stamp = `${who} · ${t}`;
        checked[id] = { who: who, stamp: stamp, kcal: kcal };
        saveLocal();
        renderChecklist(meal);
        updateCal();
        updateBadges();
        pushUndoAction({ type: 'check', meal: meal, itemId: id, previousVal: null, label: label });
        if (db) { const u2 = {}; u2['checked/' + id] = { who: who, stamp: stamp, kcal: kcal }; update(dayRef(), u2); }
        addLog(`✓ ${label} (${who})`);
        showToast(`✓ Checked ${label}`, true);
      }
    });
  });
}

// Calorie Tracker
function updateCal() {
  let total = 0;
  Object.values(checked).forEach(v => { total += (v.kcal || 0); });
  const target = 324;
  const pct = Math.min((total / target) * 100, 100);

  const numEl = document.getElementById('calNum');
  if (numEl) numEl.innerHTML = `${total} <span>/ ${target} kcal</span>`;

  const fill = document.getElementById('calFill');
  if (fill) {
    fill.style.width = pct + '%';
    fill.className = 'fill' + (pct >= 100 ? ' over' : pct > 85 ? ' warn' : '');
  }

  const left = target - total;
  const noteEl = document.getElementById('calNote');
  if (noteEl) {
    if (left > 0) {
      noteEl.textContent = `${left} kcal remaining 👍`;
      hasTriggeredConfetti = false;
    } else if (left === 0) {
      noteEl.textContent = `✨ Daily goal reached! (324 kcal)`;
      if (!hasTriggeredConfetti) { triggerConfetti(1); hasTriggeredConfetti = true; }
    } else {
      noteEl.textContent = `Over by ${Math.abs(left)} kcal ⚠️`;
    }
  }
}

// Section Badges
function updateBadges() {
  const mornBadge = document.getElementById('morningBadge');
  if (mornBadge && meals.morning) {
    let done = 0;
    meals.morning.forEach(i => { if (checked[i.id]) done++; });
    mornBadge.textContent = `${done}/${meals.morning.length} Done`;
    mornBadge.classList.toggle('done', done === meals.morning.length && meals.morning.length > 0);
  }

  const eveBadge = document.getElementById('eveningBadge');
  if (eveBadge && meals.evening) {
    let done = 0;
    meals.evening.forEach(i => { if (checked[i.id]) done++; });
    eveBadge.textContent = `${done}/${meals.evening.length} Done`;
    eveBadge.classList.toggle('done', done === meals.evening.length && meals.evening.length > 0);
  }
}

// Daily Care Activities
function initActivityButtons() {
  document.querySelectorAll('.care-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const label = btn.dataset.label;
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const entry = { who: who, t: t, ts: Date.now(), fbKey: 'loc_' + Date.now() };

      if (!activities[type]) activities[type] = [];
      activities[type].push(entry);
      saveLocal();
      renderActivities(type);
      updateBadges();
      pushUndoAction({ type: 'activity', category: type, entry: entry, label: label });

      if (db) push(dayRef('activities/' + type), { who: who, t: t, ts: Date.now() });
      addLog(`✓ ${label} (${who})`);
      showToast(`✓ Logged ${label} with ${who}`, true);
    });
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => {
    if (!confirm("Reset today's checks for everyone?")) return;
    checked = {};
    activities = { walk: [], poo: [], water: [], play: [] };
    groomingChecked = {};
    saveLocal();

    renderChecklist('morning');
    renderChecklist('evening');
    renderGroomingDailyChecklist();
    ['walk', 'poo', 'water', 'play'].forEach(renderActivities);
    updateCal();
    updateBadges();

    if (db) {
      set(dayRef('checked'), null);
      set(dayRef('activities'), null);
      set(dayRef('grooming_daily'), null);
    }
    addLog(`Day reset by ${who}`);
    showToast('Reset today\'s checks');
  });
}

function renderActivities(type) {
  const countEl = document.getElementById('count-' + type);
  const list = activities[type] || [];
  if (countEl) countEl.textContent = list.length + ' today';
}

// Daily Grooming
function renderGroomingDailyChecklist() {
  const container = document.getElementById('checklist-grooming-daily');
  if (!container) return;

  container.innerHTML = groomingDailyItems.map(item => {
    const c = groomingChecked[item.id];
    return `<div class="check-item${c ? ' done' : ''}" data-id="${item.id}">
      <div class="check-box">${c ? '✓' : ''}</div>
      <span class="item-icon">${item.icon}</span>
      <div class="item-info">
        <div class="item-title">${item.label}</div>
        <div class="item-note">${item.note}</div>
        ${c ? `<div class="item-who">${c.stamp}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.check-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const label = el.querySelector('.item-title').textContent;

      if (groomingChecked[id]) {
        const prevVal = groomingChecked[id];
        delete groomingChecked[id];
        saveLocal();
        renderGroomingDailyChecklist();
        pushUndoAction({ type: 'grooming_daily', itemId: id, previousVal: prevVal, label: label });
        if (db) { const u = {}; u['grooming_daily/' + id] = null; update(dayRef(), u); }
        addLog(`Unmarked Grooming: ${label}`);
        showToast(`Unmarked ${label}`, true);
      } else {
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const stamp = `${who} · ${t}`;
        groomingChecked[id] = { who: who, stamp: stamp };
        saveLocal();
        renderGroomingDailyChecklist();
        pushUndoAction({ type: 'grooming_daily', itemId: id, previousVal: null, label: label });
        if (db) { const u2 = {}; u2['grooming_daily/' + id] = { who: who, stamp: stamp }; update(dayRef(), u2); }
        addLog(`✨ Grooming: ${label} (${who})`);
        showToast(`✓ Logged ${label}`, true);
      }
    });
  });
}

function initGroomingLoggers() {
  document.querySelectorAll('.log-grooming-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const label = btn.dataset.label;
      const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const entry = { who: who, date: dateStr, t: t, ts: Date.now(), fbKey: 'loc_' + Date.now() };

      if (!groomingHistory[type]) groomingHistory[type] = [];
      groomingHistory[type].unshift(entry);
      saveLocal();
      renderGroomingHistory();
      pushUndoAction({ type: 'grooming_history', category: type, entry: entry, label: label });

      if (db) push(ref(db, 'grooming_history/' + type), { who: who, date: dateStr, t: t, ts: Date.now() });
      addLog(`🛁 Grooming: ${label} (${who})`);
      showToast(`✓ Logged ${label}`, true);
    });
  });
}

function renderGroomingHistory() {
  const types = [
    { type: 'brush', metaId: 'last-brush-meta' },
    { type: 'bath', metaId: 'last-bath-meta' },
    { type: 'nails', metaId: 'last-nails-meta' },
    { type: 'fleatick', metaId: 'last-fleatick-meta' },
    { type: 'ears', metaId: 'last-ears-meta' }
  ];

  types.forEach(item => {
    const list = groomingHistory[item.type] || [];
    const metaEl = document.getElementById(item.metaId);
    if (!metaEl) return;
    if (list.length > 0) metaEl.textContent = `Last: ${list[0].date} by ${list[0].who}`;
    else metaEl.textContent = 'Never logged';
  });
}

// Log Section
function initLogSection() {
  document.getElementById('addNoteBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('noteInput');
    if (!inp.value.trim()) return;
    addLog(`Note: ${inp.value.trim()}`);
    inp.value = '';
    showToast('Note posted');
  });

  document.getElementById('noteInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('addNoteBtn').click();
  });

  document.getElementById('logFilterPerson')?.addEventListener('change', renderLog);
}

function addLog(text) {
  const entry = { text: text, who: who, ts: Date.now(), t: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
  logEntries.unshift(entry);
  saveLocal();
  renderLog();
  if (db) push(logRef, entry);
}

function renderLog() {
  const listEl = document.getElementById('logList');
  const filter = document.getElementById('logFilterPerson')?.value || 'all';
  if (!listEl) return;

  let filtered = logEntries;
  if (filter !== 'all') filtered = logEntries.filter(e => e.who === filter);

  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty-log">No activity logged today yet.</div>';
    return;
  }

  listEl.innerHTML = filtered.map(e => `
    <div class="log-entry">
      <div class="log-entry-top">
        <span class="log-who">${e.who}</span>
        <span class="log-time">${e.t}</span>
      </div>
      <div class="log-text">${e.text}</div>
    </div>
  `).join('');
}

// Weight Log
function initWeightSection() {
  document.getElementById('saveWeightBtn')?.addEventListener('click', () => {
    const val = parseFloat(document.getElementById('weightInput').value);
    const date = document.getElementById('weightDate').value;
    if (!val || isNaN(val) || !date) { alert('Enter weight and date.'); return; }

    const entry = { val: val, date: date, who: who, fbKey: 'loc_' + Date.now() };
    weightHistory.push(entry);
    weightHistory.sort((a, b) => a.date.localeCompare(b.date));
    saveLocal();
    renderWeightHistory();

    if (db) push(weightRef, { val: val, date: date, who: who });
    document.getElementById('weightInput').value = '';
    showToast(`Saved weight: ${val} lbs`);
  });
}

function renderWeightHistory() {
  const listEl = document.getElementById('weightHistoryList');
  const chartWrap = document.getElementById('weightChartWrap');
  if (!listEl) return;

  if (!weightHistory.length) {
    listEl.innerHTML = '<div class="empty-log">No weight entries yet.</div>';
    if (chartWrap) chartWrap.style.display = 'none';
    return;
  }

  const latest = weightHistory[weightHistory.length - 1];
  const curDisp = document.getElementById('currentWeightDisplay');
  const headDisp = document.getElementById('headerStats');
  if (curDisp) curDisp.textContent = latest.val.toFixed(1);
  if (headDisp) headDisp.textContent = `${latest.val.toFixed(1)} lb · 324 kcal/day`;

  if (weightHistory.length >= 2 && chartWrap) {
    chartWrap.style.display = 'block';
    drawWeightChart();
  }

  const reversed = weightHistory.slice().reverse();
  listEl.innerHTML = reversed.map((e, i) => {
    const dateLabel = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<div class="info-item">
      <span>${dateLabel} (${e.who || 'Family'})</span>
      <strong>${e.val.toFixed(1)} lbs</strong>
    </div>`;
  }).join('');
}

function drawWeightChart() {
  const svg = document.getElementById('weightChart');
  if (!svg || !svg.parentElement) return;
  const W = Math.max(svg.parentElement.clientWidth - 24, 200);
  const H = 90;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const vals = weightHistory.map(e => e.val);
  const minV = Math.min(...vals) - 0.4;
  const maxV = Math.max(...vals) + 0.4;
  const n = vals.length;

  const px = i => n === 1 ? W / 2 : (i / (n - 1)) * (W - 24) + 12;
  const py = v => H - 16 - ((v - minV) / (maxV - minV)) * (H - 28);

  const pathD = vals.map((v, i) => (i === 0 ? 'M' : 'L') + px(i).toFixed(1) + ',' + py(v).toFixed(1)).join(' ');
  const dots = vals.map((v, i) => `<circle cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="4" fill="#FF6B35"/>`).join('');

  svg.innerHTML = `<path d="${pathD}" fill="none" stroke="#FF6B35" stroke-width="2"/>` + dots;
}

// Modals
function initModalDialogs() {
  const treatModal = document.getElementById('treatModal');
  if (treatModal) {
    document.getElementById('openTreatModalBtn')?.addEventListener('click', () => treatModal.showModal());
    document.getElementById('closeTreatModalBtn')?.addEventListener('click', () => treatModal.close());

    document.getElementById('saveTreatBtn')?.addEventListener('click', () => {
      const nameInp = document.getElementById('treatNameInput');
      const kcalInp = document.getElementById('treatKcalInput');
      const label = nameInp.value.trim() || 'Snack';
      const kcal = parseInt(kcalInp.value, 10) || 15;
      const treatId = 'treat_' + Date.now();

      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const stamp = `${who} · ${t}`;

      checked[treatId] = { who: who, stamp: stamp, kcal: kcal, customLabel: label };
      saveLocal();
      updateCal();
      updateBadges();

      pushUndoAction({ type: 'check', meal: 'morning', itemId: treatId, previousVal: null, label: label });

      if (db) {
        const u = {}; u['checked/' + treatId] = { who: who, stamp: stamp, kcal: kcal };
        update(dayRef(), u);
      }

      addLog(`🍖 Treat: ${label} (+${kcal} kcal) by ${who}`);
      treatModal.close();
      nameInp.value = '';
      showToast(`✓ Logged ${label} (+${kcal} kcal)`, true);
    });
  }

  const vetModal = document.getElementById('vetReportModal');
  if (vetModal) {
    document.getElementById('exportVetBtn')?.addEventListener('click', () => {
      const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const latestWeight = weightHistory.length ? weightHistory[weightHistory.length - 1].val.toFixed(1) : '17.2';

      let text = `GEDDY VET REPORT (${reportDate})\n`;
      text += `Current Weight: ${latestWeight} lbs | BCS: 6.5/9\nDaily Calories: 324 kcal/day\n\n`;
      text += `Recent Weight History:\n`;
      weightHistory.slice(-5).reverse().forEach(w => text += `- ${w.date}: ${w.val.toFixed(1)} lbs\n`);
      text += `\nRecent Activity Notes:\n`;
      logEntries.slice(0, 5).forEach(l => text += `- [${l.t}] (${l.who}) ${l.text}\n`);

      document.getElementById('vetReportText').value = text;
      vetModal.showModal();
    });
    document.getElementById('closeVetModalBtn')?.addEventListener('click', () => vetModal.close());
    document.getElementById('copyVetReportBtn')?.addEventListener('click', () => {
      const area = document.getElementById('vetReportText');
      area.select();
      navigator.clipboard.writeText(area.value);
      showToast('Report copied!');
    });
  }
}

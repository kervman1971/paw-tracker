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

// Initialize Firebase
let app, db;
let isFirebaseConnected = false;

try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.error("Firebase init error:", e);
}

// Helpers
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
let userColors = { Kevin: '#FF6B35', Jessica: '#EC4899', Zoe: '#8B5CF6', Adam: '#3B82F6' };

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
let actionHistory = []; // Stack of undoable actions
let hasTriggeredConfetti = false;

// Local Storage Sync Helpers
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

  // Initial Render from local / default state
  renderChecklist('morning');
  renderChecklist('evening');
  renderGroomingDailyChecklist();
  renderGroomingHistory();
  ['walk', 'poo', 'water', 'play'].forEach(renderActivities);
  renderLog();
  renderWeightHistory();
  updateCal();
  updateProgress();
  updateSummary();

  // Initialize UI Event Listeners
  initWhoButtons();
  initTabs();
  initFoodEditors();
  initActivityButtons();
  initGroomingLoggers();
  initLogSection();
  initWeightSection();
  initModalDialogs();
  initAccordions();
  initSummaryCardButtons();

  // Global Undo button listener
  document.getElementById('globalUndoBtn')?.addEventListener('click', () => {
    undoLastAction();
  });

  // Paw Avatar interaction
  document.getElementById('pawAvatar').addEventListener('click', () => {
    triggerConfetti(0.3);
    showToast('Woof! Geddy loves you! 🐾');
  });

  // Setup Firebase Realtime Connection & Listeners
  setupFirebaseListeners();
});

// ---- SUMMARY CARD QUICK ACTION BUTTONS ----
function initSummaryCardButtons() {
  // 1. Meals Card -> Scroll to & expand meals
  const mealsCard = document.getElementById('sum-meals');
  if (mealsCard) {
    mealsCard.addEventListener('click', () => {
      const mornSec = document.getElementById('section-morning');
      const eveSec = document.getElementById('section-evening');
      
      let morningDone = false;
      if (meals.morning) {
        let count = 0;
        meals.morning.forEach(i => { if (checked[i.id]) count++; });
        morningDone = (count === meals.morning.length && meals.morning.length > 0);
      }

      if (morningDone && eveSec) {
        eveSec.classList.add('open');
        eveSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (mornSec) {
        mornSec.classList.add('open');
        mornSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      showToast('Navigated to Meals');
    });
  }

  // 2. Walks Card -> Log walk directly & expand care
  const walkCard = document.getElementById('sum-walk');
  if (walkCard) {
    walkCard.addEventListener('click', () => {
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const entry = { who: who, t: t, ts: Date.now(), fbKey: 'loc_' + Date.now() };

      if (!activities.walk) activities.walk = [];
      activities.walk.push(entry);
      saveLocal();
      renderActivities('walk');
      updateProgress();
      updateSummary();
      pushUndoAction({ type: 'activity', category: 'walk', entry: entry, label: 'Walk' });

      if (db) push(dayRef('activities/walk'), { who: who, t: t, ts: Date.now() }).catch(err => handleFirebaseError(err, 'Log walk shortcut'));
      addLog(`✓ Walk (${who})`);
      showToast(`✓ Logged Walk with ${who}!`, true);

      const careSec = document.getElementById('section-care');
      if (careSec) careSec.classList.add('open');
    });
  }

  // 3. Poos Card -> Log poo directly & expand care
  const pooCard = document.getElementById('sum-poo');
  if (pooCard) {
    pooCard.addEventListener('click', () => {
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const entry = { who: who, t: t, ts: Date.now(), fbKey: 'loc_' + Date.now() };

      if (!activities.poo) activities.poo = [];
      activities.poo.push(entry);
      saveLocal();
      renderActivities('poo');
      updateProgress();
      updateSummary();
      pushUndoAction({ type: 'activity', category: 'poo', entry: entry, label: 'Poo' });

      if (db) push(dayRef('activities/poo'), { who: who, t: t, ts: Date.now() }).catch(err => handleFirebaseError(err, 'Log poo shortcut'));
      addLog(`✓ Poo (${who})`);
      showToast(`✓ Logged Poo with ${who}!`, true);

      const careSec = document.getElementById('section-care');
      if (careSec) careSec.classList.add('open');
    });
  }

  // 4. Pill Card -> Toggle Allergy Pill item
  const pillCard = document.getElementById('sum-pill');
  if (pillCard) {
    pillCard.addEventListener('click', () => {
      const pillId = 'pill';
      const mornSec = document.getElementById('section-morning');
      if (mornSec) mornSec.classList.add('open');

      if (checked[pillId]) {
        const prevVal = checked[pillId];
        delete checked[pillId];
        saveLocal();
        renderChecklist('morning');
        updateCal();
        updateProgress();
        updateSummary();
        pushUndoAction({ type: 'check', meal: 'morning', itemId: pillId, previousVal: prevVal, label: 'Allergy Pill' });

        if (db) {
          const u = {}; u['checked/' + pillId] = null;
          update(dayRef(), u).catch(err => handleFirebaseError(err, 'Uncheck pill'));
        }
        addLog(`Unmarked: Allergy Pill`);
        showToast('Unmarked Allergy Pill', true);
      } else {
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const stamp = `${who} · ${t}`;
        checked[pillId] = { who: who, stamp: stamp, kcal: 0 };
        saveLocal();
        renderChecklist('morning');
        updateCal();
        updateProgress();
        updateSummary();
        pushUndoAction({ type: 'check', meal: 'morning', itemId: pillId, previousVal: null, label: 'Allergy Pill' });

        if (db) {
          const u2 = {}; u2['checked/' + pillId] = { who: who, stamp: stamp, kcal: 0 };
          update(dayRef(), u2).catch(err => handleFirebaseError(err, 'Check pill'));
        }
        addLog(`✓ Allergy Pill (${who})`);
        showToast(`✓ Checked Allergy Pill (${who})`, true);
      }
    });
  }
}

// ---- ACCORDION COLLAPSIBLE NAVIGATION ----
function initAccordions() {
  document.querySelectorAll('.accordion-header[data-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const secId = header.dataset.toggle;
      const sec = document.getElementById(secId);
      if (sec) {
        sec.classList.toggle('open');
      }
    });
  });
}

function updateAccordionTags() {
  // Morning tag
  const morningTag = document.getElementById('morningStatusTag');
  if (morningTag && meals.morning) {
    let done = 0;
    meals.morning.forEach(i => { if (checked[i.id]) done++; });
    const total = meals.morning.length;
    morningTag.textContent = `${done}/${total} Done`;
    morningTag.classList.toggle('complete', done === total && total > 0);

    // Auto collapse morning section if 100% complete
    const morningSec = document.getElementById('section-morning');
    if (morningSec && done === total && total > 0 && !morningSec.dataset.userToggled) {
      morningSec.classList.remove('open');
    }
  }

  // Evening tag
  const eveningTag = document.getElementById('eveningStatusTag');
  if (eveningTag && meals.evening) {
    let done = 0;
    meals.evening.forEach(i => { if (checked[i.id]) done++; });
    const total = meals.evening.length;
    eveningTag.textContent = `${done}/${total} Done`;
    eveningTag.classList.toggle('complete', done === total && total > 0);
  }

  // Daily Care tag
  const careTag = document.getElementById('careStatusTag');
  if (careTag) {
    let actDone = 0;
    ['walk', 'poo', 'water', 'play'].forEach(t => { actDone += (activities[t] || []).length; });
    careTag.textContent = `${actDone} Logged Today`;
    careTag.classList.toggle('complete', actDone > 0);
  }
}

// ---- SYNC BANNER STATE ----
function setSync(state, msg) {
  const b = document.getElementById('syncBanner');
  const t = document.getElementById('syncText');
  if (!b || !t) return;
  b.className = 'sync-banner ' + state;
  t.textContent = msg;
}

// ---- UNDO ACTION SYSTEM ----
function pushUndoAction(action) {
  actionHistory.push(action);
  updateUndoButtonUI();
}

function updateUndoButtonUI() {
  const btn = document.getElementById('globalUndoBtn');
  if (!btn) return;
  if (actionHistory.length > 0) {
    btn.style.display = 'inline-flex';
    btn.textContent = `↺ Undo (${actionHistory.length})`;
  } else {
    btn.style.display = 'none';
  }
}

function undoLastAction() {
  if (actionHistory.length === 0) {
    showToast('Nothing to undo!');
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
    if (idx === -1 && list.length > 0) {
      idx = list.length - 1; // Fallback to last activity item
    }
    if (idx !== -1 && list.length > 0) {
      const removed = list.splice(idx, 1)[0];
      saveLocal();
      renderActivities(action.category);
      updateProgress();
      updateSummary();
      if (db && removed.fbKey && !removed.fbKey.startsWith('loc_')) {
        remove(ref(db, `days/${TODAY}/activities/${action.category}/${removed.fbKey}`)).catch(err => handleFirebaseError(err, 'Undo activity'));
      }
    }
  } else if (action.type === 'check') {
    if (action.previousVal) {
      checked[action.itemId] = action.previousVal;
    } else {
      delete checked[action.itemId];
    }
    saveLocal();
    renderChecklist(action.meal);
    updateCal();
    updateProgress();
    updateSummary();
    if (db) {
      const u = {};
      u['checked/' + action.itemId] = action.previousVal || null;
      update(dayRef(), u).catch(err => handleFirebaseError(err, 'Undo check'));
    }
  } else if (action.type === 'grooming_daily') {
    if (action.previousVal) {
      groomingChecked[action.itemId] = action.previousVal;
    } else {
      delete groomingChecked[action.itemId];
    }
    saveLocal();
    renderGroomingDailyChecklist();
    if (db) {
      const u = {};
      u['grooming_daily/' + action.itemId] = action.previousVal || null;
      update(dayRef(), u).catch(err => handleFirebaseError(err, 'Undo grooming daily'));
    }
  } else if (action.type === 'grooming_history') {
    const list = groomingHistory[action.category] || [];
    let idx = -1;
    if (action.entry) {
      idx = list.findIndex(e => (action.entry.fbKey && e.fbKey === action.entry.fbKey) || (action.entry.ts && e.ts === action.entry.ts));
    }
    if (idx === -1 && list.length > 0) {
      idx = 0; // Grooming history is sorted newest first
    }
    if (idx !== -1 && list.length > 0) {
      const removed = list.splice(idx, 1)[0];
      saveLocal();
      renderGroomingHistory();
      if (db && removed.fbKey && !removed.fbKey.startsWith('loc_')) {
        remove(ref(db, `grooming_history/${action.category}/${removed.fbKey}`)).catch(err => handleFirebaseError(err, 'Undo grooming history'));
      }
    }
  }

  showToast(`↺ Reversed: ${action.label}`);
}

// ---- TOAST NOTIFICATIONS ----
function showToast(msg, canUndo = false) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  // Clear any existing toasts to avoid clutter
  container.innerHTML = '';
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  if (canUndo) {
    toast.innerHTML = `<span>${msg}</span> <button class="toast-undo-action" style="background:#FF6B35;color:#fff;border:none;padding:4px 12px;border-radius:99px;font-weight:900;cursor:pointer;margin-left:10px;">↺ Undo</button>`;
    const btn = toast.querySelector('.toast-undo-action');
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
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 10000); // 10 seconds display time
}

// ---- CONFETTI ANIMATION ----
function triggerConfetti(ratio = 1) {
  if (typeof window.confetti === 'function') {
    window.confetti({
      particleCount: Math.floor(60 * ratio),
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

// ---- WHO BUTTONS ----
function initWhoButtons() {
  document.querySelectorAll('.who-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      who = btn.dataset.who;
      document.querySelectorAll('.who-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast(`Switched active caregiver to ${who}`);
    });
  });
}

// ---- TABS ----
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      document.getElementById(tab).classList.add('active');
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
    });
  });
}

// ---- FIREBASE REALTIME LISTENERS ----
function setupFirebaseListeners() {
  if (!db) return;

  // Monitor Connection Status
  onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      isFirebaseConnected = true;
      setSync('live', 'Live — Realtime Family Sync');
    } else {
      isFirebaseConnected = false;
      setSync('connecting', 'Connecting to Firebase...');
    }
  }, (err) => {
    handleFirebaseError(err, 'Connection status');
  });

  // Meals config (shared)
  onValue(mealsConfigRef, (snap) => {
    if (snap.exists()) {
      meals = snap.val();
      saveLocal();
    }
    renderChecklist('morning');
    renderChecklist('evening');
    updateProgress();
    updateSummary();
  }, (err) => handleFirebaseError(err, 'Meals config'));

  // Checked meal items (today)
  onValue(dayRef('checked'), (snap) => {
    checked = snap.exists() ? snap.val() : {};
    saveLocal();
    renderChecklist('morning');
    renderChecklist('evening');
    updateCal();
    updateProgress();
    updateSummary();
  }, (err) => handleFirebaseError(err, 'Checked meals'));

  // Grooming checked items (today)
  onValue(dayRef('grooming_daily'), (snap) => {
    groomingChecked = snap.exists() ? snap.val() : {};
    saveLocal();
    renderGroomingDailyChecklist();
  }, (err) => handleFirebaseError(err, 'Grooming daily'));

  // Grooming long-term history
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
  }, (err) => handleFirebaseError(err, 'Grooming history'));

  // Activities (today)
  onValue(dayRef('activities'), (snap) => {
    activities = { walk: [], poo: [], water: [], play: [] };
    if (snap.exists()) {
      const data = snap.val();
      ['walk', 'poo', 'water', 'play'].forEach(t => {
        if (data[t]) {
          activities[t] = Object.entries(data[t]).map(e => Object.assign({ fbKey: e[0] }, e[1]));
        }
      });
    }
    saveLocal();
    ['walk', 'poo', 'water', 'play'].forEach(renderActivities);
    updateProgress();
    updateSummary();
  }, (err) => handleFirebaseError(err, 'Activities'));

  // Activity Log
  onValue(logRef, (snap) => {
    logEntries = [];
    if (snap.exists()) {
      logEntries = Object.values(snap.val()).sort((a, b) => b.ts - a.ts);
    }
    saveLocal();
    renderLog();
  }, (err) => handleFirebaseError(err, 'Log'));

  // Weight History
  onValue(weightRef, (snap) => {
    weightHistory = [];
    if (snap.exists()) {
      weightHistory = Object.entries(snap.val()).map(e => Object.assign({ fbKey: e[0] }, e[1]));
      weightHistory.sort((a, b) => a.date.localeCompare(b.date));
    }
    saveLocal();
    renderWeightHistory();
  }, (err) => handleFirebaseError(err, 'Weight'));
}

function handleFirebaseError(err, source) {
  console.warn(`Firebase Error [${source}]:`, err);
  if (err && err.code === 'PERMISSION_DENIED') {
    setSync('error', 'Firebase Permission Denied (Check Security Rules)');
  } else {
    setSync('error', 'Offline / Connection Issue (Using Local Storage)');
  }
}

// ---- FOOD EDITORS ----
function initFoodEditors() {
  document.querySelectorAll('.edit-food-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const meal = btn.dataset.meal;
      const panel = document.getElementById('edit-' + meal);
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) renderEditPanel(meal);
    });
  });

  document.querySelectorAll('.add-food-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const meal = btn.dataset.meal;
      meals[meal].push({ icon: '🦴', label: 'New Item', kcal: 10, note: '', id: 'item_' + Date.now() });
      renderEditPanel(meal);
    });
  });

  document.querySelectorAll('.save-food-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const meal = btn.dataset.meal;
      const rows = document.querySelectorAll(`#edit-${meal}-items .food-edit-row`);
      const newItems = [];
      rows.forEach((row, i) => {
        const labelEl = row.querySelector('.food-label-input');
        const kcalEl = row.querySelector('.food-kcal-input');
        const iconEl = row.querySelector('.food-icon-select');
        const noteEl = row.querySelector('.food-note-input');
        if (labelEl && labelEl.value.trim()) {
          newItems.push({
            icon: iconEl ? iconEl.value : '🦴',
            label: labelEl.value.trim(),
            kcal: parseInt(kcalEl ? kcalEl.value : 0, 10) || 0,
            note: noteEl ? noteEl.value.trim() : '',
            id: meals[meal][i] ? meals[meal][i].id : 'item_' + Date.now() + '_' + i
          });
        }
      });
      meals[meal] = newItems;
      saveLocal();
      if (db) set(mealsConfigRef, meals).catch(err => handleFirebaseError(err, 'Save meals'));
      document.getElementById('edit-' + meal).classList.remove('open');
      renderChecklist(meal);
      showToast('Saved menu updates!');
    });
  });
}

function renderEditPanel(meal) {
  const container = document.getElementById(`edit-${meal}-items`);
  const icons = ['🥣', '🍠', '🥩', '🦴', '🟢', '💊', '🐟', '🧀', '🥕', '🫐', '🍗', '🥚', '🌿', '🍖', '🐾'];
  container.innerHTML = meals[meal].map((item, i) => {
    const iconOpts = icons.map(ic => `<option value="${ic}"${ic === item.icon ? ' selected' : ''}>${ic}</option>`).join('');
    return `<div class="food-edit-row">
      <select class="food-icon-select">${iconOpts}</select>
      <input type="text" class="food-label-input" value="${item.label}" placeholder="Item name" />
      <input type="number" class="food-kcal-input" value="${item.kcal}" placeholder="kcal" min="0" max="999" />
      <input type="text" class="food-note-input" value="${item.note || ''}" placeholder="note" style="flex:1;min-width:60px;" />
      <button class="del-item-btn" data-meal="${meal}" data-idx="${i}">&times;</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.del-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      meals[btn.dataset.meal].splice(parseInt(btn.dataset.idx, 10), 1);
      renderEditPanel(btn.dataset.meal);
    });
  });
}

// ---- MEAL CHECKLIST RENDERER ----
function renderChecklist(meal) {
  const container = document.getElementById('checklist-' + meal);
  if (!container || !meals[meal]) return;

  container.innerHTML = meals[meal].map(item => {
    const c = checked[item.id];
    return `<div class="check-item${c ? ' done' : ''}" data-id="${item.id}" data-kcal="${item.kcal}" data-meal="${meal}">
      <div class="check-box"><span class="checkmark">✓</span></div>
      <span class="item-icon">${item.icon}</span>
      <div class="item-body">
        <div class="item-label">${item.label}</div>
        ${item.note ? `<div class="item-sub">${item.note}</div>` : ''}
        <div class="item-who">${c ? c.stamp : ''}</div>
      </div>
      <div class="kcal-pill">${item.kcal > 0 ? '~' + item.kcal + ' kcal' : '0 kcal'}</div>
    </div>`;
  }).join('');

  container.querySelectorAll('.check-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const kcal = parseInt(el.dataset.kcal, 10) || 0;
      const label = el.querySelector('.item-label').textContent;

      if (checked[id]) {
        const prevVal = checked[id];
        delete checked[id];
        saveLocal();
        renderChecklist(meal);
        updateCal();
        updateProgress();
        updateSummary();
        pushUndoAction({ type: 'check', meal: meal, itemId: id, previousVal: prevVal, label: label });

        if (db) {
          const u = {}; u['checked/' + id] = null;
          update(dayRef(), u).catch(err => handleFirebaseError(err, 'Uncheck meal'));
        }
        addLog(`Unmarked: ${label}`);
        showToast(`Unmarked ${label}`, true);
      } else {
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const stamp = `${who} · ${t}`;
        checked[id] = { who: who, stamp: stamp, kcal: kcal };
        saveLocal();
        renderChecklist(meal);
        updateCal();
        updateProgress();
        updateSummary();
        pushUndoAction({ type: 'check', meal: meal, itemId: id, previousVal: null, label: label });

        if (db) {
          const u2 = {}; u2['checked/' + id] = { who: who, stamp: stamp, kcal: kcal };
          update(dayRef(), u2).catch(err => handleFirebaseError(err, 'Check meal'));
        }
        addLog(`✓ ${label} (${who})${kcal ? ' (+' + kcal + ' kcal)' : ''}`);
        showToast(`✓ Checked ${label}`, true);
      }
    });
  });
}

// ---- CALORIE TRACKER & CONFETTI ----
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
      noteEl.textContent = `✨ Perfect! 324 kcal daily target reached!`;
      if (!hasTriggeredConfetti) {
        triggerConfetti(1);
        hasTriggeredConfetti = true;
      }
    } else {
      noteEl.textContent = `Over target by ${Math.abs(left)} kcal ⚠️`;
    }
  }
}

// ---- ACTIVITIES ----
function initActivityButtons() {
  document.querySelectorAll('.add-activity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const label = btn.dataset.label;
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const entry = { who: who, t: t, ts: Date.now(), fbKey: 'loc_' + Date.now() };

      if (!activities[type]) activities[type] = [];
      activities[type].push(entry);
      saveLocal();
      renderActivities(type);
      updateProgress();
      updateSummary();
      pushUndoAction({ type: 'activity', category: type, entry: entry, label: label });

      if (db) push(dayRef('activities/' + type), { who: who, t: t, ts: Date.now() }).catch(err => handleFirebaseError(err, 'Add activity'));
      addLog(`✓ ${label} (${who})`);
      showToast(`Logged ${label} with ${who}`, true);
    });
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm("Reset all of today's checklist and care activities for everyone?")) return;
    checked = {};
    activities = { walk: [], poo: [], water: [], play: [] };
    groomingChecked = {};
    saveLocal();

    renderChecklist('morning');
    renderChecklist('evening');
    renderGroomingDailyChecklist();
    ['walk', 'poo', 'water', 'play'].forEach(renderActivities);
    updateCal();
    updateProgress();
    updateSummary();

    if (db) {
      set(dayRef('checked'), null);
      set(dayRef('activities'), null);
      set(dayRef('grooming_daily'), null);
    }
    addLog(`Day reset by ${who}`);
    showToast('Reset today\'s checklist');
  });
}

function renderActivities(type) {
  const container = document.getElementById('entries-' + type);
  const count = document.getElementById('count-' + type);
  const list = activities[type] || [];
  if (count) count.textContent = list.length + ' today';
  if (!container) return;

  container.innerHTML = list.map((e, idx) => {
    return `<div class="activity-entry">
      <span>${e.who} · ${e.t}</span>
      <button class="remove-entry" data-type="${type}" data-idx="${idx}" data-fbkey="${e.fbKey || ''}">&times;</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.remove-entry').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const fbKey = btn.dataset.fbkey;
      activities[type].splice(idx, 1);
      saveLocal();
      renderActivities(type);
      updateProgress();
      updateSummary();

      if (db && fbKey && !fbKey.startsWith('loc_')) {
        remove(ref(db, `days/${TODAY}/activities/${btn.dataset.type}/${fbKey}`)).catch(err => handleFirebaseError(err, 'Remove activity'));
      }
    });
  });
}

// ---- GROOMING ROUTINE LOGIC ----
function renderGroomingDailyChecklist() {
  const container = document.getElementById('checklist-grooming-daily');
  if (!container) return;

  container.innerHTML = groomingDailyItems.map(item => {
    const c = groomingChecked[item.id];
    return `<div class="check-item${c ? ' done' : ''}" data-id="${item.id}">
      <div class="check-box"><span class="checkmark">✓</span></div>
      <span class="item-icon">${item.icon}</span>
      <div class="item-body">
        <div class="item-label">${item.label}</div>
        <div class="item-sub">${item.note}</div>
        <div class="item-who">${c ? c.stamp : ''}</div>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.check-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const label = el.querySelector('.item-label').textContent;

      if (groomingChecked[id]) {
        delete groomingChecked[id];
        saveLocal();
        renderGroomingDailyChecklist();
        if (db) {
          const u = {}; u['grooming_daily/' + id] = null;
          update(dayRef(), u).catch(err => handleFirebaseError(err, 'Unmark grooming'));
        }
        addLog(`Unmarked Grooming: ${label}`);
      } else {
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const stamp = `${who} · ${t}`;
        groomingChecked[id] = { who: who, stamp: stamp };
        saveLocal();
        renderGroomingDailyChecklist();
        if (db) {
          const u2 = {}; u2['grooming_daily/' + id] = { who: who, stamp: stamp };
          update(dayRef(), u2).catch(err => handleFirebaseError(err, 'Check grooming'));
        }
        addLog(`✨ Grooming Done: ${label} (${who})`);
        showToast(`Logged ${label}!`);
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

      if (db) push(ref(db, 'grooming_history/' + type), { who: who, date: dateStr, t: t, ts: Date.now() }).catch(err => handleFirebaseError(err, 'Log grooming'));
      addLog(`🛁 Grooming Logged: ${label} by ${who}`);
      showToast(`Logged ${label}!`);
    });
  });
}

function renderGroomingHistory() {
  const types = [
    { type: 'brush', metaId: 'last-brush-meta', listId: 'history-brush', name: 'Coat Brushing' },
    { type: 'bath', metaId: 'last-bath-meta', listId: 'history-bath', name: 'Bath Time' },
    { type: 'nails', metaId: 'last-nails-meta', listId: 'history-nails', name: 'Nail Trim' },
    { type: 'fleatick', metaId: 'last-fleatick-meta', listId: 'history-fleatick', name: 'Flea & Tick' },
    { type: 'ears', metaId: 'last-ears-meta', listId: 'history-ears', name: 'Ear Cleaning' }
  ];

  types.forEach(item => {
    const list = groomingHistory[item.type] || [];
    const metaEl = document.getElementById(item.metaId);
    const listEl = document.getElementById(item.listId);
    if (!metaEl || !listEl) return;

    if (list.length > 0) {
      const latest = list[0];
      metaEl.textContent = `Last done: ${latest.date} by ${latest.who}`;
      listEl.innerHTML = list.slice(0, 3).map((e, idx) => `
        <div class="activity-entry" style="background:#ECFDF5; color:#10B981;">
          <span>${e.date} (${e.t}) · ${e.who}</span>
          <button class="remove-entry" data-type="${item.type}" data-idx="${idx}" data-fbkey="${e.fbKey || ''}">&times;</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.remove-entry').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx, 10);
          const fbKey = btn.dataset.fbkey;
          groomingHistory[item.type].splice(idx, 1);
          saveLocal();
          renderGroomingHistory();

          if (db && fbKey && !fbKey.startsWith('loc_')) {
            remove(ref(db, `grooming_history/${btn.dataset.type}/${fbKey}`)).catch(err => handleFirebaseError(err, 'Remove grooming history'));
          }
        });
      });
    } else {
      metaEl.textContent = 'Never logged';
      listEl.innerHTML = '';
    }
  });
}

// ---- ACTIVITY LOG SECTION ----
function initLogSection() {
  document.getElementById('addNoteBtn').addEventListener('click', () => {
    const inp = document.getElementById('noteInput');
    if (!inp.value.trim()) return;
    addLog(`Note: ${inp.value.trim()}`);
    inp.value = '';
    showToast('Note added to log');
  });

  document.getElementById('noteInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('addNoteBtn').click();
  });

  document.getElementById('logFilterPerson').addEventListener('change', () => {
    renderLog();
  });
}

function addLog(text) {
  const entry = { text: text, who: who, ts: Date.now(), t: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
  logEntries.unshift(entry);
  saveLocal();
  renderLog();

  if (db) push(logRef, entry).catch(err => handleFirebaseError(err, 'Add log entry'));
}

function renderLog() {
  const listEl = document.getElementById('logList');
  const filter = document.getElementById('logFilterPerson') ? document.getElementById('logFilterPerson').value : 'all';
  if (!listEl) return;

  let filtered = logEntries;
  if (filter !== 'all') {
    filtered = logEntries.filter(e => e.who === filter);
  }

  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty-log">🐾 No activity matching filter today!</div>';
    return;
  }

  listEl.innerHTML = filtered.map(e => `
    <div class="log-entry">
      <div class="log-entry-top">
        <span class="log-who" style="color: ${userColors[e.who] || '#FF6B35'};">${e.who}</span>
        <span class="log-time">${e.t}</span>
      </div>
      <div class="log-text">${e.text}</div>
    </div>
  `).join('');
}

// ---- WEIGHT SECTION & SVG CHART ----
function initWeightSection() {
  document.getElementById('saveWeightBtn').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('weightInput').value);
    const date = document.getElementById('weightDate').value;
    const note = document.getElementById('weightNote').value.trim();

    if (!val || isNaN(val) || !date) {
      alert('Please enter a valid weight and date.');
      return;
    }

    const entry = { val: val, date: date, note: note, who: who, fbKey: 'loc_' + Date.now() };
    weightHistory.push(entry);
    weightHistory.sort((a, b) => a.date.localeCompare(b.date));
    saveLocal();
    renderWeightHistory();

    if (db) push(weightRef, { val: val, date: date, note: note, who: who }).catch(err => handleFirebaseError(err, 'Save weight'));
    document.getElementById('weightInput').value = '';
    document.getElementById('weightNote').value = '';
    showToast(`Saved weight entry: ${val} lbs`);
  });
}

function renderWeightHistory() {
  const listEl = document.getElementById('weightHistoryList');
  const chartWrap = document.getElementById('weightChartWrap');
  if (!listEl || !chartWrap) return;

  if (!weightHistory.length) {
    listEl.innerHTML = '<div class="empty-log">⚖️ No weight entries logged yet. Add Geddy\'s first entry above!</div>';
    chartWrap.style.display = 'none';
    return;
  }

  const latest = weightHistory[weightHistory.length - 1];
  const curDisp = document.getElementById('currentWeightDisplay');
  const headDisp = document.getElementById('headerStats');
  if (curDisp) curDisp.textContent = latest.val.toFixed(1);
  if (headDisp) headDisp.textContent = `${latest.val.toFixed(1)} lb · BCS 6.5/9 · 324 kcal/day`;

  if (weightHistory.length >= 2) {
    chartWrap.style.display = 'block';
    drawWeightChart();
  } else {
    chartWrap.style.display = 'none';
  }

  const reversed = weightHistory.slice().reverse();
  listEl.innerHTML = reversed.map((e, i) => {
    const prev = reversed[i + 1];
    let deltaHtml = '';
    if (prev) {
      const diff = e.val - prev.val;
      const sign = diff > 0 ? '+' : '';
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
      deltaHtml = `<span class="weight-delta ${cls}">${sign}${diff.toFixed(1)} lb</span>`;
    }
    const dateLabel = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const noteHtml = e.note ? `<div class="weight-note-text">${e.note}${e.who ? ' · ' + e.who : ''}</div>` : (e.who ? `<div class="weight-note-text">${e.who}</div>` : '');

    return `<div class="weight-history-entry">
      <div>
        <div class="weight-entry-left">
          <span class="weight-val">${e.val.toFixed(1)} lb</span>
          <span class="weight-date">${dateLabel}</span>
        </div>
        ${noteHtml}
      </div>
      <div class="weight-entry-right">
        ${deltaHtml}
        <button class="remove-entry" data-idx="${weightHistory.length - 1 - i}" data-fbkey="${e.fbKey || ''}">&times;</button>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.remove-entry').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Remove this weight entry?')) return;
      const idx = parseInt(btn.dataset.idx, 10);
      const fbKey = btn.dataset.fbkey;
      weightHistory.splice(idx, 1);
      saveLocal();
      renderWeightHistory();

      if (db && fbKey && !fbKey.startsWith('loc_')) {
        remove(ref(db, 'weight/' + fbKey)).catch(err => handleFirebaseError(err, 'Remove weight'));
      }
    });
  });
}

function drawWeightChart() {
  const svg = document.getElementById('weightChart');
  if (!svg || !svg.parentElement) return;
  const W = Math.max(svg.parentElement.clientWidth - 32, 200);
  const H = 110;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);

  const vals = weightHistory.map(e => e.val);
  const minV = Math.min(...vals) - 0.4;
  const maxV = Math.max(...vals) + 0.4;
  const n = vals.length;

  const px = i => n === 1 ? W / 2 : (i / (n - 1)) * (W - 32) + 16;
  const py = v => H - 20 - ((v - minV) / (maxV - minV)) * (H - 36);

  const first = vals[0];
  const last = vals[vals.length - 1];
  const diff = last - first;
  const trendEl = document.getElementById('weightTrendSubtitle');
  if (trendEl) {
    if (diff > 0.2) trendEl.textContent = `+${diff.toFixed(1)} lb over recorded period`;
    else if (diff < -0.2) trendEl.textContent = `${diff.toFixed(1)} lb loss over recorded period`;
    else trendEl.textContent = `Weight overall stable (${last.toFixed(1)} lb)`;
  }

  let lines = '';
  for (let i = 0; i <= 2; i++) {
    const y = py(minV + (maxV - minV) * i / 2);
    lines += `<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="rgba(45,27,0,0.06)" stroke-width="1"/>`;
  }

  const pathD = vals.map((v, i) => (i === 0 ? 'M' : 'L') + px(i).toFixed(1) + ',' + py(v).toFixed(1)).join(' ');
  const fillD = pathD + ` L${px(n - 1).toFixed(1)},${H} L${px(0).toFixed(1)},${H} Z`;

  let dots = '';
  vals.forEach((v, i) => {
    const x = px(i);
    const y2 = py(v);
    const isLast = i === n - 1;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y2.toFixed(1)}" r="${isLast ? 5 : 3.5}" fill="${isLast ? '#FF6B35' : '#FFB347'}"/>`;
    if (isLast || i === 0) {
      dots += `<text x="${x.toFixed(1)}" y="${(y2 - 8).toFixed(1)}" font-size="11" fill="#7C5C3A" text-anchor="${i === 0 ? 'start' : 'end'}" font-family="DM Mono,monospace" font-weight="700">${v.toFixed(1)} lb</text>`;
    }
  });

  svg.innerHTML = lines + `<path d="${fillD}" fill="#FF6B35" fill-opacity="0.08"/><path d="${pathD}" fill="none" stroke="#FF6B35" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` + dots;
}

// ---- PROGRESS & SUMMARY BADGES ----
function updateProgress() {
  const doneMeals = Object.keys(checked).length;
  const actDone = Object.keys(activities).filter(k => (activities[k] || []).length > 0).length;
  const total = meals.morning.length + meals.evening.length + 4;
  const progEl = document.getElementById('progressText');
  if (progEl) progEl.textContent = `${doneMeals + actDone} of ${total} care items completed today`;
  renderDailySummaryOverview();
}

function updateSummary() {
  const mealsDone = Object.keys(checked).length;
  const totalItems = meals.morning.length + meals.evening.length;
  const mealsCard = document.getElementById('sum-meals');
  if (mealsCard) {
    document.getElementById('sum-meals-badge').textContent = mealsDone;
    mealsCard.classList.toggle('lit', mealsDone > 0 && mealsDone >= totalItems);
    mealsCard.classList.toggle('has-count', mealsDone > 0);
  }

  ['walk', 'poo'].forEach(type => {
    const n = (activities[type] || []).length;
    const card = document.getElementById('sum-' + type);
    if (card) {
      document.getElementById('sum-' + type + '-badge').textContent = n;
      card.classList.toggle('lit', n > 0);
      card.classList.toggle('has-count', n > 0);
    }
  });

  const pillDone = !!checked['pill'];
  const pillCard = document.getElementById('sum-pill');
  if (pillCard) pillCard.classList.toggle('lit', pillDone);
  renderDailySummaryOverview();
  updateAccordionTags();
}

function renderDailySummaryOverview() {
  const doneContainer = document.getElementById('summaryDoneList');
  const pendingContainer = document.getElementById('summaryPendingList');
  const ratioBadge = document.getElementById('summaryRatioBadge');
  const doneCountBadge = document.getElementById('doneCountBadge');
  const pendingCountBadge = document.getElementById('pendingCountBadge');

  if (!doneContainer || !pendingContainer) return;

  const doneItems = [];
  const pendingItems = [];

  // Morning meals
  (meals.morning || []).forEach(item => {
    const c = checked[item.id];
    if (c) {
      doneItems.push({ name: `${item.icon} ${item.label}`, who: c.who, stamp: c.stamp });
    } else {
      pendingItems.push({ name: `${item.icon} ${item.label}` });
    }
  });

  // Evening meals
  (meals.evening || []).forEach(item => {
    const c = checked[item.id];
    if (c) {
      doneItems.push({ name: `${item.icon} ${item.label}`, who: c.who, stamp: c.stamp });
    } else {
      pendingItems.push({ name: `${item.icon} ${item.label}` });
    }
  });

  // Activities
  const activityTypes = [
    { key: 'walk', icon: '🦮', name: 'Walk' },
    { key: 'poo', icon: '💩', name: 'Poo' },
    { key: 'water', icon: '💧', name: 'Water Refill' },
    { key: 'play', icon: '🎾', name: 'Playtime' }
  ];

  activityTypes.forEach(act => {
    const list = activities[act.key] || [];
    if (list.length > 0) {
      const last = list[list.length - 1];
      doneItems.push({ name: `${act.icon} ${act.name} (${list.length} today)`, who: last.who, stamp: `${last.who} · ${last.t}` });
    } else {
      pendingItems.push({ name: `${act.icon} ${act.name}` });
    }
  });

  // Daily Grooming
  (groomingDailyItems || []).forEach(item => {
    const c = groomingChecked[item.id];
    if (c) {
      doneItems.push({ name: `${item.icon} ${item.label}`, who: c.who, stamp: c.stamp });
    } else {
      pendingItems.push({ name: `${item.icon} ${item.label}` });
    }
  });

  // Render Badges
  const totalCount = doneItems.length + pendingItems.length;
  if (ratioBadge) ratioBadge.textContent = `${doneItems.length} / ${totalCount} Done`;
  if (doneCountBadge) doneCountBadge.textContent = doneItems.length;
  if (pendingCountBadge) pendingCountBadge.textContent = pendingItems.length;

  // Render Done List
  if (doneItems.length > 0) {
    doneContainer.innerHTML = doneItems.map(item => `
      <div class="summary-chip chip-done">
        <div>${item.name}</div>
        <span class="chip-who">${item.stamp || item.who}</span>
      </div>
    `).join('');
  } else {
    doneContainer.innerHTML = '<div class="empty-summary-text">Nothing completed yet today.</div>';
  }

  // Render Pending List
  if (pendingItems.length > 0) {
    pendingContainer.innerHTML = pendingItems.map(item => `
      <div class="summary-chip chip-pending">
        <div>${item.name}</div>
      </div>
    `).join('');
  } else {
    pendingContainer.innerHTML = '<div class="empty-summary-text">All care tasks completed! 🎉</div>';
  }
}

// ---- MODAL DIALOGS ----
function initModalDialogs() {
  const treatModal = document.getElementById('treatModal');
  if (treatModal) {
    document.getElementById('openTreatModalBtn').addEventListener('click', () => treatModal.showModal());
    document.getElementById('closeTreatModalBtn').addEventListener('click', () => treatModal.close());

    document.getElementById('saveTreatBtn').addEventListener('click', () => {
      const nameInp = document.getElementById('treatNameInput');
      const kcalInp = document.getElementById('treatKcalInput');
      const label = nameInp.value.trim() || 'Extra Snack';
      const kcal = parseInt(kcalInp.value, 10) || 15;
      const treatId = 'treat_' + Date.now();

      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const stamp = `${who} · ${t}`;

      checked[treatId] = { who: who, stamp: stamp, kcal: kcal, customLabel: label };
      saveLocal();
      updateCal();
      updateProgress();
      updateSummary();

      if (db) {
        const u = {};
        u['checked/' + treatId] = { who: who, stamp: stamp, kcal: kcal, customLabel: label };
        update(dayRef(), u).catch(err => handleFirebaseError(err, 'Add treat'));
      }

      addLog(`🍖 Treat Logged: ${label} (+${kcal} kcal) by ${who}`);
      treatModal.close();
      nameInp.value = '';
      showToast(`Logged treat: ${label}`);
    });
  }

  const vetModal = document.getElementById('vetReportModal');
  if (vetModal) {
    document.getElementById('exportVetBtn').addEventListener('click', () => {
      generateVetReport();
      vetModal.showModal();
    });
    document.getElementById('closeVetModalBtn').addEventListener('click', () => vetModal.close());

    document.getElementById('copyVetReportBtn').addEventListener('click', () => {
      const area = document.getElementById('vetReportText');
      area.select();
      navigator.clipboard.writeText(area.value);
      showToast('Report copied to clipboard!');
    });
  }

  // Copy Family Status Update text
  const copyFamilyBtn = document.getElementById('copyFamilyUpdateBtn');
  if (copyFamilyBtn) {
    copyFamilyBtn.addEventListener('click', () => {
      const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      
      const doneItems = [];
      (meals.morning || []).concat(meals.evening || []).forEach(i => {
        if (checked[i.id]) doneItems.push(`- ${i.icon} ${i.label} (${checked[i.id].stamp})`);
      });
      ['walk', 'poo', 'water', 'play'].forEach(t => {
        const l = activities[t] || [];
        if (l.length) doneItems.push(`- ${t === 'walk' ? '🦮 Walk' : t === 'poo' ? '💩 Poo' : t === 'water' ? '💧 Water' : '🎾 Play'} x${l.length} (${l[l.length-1].who})`);
      });
      groomingDailyItems.forEach(g => {
        if (groomingChecked[g.id]) doneItems.push(`- ${g.icon} ${g.label} (${groomingChecked[g.id].stamp})`);
      });

      const pendingItems = [];
      (meals.morning || []).concat(meals.evening || []).forEach(i => {
        if (!checked[i.id]) pendingItems.push(`- ${i.icon} ${i.label}`);
      });
      if (!(activities.walk || []).length) pendingItems.push(`- 🦮 Walk`);
      if (!(activities.poo || []).length) pendingItems.push(`- 💩 Poo`);
      groomingDailyItems.forEach(g => {
        if (!groomingChecked[g.id]) pendingItems.push(`- ${g.icon} ${g.label}`);
      });

      let totalKcal = 0;
      Object.values(checked).forEach(v => totalKcal += (v.kcal || 0));

      let msg = `🐾 Geddy's Daily Status (${dateStr})\n\n`;
      msg += `✅ DONE (${doneItems.length}):\n` + (doneItems.length ? doneItems.join('\n') : '- None yet') + '\n\n';
      msg += `⏳ STILL NEEDED (${pendingItems.length}):\n` + (pendingItems.length ? pendingItems.join('\n') : '- Everything completed! 🎉') + '\n\n';
      msg += `🔥 Calories Today: ${totalKcal} / 324 kcal`;

      navigator.clipboard.writeText(msg);
      showToast('Copied family status update to clipboard!');
    });
  }
}

function generateVetReport() {
  const latestWeight = weightHistory.length ? weightHistory[weightHistory.length - 1].val.toFixed(1) : '17.2';
  const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  let text = `GEDDY VETERINARY SUMMARY REPORT\nGenerated: ${reportDate}\n-----------------------------------\n`;
  text += `PATIENT: Geddy\nCURRENT WEIGHT: ${latestWeight} lbs\nBODY CONDITION SCORE: 6.5 / 9\nDAILY CALORIE TARGET: 324 kcal/day\nPRESCRIPTION DIET: Royal Canin\n\n`;

  text += `RECENT WEIGHT HISTORY:\n`;
  if (weightHistory.length) {
    weightHistory.slice(-5).reverse().forEach(w => {
      text += `- ${w.date}: ${w.val.toFixed(1)} lbs ${w.note ? '(' + w.note + ')' : ''}\n`;
    });
  } else {
    text += `- No weight history recorded\n`;
  }

  text += `\nGROOMING & HYGIENE STATUS:\n`;
  const groomingTypes = [
    { key: 'bath', name: 'Bath' },
    { key: 'nails', name: 'Nail Trim' },
    { key: 'fleatick', name: 'Flea & Tick' },
    { key: 'ears', name: 'Ear Clean' }
  ];
  groomingTypes.forEach(g => {
    const list = groomingHistory[g.key] || [];
    text += `- ${g.name}: ${list.length ? list[0].date : 'Not recorded recently'}\n`;
  });

  text += `\nRECENT ACTIVITY & NOTES:\n`;
  if (logEntries.length) {
    logEntries.slice(0, 5).forEach(l => {
      text += `- [${l.t}] (${l.who}) ${l.text}\n`;
    });
  } else {
    text += `- No notes logged today.\n`;
  }

  const reportArea = document.getElementById('vetReportText');
  if (reportArea) reportArea.value = text;
}

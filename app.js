'use strict';

// ── Navigation ────────────────────────────────────────────
const navBtns = document.querySelectorAll('.nav-btn');
const screens = document.querySelectorAll('.screen');

function showScreen(name) {
  // Stop the camera if the scanner is open when the user taps a tab
  if (document.getElementById('scanner-overlay').classList.contains('open')) {
    Scanner.closeScanner();
  }
  screens.forEach(s => s.classList.remove('active'));
  navBtns.forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelector(`[data-screen="${name}"]`).classList.add('active');
  // Refresh Today when switching back to it (in case meals were added)
  if (name === 'today') Log.renderDate(dateKey(currentDate));
  // Refresh Meals list when switching to it (in case a food was renamed)
  if (name === 'meals') Meals.load();
  // Refresh Waist chart when switching to it
  if (name === 'waist') Waist.load();
}

navBtns.forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

// ── Date navigation (Today screen) ───────────────────────
let currentDate = new Date();
currentDate.setHours(0, 0, 0, 0);

/** Returns a Date set to today at midnight. */
function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns a "YYYY-MM-DD" string used as the storage key for a day.
 * e.g. dateKey(new Date()) → "2025-10-22"
 */
function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function formatDate(d) {
  const today = todayDate();
  const diff  = Math.round((d - today) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short'
  });
}

function updateDateDisplay() {
  document.getElementById('date-display').textContent = formatDate(currentDate);
  // Hide the "›" button when already on today — you can't go to the future
  document.getElementById('next-day').style.visibility =
    currentDate >= todayDate() ? 'hidden' : 'visible';
}

document.getElementById('prev-day').addEventListener('click', () => {
  currentDate = new Date(currentDate);
  currentDate.setDate(currentDate.getDate() - 1);
  updateDateDisplay();
  Log.renderDate(dateKey(currentDate));
});

document.getElementById('next-day').addEventListener('click', () => {
  if (currentDate < todayDate()) {
    currentDate = new Date(currentDate);
    currentDate.setDate(currentDate.getDate() + 1);
    updateDateDisplay();
    Log.renderDate(dateKey(currentDate));
  }
});

// ── Boot ──────────────────────────────────────────────────
async function boot() {
  // Open the database first — all modules need it ready
  await DB.open();

  // Ask the browser to keep our data even when storage is low
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist();
  }

  // Initialise feature modules
  Log.init();
  Foods.init();
  Meals.init();
  Settings.init();
  Scanner.init();
  Waist.init();
  Export.init();

  // Draw the date in the Today header and load today's log
  updateDateDisplay();
  Log.renderDate(dateKey(currentDate));
}

boot();

// ── Service Worker ────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // SW requires HTTPS or localhost — silently ignored in local file preview
  });
}

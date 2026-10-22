'use strict';

/**
 * Log — the daily food log (Today screen).
 *
 * Each log entry stored in IndexedDB ('log' store):
 *   { id, date, meal, foodId, foodName, foodLabel,
 *     grams, kcal100, protein100, carbs100, fat100, fibre100 }
 *
 * Nutrition values are snapshots taken at log time so the entry
 * remains correct even if the food is later edited or deleted.
 */
const Log = (() => {

  const MEALS = [
    { id: 'breakfast', label: 'Breakfast' },
    { id: 'lunch',     label: 'Lunch' },
    { id: 'evening',   label: 'Evening' },
    { id: 'dinner',    label: 'Dinner' },
  ];

  // These defaults are used until Settings (Stage 6) writes real values
  const DEFAULT_TARGETS = { kcal: 2300, protein: 143, fibre: 35 };

  let currentDateStr = '';
  let entries        = [];
  let targets        = { ...DEFAULT_TARGETS };

  // ── Daily-toggle state ───────────────────────────────
  let dayToggles = { workout: false, dalDay: false, cheatMeal: null };

  // ── Picker / grams-sheet state ────────────────────────
  let pickerMeal  = null;   // 'breakfast' | 'lunch' | 'evening' | 'dinner'
  let pickerFood  = null;   // food object (or snapshot) chosen in the picker
  let pickerEntry = null;   // existing log entry when editing (null = new)
  let allFoods    = [];     // food list loaded for the picker

  // ── Helpers ───────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Round to 1 decimal, drop ".0" */
  function fmt(n) {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(Math.round(r)) : String(r);
  }

  /** Compute an entry's actual macros from grams + per-100g snapshot. */
  function calc(e) {
    const f = e.grams / 100;
    return {
      kcal:    Math.round(e.kcal100    * f * 10) / 10,
      protein: Math.round(e.protein100 * f * 10) / 10,
      carbs:   Math.round(e.carbs100   * f * 10) / 10,
      fat:     Math.round(e.fat100     * f * 10) / 10,
      fibre:   Math.round(e.fibre100   * f * 10) / 10,
    };
  }

  /** Sum an array of entries into one totals object. */
  function sum(list) {
    return list.reduce((acc, e) => {
      const m = calc(e);
      acc.kcal    += m.kcal;
      acc.protein += m.protein;
      acc.carbs   += m.carbs;
      acc.fat     += m.fat;
      acc.fibre   += m.fibre;
      return acc;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
  }

  /** Clamp 0-100, round. */
  function pct(val, target) {
    return target > 0 ? Math.min(100, Math.round(val / target * 100)) : 0;
  }

  // ── Load and render a day ─────────────────────────────
  async function renderDate(dateStr) {
    currentDateStr = dateStr;

    // Read editable targets if Settings has saved them (Stage 6 writes them)
    const saved = await DB.get('settings', 'targets');
    targets = saved?.value ?? { ...DEFAULT_TARGETS };

    entries = await DB.getAllByIndex('log', 'date', dateStr);

    // Load per-day toggles
    const day = await DB.get('days', dateStr);
    dayToggles = {
      workout:   day?.workout   ?? false,
      dalDay:    day?.dalDay    ?? false,
      cheatMeal: day?.cheatMeal ?? null,
    };

    render();
  }

  // ── Full re-render of the Today screen ────────────────
  function render() {
    const container = document.getElementById('today-content');
    const totals = sum(entries);

    container.innerHTML =
      renderTotalsCard(totals) +
      renderTogglesRow() +
      MEALS.map(m => renderMealSection(m)).join('');

    // Wire "Add" buttons
    container.querySelectorAll('.btn-add-food').forEach(btn => {
      btn.addEventListener('click', () => openFoodPicker(btn.dataset.meal));
    });

    // Wire entry cards (tap = edit)
    container.querySelectorAll('.entry-card').forEach(card => {
      card.addEventListener('click', () => openEditEntry(Number(card.dataset.id)));
    });

    // Wire toggle buttons
    container.querySelector('#toggle-workout')?.addEventListener('click', () => flipToggle('workout'));
    container.querySelector('#toggle-dal-day')?.addEventListener('click', () => flipToggle('dalDay'));
    container.querySelector('#toggle-cheat-meal')?.addEventListener('click', openCheatMealPicker);
  }

  // ── Totals card HTML ──────────────────────────────────
  function renderTotalsCard(t) {
    const kcalPct   = pct(t.kcal,    targets.kcal);
    const protPct   = pct(t.protein, targets.protein);
    const fibrePct  = pct(t.fibre,   targets.fibre);
    const over      = kcalPct >= 100;

    return `
      <div class="totals-card">

        <div class="totals-kcal-row">
          <span class="totals-eaten ${over ? 'totals-over' : ''}">${Math.round(t.kcal)}</span>
          <span class="totals-of"> / ${targets.kcal} kcal</span>
          <span class="totals-pct ${over ? 'totals-over' : ''}">${kcalPct}%</span>
        </div>

        <div class="prog-track">
          <div class="prog-fill ${over ? 'prog-over' : ''}" style="width:${kcalPct}%"></div>
        </div>

        <div class="totals-macros">

          <div class="macro-col">
            <span class="macro-val">${fmt(t.protein)}g</span>
            <span class="macro-lbl">protein</span>
            <div class="macro-bar-track">
              <div class="macro-bar-fill macro-bar-blue" style="width:${protPct}%"></div>
            </div>
            <span class="macro-target">/ ${targets.protein}g</span>
          </div>

          <div class="macro-col">
            <span class="macro-val">${fmt(t.carbs)}g</span>
            <span class="macro-lbl">carbs</span>
          </div>

          <div class="macro-col">
            <span class="macro-val">${fmt(t.fat)}g</span>
            <span class="macro-lbl">fat</span>
          </div>

          <div class="macro-col">
            <span class="macro-val">${fmt(t.fibre)}g</span>
            <span class="macro-lbl">fibre</span>
            <div class="macro-bar-track">
              <div class="macro-bar-fill macro-bar-green" style="width:${fibrePct}%"></div>
            </div>
            <span class="macro-target">/ ${targets.fibre}g</span>
          </div>

        </div>
      </div>
    `;
  }

  // ── Daily toggles HTML ───────────────────────────────
  function renderTogglesRow() {
    const cheatLabel = dayToggles.cheatMeal
      ? `🌶️ ${MEALS.find(m => m.id === dayToggles.cheatMeal)?.label ?? 'Cheat'}`
      : '🌶️ Cheat Meal';

    return `
      <div class="toggles-row">
        <button id="toggle-workout"   class="toggle-chip ${dayToggles.workout   ? 'active' : ''}" type="button">
          💪 Workout
        </button>
        <button id="toggle-dal-day"   class="toggle-chip ${dayToggles.dalDay    ? 'active' : ''}" type="button">
          🫘 Dal Day
        </button>
        <button id="toggle-cheat-meal" class="toggle-chip ${dayToggles.cheatMeal ? 'active' : ''}" type="button">
          ${cheatLabel}
        </button>
      </div>`;
  }

  async function flipToggle(field) {
    dayToggles[field] = !dayToggles[field];
    await saveToggles();
    // Re-render just the toggle row in-place
    const row = document.querySelector('.toggles-row');
    if (row) row.outerHTML = renderTogglesRow();
    // Re-wire after replacing HTML
    document.querySelector('#toggle-workout')?.addEventListener('click', () => flipToggle('workout'));
    document.querySelector('#toggle-dal-day')?.addEventListener('click', () => flipToggle('dalDay'));
    document.querySelector('#toggle-cheat-meal')?.addEventListener('click', openCheatMealPicker);
  }

  function openCheatMealPicker() {
    openSheet('cheat-meal-sheet');
  }

  async function setCheatMeal(meal) {
    // meal = 'breakfast'|'lunch'|'evening'|'dinner'|null
    dayToggles.cheatMeal = meal;
    await saveToggles();
    closeSheet('cheat-meal-sheet');
    const row = document.querySelector('.toggles-row');
    if (row) row.outerHTML = renderTogglesRow();
    document.querySelector('#toggle-workout')?.addEventListener('click', () => flipToggle('workout'));
    document.querySelector('#toggle-dal-day')?.addEventListener('click', () => flipToggle('dalDay'));
    document.querySelector('#toggle-cheat-meal')?.addEventListener('click', openCheatMealPicker);
  }

  async function saveToggles() {
    await DB.put('days', {
      date:      currentDateStr,
      workout:   dayToggles.workout,
      dalDay:    dayToggles.dalDay,
      cheatMeal: dayToggles.cheatMeal,
    });
  }

  // ── Meal section HTML ─────────────────────────────────
  function renderMealSection(meal) {
    const mealEntries = entries.filter(e => e.meal === meal.id);
    const mealTotals  = sum(mealEntries);
    const hasEntries  = mealEntries.length > 0;

    return `
      <div class="meal-section">
        <div class="meal-header">
          <span class="meal-name">${meal.label}</span>
          ${hasEntries
            ? `<span class="meal-kcal">${Math.round(mealTotals.kcal)} kcal</span>`
            : ''}
          <button class="icon-btn btn-add-food" data-meal="${meal.id}"
                  aria-label="Add food to ${meal.label}">+</button>
        </div>
        <div class="meal-entries">
          ${hasEntries
            ? mealEntries.map(renderEntryCard).join('')
            : `<p class="meal-empty">Nothing logged yet</p>`}
        </div>
      </div>
    `;
  }

  function renderEntryCard(e) {
    const m = calc(e);
    return `
      <div class="entry-card" data-id="${e.id}" role="button" tabindex="0"
           aria-label="Edit ${esc(e.foodName)}">
        <div class="entry-body">
          <div class="entry-top-line">
            <span class="entry-name">${esc(e.foodName)}</span>
            <span class="entry-grams">${e.grams}g</span>
          </div>
          <div class="entry-macros">
            ${Math.round(m.kcal)} kcal
            &nbsp;·&nbsp; P ${fmt(m.protein)}g
            &nbsp;·&nbsp; C ${fmt(m.carbs)}g
            &nbsp;·&nbsp; F ${fmt(m.fat)}g
          </div>
        </div>
        <span class="entry-chevron" aria-hidden="true">›</span>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════
  // FOOD PICKER SHEET
  // ═══════════════════════════════════════════════════

  async function openFoodPicker(meal) {
    pickerMeal  = meal;
    pickerFood  = null;
    pickerEntry = null;

    allFoods = await DB.getAll('foods');
    allFoods.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const label = MEALS.find(m => m.id === meal)?.label ?? meal;
    document.getElementById('picker-title').textContent = `Add to ${label}`;
    document.getElementById('picker-search').value = '';

    renderPickerList('');
    openSheet('food-picker-sheet');
    setTimeout(() => document.getElementById('picker-search').focus(), 300);
  }

  function renderPickerList(query) {
    const q    = query.trim().toLowerCase();
    const list = q ? allFoods.filter(f => f.name.toLowerCase().includes(q)) : allFoods;
    const el   = document.getElementById('picker-list');

    if (list.length === 0) {
      el.innerHTML = `<p class="placeholder" style="padding:40px 16px">${
        q ? 'No foods match your search.'
          : 'No foods in your list yet.\nGo to the Foods tab and add some first.'
      }</p>`;
      return;
    }

    el.innerHTML = list.map(f => `
      <div class="food-item" data-id="${f.id}" role="button" tabindex="0">
        <div class="food-item-body">
          <div class="food-item-name">${esc(f.name)}</div>
          <div class="food-item-meta">
            <span class="label-badge">${esc(f.label)}</span>
            <span>${f.kcal100} kcal &nbsp;·&nbsp; P ${f.protein100}g &nbsp;·&nbsp; C ${f.carbs100}g</span>
          </div>
        </div>
        <span class="food-item-chevron" aria-hidden="true">›</span>
      </div>
    `).join('');

    el.querySelectorAll('.food-item').forEach(row => {
      row.addEventListener('click', () => {
        const food = allFoods.find(f => f.id === Number(row.dataset.id));
        if (food) openGramsSheet(food, null);
      });
    });
  }

  function closeFoodPicker() { closeSheet('food-picker-sheet'); }

  // ═══════════════════════════════════════════════════
  // GRAMS ENTRY SHEET
  // ═══════════════════════════════════════════════════

  function openGramsSheet(food, existingEntry) {
    pickerFood  = food;
    pickerEntry = existingEntry;

    closeFoodPicker();

    document.getElementById('grams-food-name').textContent  = food.name;
    document.getElementById('grams-food-label').textContent = food.label;
    document.getElementById('grams-sheet-title').textContent =
      existingEntry ? 'Edit Entry' : ('Add to ' + (MEALS.find(m => m.id === pickerMeal)?.label ?? pickerMeal));

    const grams = existingEntry ? String(existingEntry.grams) : '';
    document.getElementById('grams-input').value = grams;
    document.getElementById('grams-error').textContent = '';
    document.getElementById('grams-delete-btn').style.display = existingEntry ? '' : 'none';
    // Reset delete-confirm state
    const delBtn = document.getElementById('grams-delete-btn');
    delBtn.dataset.confirm = '';
    delBtn.textContent = 'Delete Entry';

    refreshGramsPreview(Number(grams) || 0);

    openSheet('grams-sheet');
    setTimeout(() => {
      const inp = document.getElementById('grams-input');
      inp.focus();
      inp.select?.();
    }, 300);
  }

  function closeGramsSheet() { closeSheet('grams-sheet'); }

  function refreshGramsPreview(grams) {
    const food = pickerFood;
    if (!food) return;
    const f = grams / 100;
    const kcal    = fmt(food.kcal100    * f);
    const protein = fmt(food.protein100 * f);
    const carbs   = fmt(food.carbs100   * f);
    const fat     = fmt(food.fat100     * f);
    const fibre   = fmt(food.fibre100   * f);
    document.getElementById('grams-preview').textContent = grams > 0
      ? `${kcal} kcal · P ${protein}g · C ${carbs}g · F ${fat}g · Fibre ${fibre}g`
      : 'Enter grams to see nutrition';
  }

  // ── Edit an existing entry (tap on entry card) ────────
  async function openEditEntry(entryId) {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    pickerMeal = entry.meal;

    // Reconstruct a food-like object from the stored snapshot
    const food = {
      id:      entry.foodId,
      name:    entry.foodName,
      label:   entry.foodLabel ?? 'as sold',
      kcal:    entry.kcal100,
      protein: entry.protein100,
      carbs:   entry.carbs100,
      fat:     entry.fat100,
      fibre:   entry.fibre100,
    };

    openGramsSheet(food, entry);
  }

  // ── Save ──────────────────────────────────────────────
  async function saveEntry() {
    const raw   = document.getElementById('grams-input').value.trim();
    const grams = parseFloat(raw);

    if (!raw || isNaN(grams) || grams <= 0) {
      document.getElementById('grams-error').textContent =
        'Please enter a number greater than 0.';
      document.getElementById('grams-input').focus();
      return;
    }
    document.getElementById('grams-error').textContent = '';

    const food   = pickerFood;
    const record = {
      date:       currentDateStr,
      meal:       pickerMeal,
      foodId:     food.id ?? null,
      foodName:   food.name,
      foodLabel:  food.label,
      grams,
      kcal100:    food.kcal100,
      protein100: food.protein100,
      carbs100:   food.carbs100,
      fat100:     food.fat100,
      fibre100:   food.fibre100,
    };
    if (pickerEntry) record.id = pickerEntry.id;

    const btn = document.getElementById('grams-save-btn');
    btn.disabled = true;
    try {
      await DB.put('log', record);
      closeGramsSheet();
      await renderDate(currentDateStr);
    } finally {
      btn.disabled = false;
    }
  }

  // ── Delete ────────────────────────────────────────────
  async function deleteEntry() {
    if (!pickerEntry) return;
    const btn = document.getElementById('grams-delete-btn');

    if (btn.dataset.confirm !== 'yes') {
      btn.dataset.confirm = 'yes';
      btn.textContent = 'Tap again to confirm';
      setTimeout(() => {
        btn.dataset.confirm = '';
        btn.textContent = 'Delete Entry';
      }, 3000);
      return;
    }

    btn.disabled = true;
    try {
      await DB.del('log', pickerEntry.id);
      closeGramsSheet();
      await renderDate(currentDateStr);
    } finally {
      btn.disabled = false;
      btn.dataset.confirm = '';
      btn.textContent = 'Delete Entry';
    }
  }

  // ── Generic sheet helpers ─────────────────────────────
  function openSheet(id) {
    const el = document.getElementById(id);
    el.classList.add('open');
    el.querySelector('.sheet').scrollTop = 0;
  }
  function closeSheet(id) {
    document.getElementById(id).classList.remove('open');
  }

  // ── Public init ───────────────────────────────────────
  function init() {
    // Food picker
    document.getElementById('picker-close').addEventListener('click', closeFoodPicker);
    document.getElementById('food-picker-sheet').addEventListener('click', e => {
      if (e.target.id === 'food-picker-sheet') closeFoodPicker();
    });
    document.getElementById('picker-search').addEventListener('input', e => {
      renderPickerList(e.target.value);
    });

    // Grams sheet
    document.getElementById('grams-save-btn').addEventListener('click', saveEntry);
    document.getElementById('grams-delete-btn').addEventListener('click', deleteEntry);
    document.getElementById('grams-cancel-btn').addEventListener('click', closeGramsSheet);
    document.getElementById('grams-sheet').addEventListener('click', e => {
      if (e.target.id === 'grams-sheet') closeGramsSheet();
    });
    document.getElementById('grams-input').addEventListener('input', e => {
      refreshGramsPreview(Number(e.target.value) || 0);
    });

    // Quick-pick gram amounts
    document.querySelectorAll('.quick-gram-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = btn.dataset.g;
        document.getElementById('grams-input').value = g;
        refreshGramsPreview(Number(g));
      });
    });

    // Cheat meal picker
    document.querySelectorAll('.cheat-meal-option').forEach(btn => {
      btn.addEventListener('click', () => setCheatMeal(btn.dataset.meal || null));
    });
    document.getElementById('cheat-meal-cancel').addEventListener('click', () => closeSheet('cheat-meal-sheet'));
    document.getElementById('cheat-meal-sheet').addEventListener('click', e => {
      if (e.target.id === 'cheat-meal-sheet') closeSheet('cheat-meal-sheet');
    });
  }

  return { init, renderDate };
})();

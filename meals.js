'use strict';

/**
 * Meals — saved meal templates.
 *
 * A template is stored in the 'meals' IndexedDB store:
 *   { id (auto), name: string, items: [
 *       { foodId, foodName, foodLabel,
 *         grams, kcal100, protein100, carbs100, fat100, fibre100 }
 *   ] }
 *
 * "Add to Day" logs every item as separate entries in the 'log' store
 * under the currently-viewed date and the chosen meal slot.
 */
const Meals = (() => {

  const MEAL_SLOTS = [
    { id: 'breakfast', label: 'Breakfast' },
    { id: 'lunch',     label: 'Lunch' },
    { id: 'evening',   label: 'Evening' },
    { id: 'dinner',    label: 'Dinner' },
  ];

  // ── State ─────────────────────────────────────────────
  let allMeals   = [];   // all saved templates
  let editMeal   = null; // template being created/edited { id?, name, items[] }
  let viewMeal   = null; // template being viewed/added-to-day
  let allFoods   = [];   // food list for the food picker
  let editItemIdx = null; // index into editMeal.items when editing an item

  // ── Helpers ───────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(n) {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(Math.round(r)) : String(r);
  }

  function calcItem(item) {
    const f = item.grams / 100;
    return {
      kcal:    Math.round(item.kcal100    * f * 10) / 10,
      protein: Math.round(item.protein100 * f * 10) / 10,
      carbs:   Math.round(item.carbs100   * f * 10) / 10,
      fat:     Math.round(item.fat100     * f * 10) / 10,
      fibre:   Math.round(item.fibre100   * f * 10) / 10,
    };
  }

  function templateTotals(items) {
    return items.reduce((acc, item) => {
      const m = calcItem(item);
      acc.kcal    += m.kcal;
      acc.protein += m.protein;
      acc.carbs   += m.carbs;
      acc.fat     += m.fat;
      acc.fibre   += m.fibre;
      return acc;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
  }

  function openSheet(id)  { document.getElementById(id).classList.add('open'); }
  function closeSheet(id) { document.getElementById(id).classList.remove('open'); }

  // ── Init ──────────────────────────────────────────────
  function init() {
    // View sheet — "Add to Day" opens slot picker
    document.getElementById('meal-view-add-btn').addEventListener('click', openSlotPicker);
    document.getElementById('meal-view-edit-btn').addEventListener('click', () => {
      closeSheet('meal-view-sheet');
      openEditSheet(viewMeal);
    });
    document.getElementById('meal-view-close-btn').addEventListener('click', () => closeSheet('meal-view-sheet'));

    // Slot picker buttons
    document.querySelectorAll('.meal-slot-btn').forEach(btn => {
      btn.addEventListener('click', () => addToDay(btn.dataset.slot));
    });
    document.getElementById('slot-picker-cancel').addEventListener('click', () => closeSheet('slot-picker-sheet'));

    // Edit sheet controls
    document.getElementById('meal-edit-save-btn').addEventListener('click',   saveTemplate);
    document.getElementById('meal-edit-cancel-btn').addEventListener('click', () => closeSheet('meal-edit-sheet'));
    document.getElementById('meal-edit-delete-btn').addEventListener('click', deleteTemplate);
    document.getElementById('meal-edit-add-item-btn').addEventListener('click', openItemFoodPicker);

    // Item food picker — search
    document.getElementById('meal-item-picker-search').addEventListener('input', e => {
      renderItemFoodPickerList(e.target.value.trim().toLowerCase());
    });
    document.getElementById('meal-item-picker-close').addEventListener('click', () => {
      closeSheet('meal-item-picker-sheet');
    });

    // Item grams sheet
    document.getElementById('meal-item-grams-input').addEventListener('input', () => {
      refreshItemGramsPreview(parseFloat(document.getElementById('meal-item-grams-input').value) || 0);
    });
    document.querySelectorAll('.meal-item-quick-gram-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('meal-item-grams-input').value = btn.dataset.g;
        refreshItemGramsPreview(Number(btn.dataset.g));
      });
    });
    document.getElementById('meal-item-grams-save-btn').addEventListener('click',   saveItem);
    document.getElementById('meal-item-grams-cancel-btn').addEventListener('click', () => closeSheet('meal-item-grams-sheet'));
    document.getElementById('meal-item-grams-delete-btn').addEventListener('click', deleteItem);

    // Top-bar "+" for the Meals screen
    document.getElementById('add-meal-btn').addEventListener('click', () => openEditSheet(null));

    load();
  }

  // ── Load & render list ────────────────────────────────
  async function load() {
    allMeals = await DB.getAll('meals');
    renderList();
  }

  function renderList() {
    const el = document.getElementById('meals-list');
    if (!allMeals.length) {
      el.innerHTML = `<p class="placeholder">No saved meals yet.\nTap + to create your first template.</p>`;
      return;
    }
    el.innerHTML = allMeals.map(m => {
      const t = templateTotals(m.items);
      return `
        <div class="food-item" data-id="${m.id}" role="button" tabindex="0">
          <div class="food-item-body">
            <div class="food-item-name">${esc(m.name)}</div>
            <div class="food-item-meta">
              <span>${m.items.length} item${m.items.length !== 1 ? 's' : ''}</span>
              <span>&nbsp;·&nbsp; ${Math.round(t.kcal)} kcal</span>
              <span>&nbsp;·&nbsp; P ${fmt(t.protein)}g</span>
            </div>
          </div>
          <span class="food-item-chevron" aria-hidden="true">›</span>
        </div>`;
    }).join('');

    el.querySelectorAll('.food-item').forEach(row => {
      row.addEventListener('click', () => {
        const meal = allMeals.find(m => m.id === Number(row.dataset.id));
        if (meal) openViewSheet(meal);
      });
    });
  }

  // ══════════════════════════════════════════════════════
  // VIEW SHEET  (tap a template → see its items)
  // ══════════════════════════════════════════════════════
  function openViewSheet(meal) {
    viewMeal = meal;
    document.getElementById('meal-view-title').textContent = meal.name;

    const t = templateTotals(meal.items);
    document.getElementById('meal-view-totals').textContent =
      `${Math.round(t.kcal)} kcal · P ${fmt(t.protein)}g · C ${fmt(t.carbs)}g · F ${fmt(t.fat)}g · Fibre ${fmt(t.fibre)}g`;

    const list = document.getElementById('meal-view-items');
    list.innerHTML = meal.items.map((item, i) => {
      const m = calcItem(item);
      return `
        <div class="template-item-row">
          <div class="template-item-body">
            <div class="template-item-name">${esc(item.foodName)}
              <span class="label-badge">${esc(item.foodLabel)}</span>
            </div>
            <div class="template-item-meta">${item.grams}g &nbsp;·&nbsp; ${Math.round(m.kcal)} kcal</div>
          </div>
        </div>`;
    }).join('');

    openSheet('meal-view-sheet');
  }

  // ══════════════════════════════════════════════════════
  // SLOT PICKER  (which meal slot to add to)
  // ══════════════════════════════════════════════════════
  function openSlotPicker() {
    closeSheet('meal-view-sheet');
    openSheet('slot-picker-sheet');
  }

  async function addToDay(slot) {
    closeSheet('slot-picker-sheet');

    // Get the current date from app.js's global
    const dateStr = dateKey(currentDate);

    const records = viewMeal.items.map(item => ({
      date:       dateStr,
      meal:       slot,
      foodId:     item.foodId ?? null,
      foodName:   item.foodName,
      foodLabel:  item.foodLabel,
      grams:      item.grams,
      kcal100:    item.kcal100,
      protein100: item.protein100,
      carbs100:   item.carbs100,
      fat100:     item.fat100,
      fibre100:   item.fibre100,
    }));

    await Promise.all(records.map(r => DB.put('log', r)));

    // Refresh the Today screen if it's visible
    if (document.getElementById('screen-today').classList.contains('active')) {
      await Log.renderDate(dateStr);
    }

    // Show a brief confirmation
    const btn = document.getElementById('meal-view-add-btn');
    const orig = btn.textContent;
    btn.textContent = 'Added ✓';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }

  // ══════════════════════════════════════════════════════
  // EDIT / CREATE TEMPLATE SHEET
  // ══════════════════════════════════════════════════════
  function openEditSheet(meal) {
    editMeal = meal
      ? { id: meal.id, name: meal.name, items: meal.items.map(i => ({ ...i })) }
      : { name: '', items: [] };

    document.getElementById('meal-edit-title').textContent = meal ? 'Edit Meal' : 'New Meal';
    document.getElementById('meal-edit-name').value        = editMeal.name;
    document.getElementById('meal-edit-error').textContent = '';
    document.getElementById('meal-edit-delete-btn').style.display = meal ? '' : 'none';

    // Reset delete confirm state
    const delBtn = document.getElementById('meal-edit-delete-btn');
    delBtn.dataset.confirm = '';
    delBtn.textContent = 'Delete Meal';

    renderEditItems();
    openSheet('meal-edit-sheet');
  }

  function renderEditItems() {
    const el = document.getElementById('meal-edit-items');
    if (!editMeal.items.length) {
      el.innerHTML = `<p class="meal-items-empty">No items yet. Tap "Add Food" below.</p>`;
      return;
    }
    el.innerHTML = editMeal.items.map((item, i) => {
      const m = calcItem(item);
      return `
        <div class="template-item-row template-item-editable" data-idx="${i}" role="button" tabindex="0">
          <div class="template-item-body">
            <div class="template-item-name">${esc(item.foodName)}
              <span class="label-badge">${esc(item.foodLabel)}</span>
            </div>
            <div class="template-item-meta">${item.grams}g &nbsp;·&nbsp; ${Math.round(m.kcal)} kcal</div>
          </div>
          <span class="food-item-chevron" aria-hidden="true">›</span>
        </div>`;
    }).join('');

    el.querySelectorAll('.template-item-editable').forEach(row => {
      row.addEventListener('click', () => openItemGramsSheet(Number(row.dataset.idx)));
    });
  }

  async function saveTemplate() {
    const name = document.getElementById('meal-edit-name').value.trim();
    if (!name) {
      document.getElementById('meal-edit-error').textContent = 'Please enter a meal name.';
      document.getElementById('meal-edit-name').focus();
      return;
    }
    if (!editMeal.items.length) {
      document.getElementById('meal-edit-error').textContent = 'Add at least one food item.';
      return;
    }
    document.getElementById('meal-edit-error').textContent = '';

    const record = { name, items: editMeal.items };
    if (editMeal.id != null) record.id = editMeal.id;

    const btn = document.getElementById('meal-edit-save-btn');
    btn.disabled = true;
    try {
      await DB.put('meals', record);
      closeSheet('meal-edit-sheet');
      await load();
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteTemplate() {
    const btn = document.getElementById('meal-edit-delete-btn');
    if (btn.dataset.confirm !== 'yes') {
      btn.dataset.confirm = 'yes';
      btn.textContent = 'Tap again to confirm';
      setTimeout(() => {
        btn.dataset.confirm = '';
        btn.textContent = 'Delete Meal';
      }, 3000);
      return;
    }
    if (editMeal.id != null) await DB.del('meals', editMeal.id);
    closeSheet('meal-edit-sheet');
    await load();
  }

  // ══════════════════════════════════════════════════════
  // ITEM FOOD PICKER  (inside edit sheet → pick a food)
  // ══════════════════════════════════════════════════════
  async function openItemFoodPicker() {
    allFoods = await DB.getAll('foods');
    document.getElementById('meal-item-picker-search').value = '';
    renderItemFoodPickerList('');
    openSheet('meal-item-picker-sheet');
    setTimeout(() => document.getElementById('meal-item-picker-search').focus(), 300);
  }

  function renderItemFoodPickerList(q) {
    const el   = document.getElementById('meal-item-picker-list');
    const list = q
      ? allFoods.filter(f =>
          f.name.toLowerCase().includes(q) || (f.label || '').toLowerCase().includes(q))
      : allFoods;

    if (!list.length) {
      el.innerHTML = `<p class="placeholder" style="padding:20px 0">${
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
        if (food) {
          closeSheet('meal-item-picker-sheet');
          openItemGramsSheet(null, food);
        }
      });
    });
  }

  // ══════════════════════════════════════════════════════
  // ITEM GRAMS SHEET  (set grams for an item in the template)
  // ══════════════════════════════════════════════════════
  let itemGramsFood = null; // food being added/edited

  function openItemGramsSheet(idx, food) {
    editItemIdx   = idx;
    itemGramsFood = food ?? editMeal.items[idx];

    document.getElementById('meal-item-grams-food-name').textContent  = itemGramsFood.name   ?? itemGramsFood.foodName;
    document.getElementById('meal-item-grams-food-label').textContent = itemGramsFood.label  ?? itemGramsFood.foodLabel;

    const grams = idx != null ? String(editMeal.items[idx].grams) : '';
    document.getElementById('meal-item-grams-input').value = grams;
    document.getElementById('meal-item-grams-error').textContent = '';
    document.getElementById('meal-item-grams-delete-btn').style.display = idx != null ? '' : 'none';

    const delBtn = document.getElementById('meal-item-grams-delete-btn');
    delBtn.dataset.confirm = '';
    delBtn.textContent = 'Remove Item';

    refreshItemGramsPreview(parseFloat(grams) || 0);
    openSheet('meal-item-grams-sheet');
    setTimeout(() => {
      const inp = document.getElementById('meal-item-grams-input');
      inp.focus();
      inp.select?.();
    }, 300);
  }

  function refreshItemGramsPreview(grams) {
    const food = itemGramsFood;
    if (!food) return;
    const f = grams / 100;
    // Support both raw food object (kcal100) and saved item object (kcal100)
    const kcal100    = food.kcal100    ?? food.kcal;
    const protein100 = food.protein100 ?? food.protein;
    const carbs100   = food.carbs100   ?? food.carbs;
    const fat100     = food.fat100     ?? food.fat;
    const fibre100   = food.fibre100   ?? food.fibre;
    const el = document.getElementById('meal-item-grams-preview');
    el.textContent = grams > 0
      ? `${fmt(kcal100 * f)} kcal · P ${fmt(protein100 * f)}g · C ${fmt(carbs100 * f)}g · F ${fmt(fat100 * f)}g · Fibre ${fmt(fibre100 * f)}g`
      : 'Enter grams to see nutrition';
  }

  function saveItem() {
    const raw   = document.getElementById('meal-item-grams-input').value.trim();
    const grams = parseFloat(raw);
    if (!raw || isNaN(grams) || grams <= 0) {
      document.getElementById('meal-item-grams-error').textContent = 'Please enter a number greater than 0.';
      document.getElementById('meal-item-grams-input').focus();
      return;
    }
    document.getElementById('meal-item-grams-error').textContent = '';

    const food = itemGramsFood;
    const newItem = {
      foodId:     food.id     ?? food.foodId  ?? null,
      foodName:   food.name   ?? food.foodName,
      foodLabel:  food.label  ?? food.foodLabel,
      grams,
      kcal100:    food.kcal100    ?? food.kcal,
      protein100: food.protein100 ?? food.protein,
      carbs100:   food.carbs100   ?? food.carbs,
      fat100:     food.fat100     ?? food.fat,
      fibre100:   food.fibre100   ?? food.fibre,
    };

    if (editItemIdx != null) {
      editMeal.items[editItemIdx] = newItem;
    } else {
      editMeal.items.push(newItem);
    }

    closeSheet('meal-item-grams-sheet');
    renderEditItems();
  }

  function deleteItem() {
    const btn = document.getElementById('meal-item-grams-delete-btn');
    if (btn.dataset.confirm !== 'yes') {
      btn.dataset.confirm = 'yes';
      btn.textContent = 'Tap again to confirm';
      setTimeout(() => {
        btn.dataset.confirm = '';
        btn.textContent = 'Remove Item';
      }, 3000);
      return;
    }
    if (editItemIdx != null) editMeal.items.splice(editItemIdx, 1);
    closeSheet('meal-item-grams-sheet');
    renderEditItems();
  }

  return { init, load };
})();

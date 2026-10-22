'use strict';

/**
 * Foods — manages the "My Foods" screen.
 *
 * Each food record:
 *   { id, name, label, kcal, protein, carbs, fat, fibre }
 *   label: "dry" | "raw" | "cooked" | "as sold"
 *   all nutrition values are per 100 g
 */
const Foods = (() => {
  let editingId  = null;   // null = adding new food, number = editing existing
  let allFoods   = [];
  let searchQuery = '';

  // ── Escape HTML to prevent XSS ───────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Render the food list ─────────────────────────────
  function render() {
    const container = document.getElementById('foods-list-container');
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? allFoods.filter(f => f.name.toLowerCase().includes(q))
      : allFoods;

    if (list.length === 0) {
      container.innerHTML = `<p class="placeholder">${
        q ? 'No foods match your search.' : 'No foods yet.\nTap the + button above to add your first food.'
      }</p>`;
      return;
    }

    container.innerHTML = list.map(f => `
      <div class="food-item" data-id="${f.id}" role="button" tabindex="0"
           aria-label="Edit ${esc(f.name)}">
        <div class="food-item-body">
          <div class="food-item-name">${esc(f.name)}</div>
          <div class="food-item-meta">
            <span class="label-badge">${esc(f.label)}</span>
            <span>${f.kcal} kcal &nbsp;·&nbsp; P ${f.protein}g &nbsp;·&nbsp; C ${f.carbs}g &nbsp;·&nbsp; F ${f.fat}g</span>
          </div>
        </div>
        <span class="food-item-chevron" aria-hidden="true">›</span>
      </div>
    `).join('');

    container.querySelectorAll('.food-item').forEach(el => {
      el.addEventListener('click', () => openEdit(Number(el.dataset.id)));
    });
  }

  // ── Load all foods from IndexedDB ────────────────────
  async function load() {
    allFoods = await DB.getAll('foods');
    allFoods.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    render();
  }

  // ── Segmented control helpers ────────────────────────
  function setLabel(value) {
    document.querySelectorAll('#food-label-ctrl .seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }
  function getLabel() {
    const active = document.querySelector('#food-label-ctrl .seg-btn.active');
    return active ? active.dataset.value : 'dry';
  }

  // ── Clear the form ───────────────────────────────────
  function resetForm() {
    document.getElementById('food-name').value    = '';
    document.getElementById('food-kcal').value    = '';
    document.getElementById('food-protein').value = '';
    document.getElementById('food-carbs').value   = '';
    document.getElementById('food-fat').value     = '';
    document.getElementById('food-fibre').value   = '';
    document.getElementById('food-name-error').textContent = '';
    setLabel('dry');
  }

  // ── Open the add sheet ───────────────────────────────
  function openAdd() {
    editingId = null;
    resetForm();
    document.getElementById('food-sheet-title').textContent = 'Add Food';
    document.getElementById('food-delete-btn').style.display = 'none';
    openSheet();
    // Small delay so the sheet animation finishes before keyboard pops up
    setTimeout(() => document.getElementById('food-name').focus(), 350);
  }

  // ── Open the edit sheet ──────────────────────────────
  function openEdit(id) {
    const food = allFoods.find(f => f.id === id);
    if (!food) return;
    editingId = id;
    document.getElementById('food-sheet-title').textContent = 'Edit Food';
    document.getElementById('food-name').value    = food.name;
    document.getElementById('food-kcal').value    = food.kcal;
    document.getElementById('food-protein').value = food.protein;
    document.getElementById('food-carbs').value   = food.carbs;
    document.getElementById('food-fat').value     = food.fat;
    document.getElementById('food-fibre').value   = food.fibre;
    document.getElementById('food-name-error').textContent = '';
    document.getElementById('food-delete-btn').style.display = '';
    setLabel(food.label);
    openSheet();
  }

  // ── Sheet open / close ───────────────────────────────
  function openSheet() {
    const overlay = document.getElementById('food-sheet');
    overlay.classList.add('open');
    // Scroll the sheet to the top each time it opens
    overlay.querySelector('.sheet').scrollTop = 0;
  }
  function closeSheet() {
    document.getElementById('food-sheet').classList.remove('open');
  }

  // ── Save ─────────────────────────────────────────────
  async function save() {
    const name = document.getElementById('food-name').value.trim();
    if (!name) {
      document.getElementById('food-name-error').textContent = 'Please enter a name.';
      document.getElementById('food-name').focus();
      return;
    }

    const food = {
      name,
      label:   getLabel(),
      kcal:    parseFloat(document.getElementById('food-kcal').value)    || 0,
      protein: parseFloat(document.getElementById('food-protein').value) || 0,
      carbs:   parseFloat(document.getElementById('food-carbs').value)   || 0,
      fat:     parseFloat(document.getElementById('food-fat').value)     || 0,
      fibre:   parseFloat(document.getElementById('food-fibre').value)   || 0,
    };
    if (editingId !== null) food.id = editingId;

    document.getElementById('food-save-btn').disabled = true;
    try {
      await DB.put('foods', food);
      closeSheet();
      await load();
    } finally {
      document.getElementById('food-save-btn').disabled = false;
    }
  }

  // ── Delete ───────────────────────────────────────────
  async function deleteCurrent() {
    if (editingId === null) return;

    const btn = document.getElementById('food-delete-btn');
    // Two-tap confirmation: first tap → warning state, second tap → delete
    if (btn.dataset.confirm !== 'yes') {
      btn.dataset.confirm = 'yes';
      btn.textContent = 'Tap again to confirm delete';
      setTimeout(() => {
        btn.dataset.confirm = '';
        btn.textContent = 'Delete Food';
      }, 3000);
      return;
    }

    btn.disabled = true;
    try {
      await DB.del('foods', editingId);
      closeSheet();
      await load();
    } finally {
      btn.disabled = false;
      btn.dataset.confirm = '';
      btn.textContent = 'Delete Food';
    }
  }

  // ── Public init ──────────────────────────────────────
  function init() {
    // Buttons
    document.getElementById('add-food-btn').addEventListener('click', openAdd);
    document.getElementById('food-save-btn').addEventListener('click', save);
    document.getElementById('food-delete-btn').addEventListener('click', deleteCurrent);
    document.getElementById('food-cancel-btn').addEventListener('click', closeSheet);

    // Tap the dark overlay (not the sheet itself) to close
    document.getElementById('food-sheet').addEventListener('click', e => {
      if (e.target.id === 'food-sheet') closeSheet();
    });

    // Segmented control buttons
    document.querySelectorAll('#food-label-ctrl .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => setLabel(btn.dataset.value));
    });

    // Search
    document.getElementById('food-search').addEventListener('input', e => {
      searchQuery = e.target.value;
      render();
    });

    // Load data on first open of the Foods tab
    load();
  }

  // Expose load() so other modules (e.g. barcode scanner) can refresh the list
  return { init, load, openAdd };
})();

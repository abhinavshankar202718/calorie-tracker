'use strict';

/**
 * Export / Import — all data as a single JSON file.
 *
 * Format: { version: 1, exported: "ISO string", foods, log, meals, waist, days, settings }
 * Each value is the full array of records from that store.
 *
 * Import modes
 *   • Replace — clears every store then writes the backup
 *   • Merge   — adds records from the backup, skipping duplicates by id/key
 */
const Export = (() => {

  const STORES = ['foods', 'log', 'meals', 'waist', 'days', 'settings'];

  // ── Export ─────────────────────────────────────────────
  async function exportData() {
    const bundle = { version: 1, exported: new Date().toISOString() };
    for (const store of STORES) {
      bundle[store] = await DB.getAll(store);
    }

    const json    = JSON.stringify(bundle, null, 2);
    const blob    = new Blob([json], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `calorie-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showBanner('Backup downloaded!');
  }

  // ── Import ─────────────────────────────────────────────
  function openFilePicker() {
    document.getElementById('import-file-input').click();
  }

  async function onFileChosen(e) {
    const file = e.target.files[0];
    e.target.value = '';           // reset so same file can be picked again
    if (!file) return;

    let bundle;
    try {
      bundle = JSON.parse(await file.text());
    } catch {
      showBanner('Invalid file — could not parse JSON.');
      return;
    }

    if (!bundle || bundle.version !== 1 || !Array.isArray(bundle.foods)) {
      showBanner('Unrecognised backup format.');
      return;
    }

    // Show confirm sheet
    document.getElementById('import-sheet-summary').textContent =
      `Foods: ${bundle.foods?.length ?? 0}  ·  Log entries: ${bundle.log?.length ?? 0}  ·  ` +
      `Meals: ${bundle.meals?.length ?? 0}  ·  Waist: ${bundle.waist?.length ?? 0}`;

    // Stash bundle for use when the user picks a mode
    window._importBundle = bundle;
    openSheet('import-sheet');
  }

  async function doImport(mode) {
    const bundle = window._importBundle;
    if (!bundle) return;
    delete window._importBundle;
    closeSheet('import-sheet');

    const btn = document.getElementById(`import-${mode}-btn`);
    if (btn) btn.disabled = true;

    try {
      if (mode === 'replace') {
        for (const store of STORES) {
          await DB.clear(store);
        }
      }

      for (const store of STORES) {
        const rows = bundle[store];
        if (!Array.isArray(rows)) continue;

        for (const row of rows) {
          if (mode === 'merge') {
            // Skip if a record with the same id/key already exists
            const key   = row.id ?? row.key ?? row.date ?? row.name;
            const existing = key != null ? await DB.get(store, key) : null;
            if (existing) continue;
          }
          // Strip the id so IndexedDB assigns a fresh auto-increment when needed
          const record = { ...row };
          if (mode === 'replace' && store !== 'days' && store !== 'settings') {
            // Keep original ids so relationships stay intact
          }
          await DB.put(store, record);
        }
      }

      showBanner(mode === 'replace' ? 'Data restored!' : 'Data merged!');

      // Refresh the currently visible screen
      const activeScreen = document.querySelector('.screen.active')?.id?.replace('screen-', '');
      if (activeScreen === 'today') Log.renderDate(dateKey(currentDate));
      if (activeScreen === 'meals') Meals.load();
      if (activeScreen === 'waist') Waist.load();

    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Helpers ────────────────────────────────────────────
  function openSheet(id)  { document.getElementById(id).classList.add('open'); }
  function closeSheet(id) { document.getElementById(id).classList.remove('open'); }

  function showBanner(msg) {
    const el = document.getElementById('settings-banner');
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2500);
  }

  // ── Init ───────────────────────────────────────────────
  function init() {
    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('import-btn').addEventListener('click', openFilePicker);
    document.getElementById('import-file-input').addEventListener('change', onFileChosen);

    document.getElementById('import-replace-btn').addEventListener('click', () => doImport('replace'));
    document.getElementById('import-merge-btn').addEventListener('click',   () => doImport('merge'));
    document.getElementById('import-cancel-btn').addEventListener('click',  () => closeSheet('import-sheet'));
    document.getElementById('import-sheet').addEventListener('click', e => {
      if (e.target.id === 'import-sheet') closeSheet('import-sheet');
    });
  }

  return { init };
})();

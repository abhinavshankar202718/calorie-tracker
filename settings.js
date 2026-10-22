'use strict';

/**
 * Settings — editable daily targets and app preferences.
 *
 * Stored in IndexedDB 'settings' store as key/value pairs:
 *   { key: 'targets', value: { kcal, protein, fibre } }
 *
 * Log.js reads 'targets' every time it renders a day.
 */
const Settings = (() => {

  const DEFAULTS = { kcal: 2300, protein: 143, fibre: 35 };

  async function init() {
    await load();

    document.getElementById('settings-save-btn').addEventListener('click', save);

    // Reset button
    document.getElementById('settings-reset-btn').addEventListener('click', async () => {
      const btn = document.getElementById('settings-reset-btn');
      if (btn.dataset.confirm !== 'yes') {
        btn.dataset.confirm = 'yes';
        btn.textContent = 'Tap again to reset';
        setTimeout(() => {
          btn.dataset.confirm = '';
          btn.textContent = 'Reset to Defaults';
        }, 3000);
        return;
      }
      btn.dataset.confirm = '';
      btn.textContent = 'Reset to Defaults';
      await DB.del('settings', 'targets');
      await load();
      showBanner('Targets reset to defaults.');
    });
  }

  async function load() {
    const saved = await DB.get('settings', 'targets');
    const t = saved?.value ?? { ...DEFAULTS };
    document.getElementById('target-kcal').value    = t.kcal;
    document.getElementById('target-protein').value = t.protein;
    document.getElementById('target-fibre').value   = t.fibre;
    document.getElementById('settings-error').textContent = '';
  }

  async function save() {
    const kcal    = parseFloat(document.getElementById('target-kcal').value);
    const protein = parseFloat(document.getElementById('target-protein').value);
    const fibre   = parseFloat(document.getElementById('target-fibre').value);

    if ([kcal, protein, fibre].some(v => isNaN(v) || v < 0)) {
      document.getElementById('settings-error').textContent =
        'All targets must be numbers ≥ 0.';
      return;
    }
    document.getElementById('settings-error').textContent = '';

    const btn = document.getElementById('settings-save-btn');
    btn.disabled = true;
    try {
      await DB.put('settings', { key: 'targets', value: { kcal, protein, fibre } });
      showBanner('Targets saved!');
    } finally {
      btn.disabled = false;
    }
  }

  function showBanner(msg) {
    const el = document.getElementById('settings-banner');
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2200);
  }

  return { init };
})();

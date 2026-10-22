'use strict';

/**
 * Waist — log and chart waist measurements.
 *
 * Each record in the 'waist' store:
 *   { id (auto), date: 'YYYY-MM-DD', cm: number, note: string }
 *
 * The chart is a plain SVG (no library) showing up to 20 most-recent readings.
 */
const Waist = (() => {

  const MAX_CHART_POINTS = 20;

  let allReadings = [];   // sorted oldest → newest
  let editId      = null; // id being edited (null = new)

  // ── Helpers ───────────────────────────────────────────
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtDate(d) {
    // 'YYYY-MM-DD' → 'Mon D'
    const [y, m, day] = d.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[m-1]} ${day}`;
  }
  function fmtDateLong(d) {
    const [y, m, day] = d.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${day} ${months[m-1]} ${y}`;
  }
  function openSheet(id)  { document.getElementById(id).classList.add('open'); }
  function closeSheet(id) { document.getElementById(id).classList.remove('open'); }

  // ── Init ──────────────────────────────────────────────
  function init() {
    document.getElementById('add-waist-btn').addEventListener('click', () => openEditSheet(null));
    document.getElementById('waist-save-btn').addEventListener('click',   saveReading);
    document.getElementById('waist-cancel-btn').addEventListener('click', () => closeSheet('waist-edit-sheet'));
    document.getElementById('waist-delete-btn').addEventListener('click', deleteReading);
    document.getElementById('waist-edit-sheet').addEventListener('click', e => {
      if (e.target.id === 'waist-edit-sheet') closeSheet('waist-edit-sheet');
    });
    load();
  }

  // ── Load + render ─────────────────────────────────────
  async function load() {
    const all = await DB.getAll('waist');
    // Sort by date ascending
    allReadings = all.sort((a, b) => a.date.localeCompare(b.date));
    render();
  }

  function render() {
    const container = document.getElementById('waist-content');

    if (!allReadings.length) {
      container.innerHTML = `<p class="placeholder">No measurements yet.\nTap + to log your waist.</p>`;
      return;
    }

    const chartPoints = allReadings.slice(-MAX_CHART_POINTS);
    container.innerHTML = buildChart(chartPoints) + buildList();

    // Wire list items
    container.querySelectorAll('.waist-row').forEach(row => {
      row.addEventListener('click', () => {
        const rec = allReadings.find(r => r.id === Number(row.dataset.id));
        if (rec) openEditSheet(rec);
      });
    });
  }

  // ══════════════════════════════════════════════════════
  // SVG LINE CHART
  // ══════════════════════════════════════════════════════
  function buildChart(points) {
    if (points.length < 2) {
      // Single point: just show a stat card instead of a chart
      const p = points[0];
      return `<div class="waist-single-stat">
        <div class="waist-stat-cm">${p.cm}<span class="waist-stat-unit">cm</span></div>
        <div class="waist-stat-date">${fmtDateLong(p.date)}</div>
      </div>`;
    }

    // ── Layout constants ────────────────────────────────
    const W = 360, H = 200;
    const PAD = { top: 16, right: 16, bottom: 40, left: 48 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top  - PAD.bottom;

    const values = points.map(p => p.cm);
    const minV = Math.floor(Math.min(...values) - 1);
    const maxV = Math.ceil( Math.max(...values) + 1);
    const rangeV = maxV - minV || 1;

    // Map value → pixel y (flipped: high value = low y)
    const toY = v => PAD.top + plotH * (1 - (v - minV) / rangeV);
    // Map index → pixel x
    const toX = i => PAD.left + (i / (points.length - 1)) * plotW;

    // ── Build path ──────────────────────────────────────
    const coords = points.map((p, i) => [toX(i), toY(p.cm)]);
    const linePath = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');

    // Area fill path (close along bottom)
    const areaPath = linePath +
      ` L${coords[coords.length-1][0].toFixed(1)},${(PAD.top + plotH).toFixed(1)}` +
      ` L${coords[0][0].toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`;

    // ── Y-axis ticks (3–4 ticks) ────────────────────────
    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const v = minV + (rangeV * i / tickCount);
      return { v: Math.round(v * 10) / 10, y: toY(v) };
    });

    // ── X-axis labels: show first, last, and middle ─────
    const xLabels = [];
    if (points.length <= 6) {
      points.forEach((p, i) => xLabels.push({ label: fmtDate(p.date), x: toX(i) }));
    } else {
      // Show ~4 evenly-spaced labels
      const step = Math.floor((points.length - 1) / 3);
      [0, step, step * 2, points.length - 1].forEach(i => {
        xLabels.push({ label: fmtDate(points[i].date), x: toX(i) });
      });
    }

    // ── Last reading callout ─────────────────────────────
    const last = points[points.length - 1];
    const lastX = coords[coords.length - 1][0];
    const lastY = coords[coords.length - 1][1];
    const calloutText = `${last.cm} cm`;

    // ── Trend arrow ─────────────────────────────────────
    const first = points[0];
    const diff  = last.cm - first.cm;
    const trendLabel = diff === 0 ? '→ no change'
      : diff < 0 ? `↓ ${Math.abs(diff).toFixed(1)} cm`
      : `↑ +${diff.toFixed(1)} cm`;
    const trendColor = diff < 0 ? 'var(--primary)' : diff > 0 ? 'var(--danger)' : 'var(--text-2)';

    return `
      <div class="waist-chart-wrap">
        <div class="waist-chart-header">
          <span class="waist-chart-title">Waist Trend</span>
          <span class="waist-chart-trend" style="color:${trendColor}">${esc(trendLabel)}</span>
        </div>
        <svg class="waist-chart-svg" viewBox="0 0 ${W} ${H}" aria-label="Waist trend chart">

          <!-- Grid lines -->
          ${yTicks.map(t => `
            <line x1="${PAD.left}" y1="${t.y.toFixed(1)}" x2="${W - PAD.right}" y2="${t.y.toFixed(1)}"
                  stroke="var(--border)" stroke-width="1"/>
          `).join('')}

          <!-- Area fill -->
          <defs>
            <linearGradient id="waist-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stop-color="var(--primary)" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#waist-area-grad)"/>

          <!-- Line -->
          <path d="${linePath}" fill="none" stroke="var(--primary)" stroke-width="2.5"
                stroke-linejoin="round" stroke-linecap="round"/>

          <!-- Data point dots -->
          ${coords.map((c, i) => `
            <circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${i === coords.length-1 ? 5 : 3}"
                    fill="${i === coords.length-1 ? 'var(--primary)' : 'var(--bg)'}"
                    stroke="var(--primary)" stroke-width="2"/>
          `).join('')}

          <!-- Callout for last point -->
          <text x="${Math.min(lastX, W - PAD.right - 40).toFixed(1)}"
                y="${Math.max(lastY - 10, PAD.top + 10).toFixed(1)}"
                fill="var(--primary)" font-size="11" font-weight="700"
                text-anchor="${lastX > W * 0.7 ? 'end' : 'start'}">${esc(calloutText)}</text>

          <!-- Y-axis labels -->
          ${yTicks.map(t => `
            <text x="${(PAD.left - 6).toFixed(1)}" y="${(t.y + 4).toFixed(1)}"
                  fill="var(--text-2)" font-size="10" text-anchor="end">${t.v}</text>
          `).join('')}

          <!-- X-axis labels -->
          ${xLabels.map(l => `
            <text x="${l.x.toFixed(1)}" y="${(H - 6).toFixed(1)}"
                  fill="var(--text-2)" font-size="10" text-anchor="middle">${esc(l.label)}</text>
          `).join('')}
        </svg>
      </div>`;
  }

  // ══════════════════════════════════════════════════════
  // MEASUREMENT LIST
  // ══════════════════════════════════════════════════════
  function buildList() {
    const rows = [...allReadings].reverse(); // newest first
    return `<div class="waist-list">` +
      rows.map(r => `
        <div class="waist-row" data-id="${r.id}" role="button" tabindex="0">
          <div class="waist-row-body">
            <span class="waist-row-cm">${r.cm}<span class="waist-row-unit"> cm</span></span>
            <span class="waist-row-date">${fmtDateLong(r.date)}</span>
            ${r.note ? `<span class="waist-row-note">${esc(r.note)}</span>` : ''}
          </div>
          <span class="food-item-chevron" aria-hidden="true">›</span>
        </div>`
      ).join('') +
    `</div>`;
  }

  // ══════════════════════════════════════════════════════
  // ADD / EDIT SHEET
  // ══════════════════════════════════════════════════════
  function openEditSheet(rec) {
    editId = rec?.id ?? null;

    document.getElementById('waist-sheet-title').textContent = rec ? 'Edit Measurement' : 'Log Waist';
    document.getElementById('waist-cm-input').value   = rec ? String(rec.cm) : '';
    document.getElementById('waist-note-input').value = rec?.note ?? '';
    document.getElementById('waist-date-input').value = rec?.date ?? dateKey(currentDate);
    document.getElementById('waist-error').textContent = '';
    document.getElementById('waist-delete-btn').style.display = rec ? '' : 'none';

    const delBtn = document.getElementById('waist-delete-btn');
    delBtn.dataset.confirm = '';
    delBtn.textContent = 'Delete';

    openSheet('waist-edit-sheet');
    setTimeout(() => document.getElementById('waist-cm-input').focus(), 300);
  }

  async function saveReading() {
    const cmRaw = document.getElementById('waist-cm-input').value.trim();
    const cm    = parseFloat(cmRaw);
    const date  = document.getElementById('waist-date-input').value.trim();
    const note  = document.getElementById('waist-note-input').value.trim();

    if (!cmRaw || isNaN(cm) || cm <= 0) {
      document.getElementById('waist-error').textContent = 'Enter a valid measurement in cm.';
      document.getElementById('waist-cm-input').focus();
      return;
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      document.getElementById('waist-error').textContent = 'Enter a valid date.';
      return;
    }
    document.getElementById('waist-error').textContent = '';

    const record = { date, cm, note };
    if (editId != null) record.id = editId;

    const btn = document.getElementById('waist-save-btn');
    btn.disabled = true;
    try {
      await DB.put('waist', record);
      closeSheet('waist-edit-sheet');
      await load();
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteReading() {
    const btn = document.getElementById('waist-delete-btn');
    if (btn.dataset.confirm !== 'yes') {
      btn.dataset.confirm = 'yes';
      btn.textContent = 'Tap again to confirm';
      setTimeout(() => {
        btn.dataset.confirm = '';
        btn.textContent = 'Delete';
      }, 3000);
      return;
    }
    if (editId == null) return;
    btn.disabled = true;
    try {
      await DB.del('waist', editId);
      closeSheet('waist-edit-sheet');
      await load();
    } finally {
      btn.disabled = false;
    }
  }

  return { init, load };
})();

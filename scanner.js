'use strict';

/**
 * Scanner — barcode scanning via camera + Open Food Facts lookup.
 *
 * Flow:
 *   1. User taps the barcode icon on the Foods screen.
 *   2. Camera opens (html5-qrcode library, loaded lazily from CDN).
 *   3. On detection → camera stops → API call → editable result sheet.
 *   4. User edits any value → "Save to My Foods".
 *   5. If product not found (or user taps "Enter Manually") → same form, empty.
 *
 * Only the barcode NUMBER is ever sent over the internet.
 */
const Scanner = (() => {
  let qrScanner    = null;   // Html5Qrcode instance
  let isScanning   = false;
  let detected     = false;  // prevents firing the callback twice for one scan

  // ── Lazy-load the html5-qrcode library ─────────────────
  function loadLibrary() {
    if (window.Html5Qrcode) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      // html5-qrcode v2.3.8 from jsDelivr CDN
      s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload  = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ── Open the camera overlay ─────────────────────────────
  async function openScanner() {
    detected = false;
    document.getElementById('scanner-status').textContent = 'Starting camera…';
    document.getElementById('scanner-overlay').classList.add('open');

    try {
      await loadLibrary();
    } catch {
      document.getElementById('scanner-status').textContent =
        'Could not load scanner. Check your internet connection, or tap "Enter Manually".';
      return;
    }

    startCamera();
  }

  // ── Close the camera overlay ────────────────────────────
  async function closeScanner() {
    await stopCamera();
    document.getElementById('scanner-overlay').classList.remove('open');
  }

  // ── Start the camera stream ─────────────────────────────
  function startCamera() {
    const container = document.getElementById('qr-reader');
    container.innerHTML = '';  // clear any previous camera element

    qrScanner = new Html5Qrcode('qr-reader', { verbose: false });

    // Barcode formats we care about (numeric values from Html5QrcodeSupportedFormats enum)
    // EAN_13=9, EAN_8=10, UPC_A=14, UPC_E=15, CODE_128=5, CODE_39=3
    const formats = window.Html5QrcodeSupportedFormats
      ? [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
        ]
      : [9, 10, 14, 15, 5, 3];  // fallback numeric values

    qrScanner.start(
      { facingMode: 'environment' },          // back camera
      {
        fps: 10,
        qrbox: { width: 280, height: 110 },  // scan area box shown on screen
        formatsToSupport: formats,
      },
      onBarcodeDetected,
      () => {}                               // per-frame error → ignore quietly
    ).then(() => {
      isScanning = true;
      document.getElementById('scanner-status').textContent =
        'Point the camera at a barcode';
    }).catch(err => {
      const msg = String(err.message || err);
      if (msg.toLowerCase().includes('permission')) {
        document.getElementById('scanner-status').textContent =
          'Camera permission was denied. Please allow camera access in Safari Settings, then try again.';
      } else {
        document.getElementById('scanner-status').textContent =
          'Could not open camera. Tap "Enter Manually" below.';
      }
    });
  }

  // ── Stop the camera stream ──────────────────────────────
  async function stopCamera() {
    if (qrScanner && isScanning) {
      try { await qrScanner.stop(); } catch { /* ignore */ }
      isScanning = false;
    }
  }

  // ── Called when a barcode is found ─────────────────────
  async function onBarcodeDetected(barcode) {
    if (detected) return;   // skip duplicate callbacks for the same scan
    detected = true;

    await stopCamera();
    document.getElementById('scanner-overlay').classList.remove('open');

    // Show the result sheet with a loading state
    openResultSheet();
    document.getElementById('barcode-status').textContent = 'Looking up barcode…';
    document.getElementById('barcode-num').textContent = barcode;
    clearResultForm();

    try {
      const product = await lookupBarcode(barcode);
      fillResultForm(barcode, product);
    } catch {
      fillResultForm(barcode, null);
    }
  }

  // ── Open Food Facts lookup ──────────────────────────────
  async function lookupBarcode(barcode) {
    // Only the barcode number is sent; no personal data.
    const url =
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
      `?fields=product_name,nutriments`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Network error');

    const json = await resp.json();
    if (json.status !== 1 || !json.product) throw new Error('Not found');
    return json.product;
  }

  // ── Fill the editable result form ───────────────────────
  function fillResultForm(barcode, product) {
    const n = product?.nutriments || {};

    document.getElementById('barcode-num').textContent = barcode;
    document.getElementById('barcode-name').value =
      product?.product_name || product?.product_name_en || '';

    // Round nutrition values to 1 decimal place (or leave blank if missing)
    const r = v => (v !== undefined && v !== null && v !== '') ? (Math.round(Number(v) * 10) / 10) : '';

    document.getElementById('barcode-kcal').value    = r(n['energy-kcal_100g'] ?? n['energy-kcal']);
    document.getElementById('barcode-protein').value = r(n['proteins_100g']);
    document.getElementById('barcode-carbs').value   = r(n['carbohydrates_100g']);
    document.getElementById('barcode-fat').value     = r(n['fat_100g']);
    document.getElementById('barcode-fibre').value   = r(n['fiber_100g'] ?? n['fibers_100g']);

    if (product) {
      const hasName = document.getElementById('barcode-name').value.trim();
      document.getElementById('barcode-status').textContent = hasName
        ? '✓ Found — check the values and save.'
        : 'Found, but name is missing. Please fill it in.';
    } else {
      document.getElementById('barcode-status').textContent =
        'Product not found in the database. Fill in the details yourself.';
    }
  }

  function clearResultForm() {
    ['barcode-name','barcode-kcal','barcode-protein','barcode-carbs',
     'barcode-fat','barcode-fibre'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('barcode-name-error').textContent = '';
    setLabel('as sold');
  }

  // ── "Enter Manually" button ─────────────────────────────
  async function openManualEntry() {
    await closeScanner();
    document.getElementById('barcode-num').textContent = '(manual entry)';
    clearResultForm();
    document.getElementById('barcode-status').textContent = 'Enter the details below.';
    openResultSheet();
    setTimeout(() => document.getElementById('barcode-name').focus(), 300);
  }

  // ── Result sheet helpers ─────────────────────────────────
  function openResultSheet() {
    const sheet = document.getElementById('barcode-result-sheet');
    sheet.classList.add('open');
    sheet.querySelector('.sheet').scrollTop = 0;
  }
  function closeResultSheet() {
    document.getElementById('barcode-result-sheet').classList.remove('open');
  }

  // ── Segmented control ───────────────────────────────────
  function setLabel(value) {
    document.querySelectorAll('#barcode-label-ctrl .seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }
  function getLabel() {
    const active = document.querySelector('#barcode-label-ctrl .seg-btn.active');
    return active ? active.dataset.value : 'as sold';
  }

  // ── Save to My Foods ────────────────────────────────────
  async function saveToFoods() {
    const name = document.getElementById('barcode-name').value.trim();
    if (!name) {
      document.getElementById('barcode-name-error').textContent = 'Please enter a name.';
      document.getElementById('barcode-name').focus();
      return;
    }
    document.getElementById('barcode-name-error').textContent = '';

    const food = {
      name,
      label:   getLabel(),
      kcal:    parseFloat(document.getElementById('barcode-kcal').value)    || 0,
      protein: parseFloat(document.getElementById('barcode-protein').value) || 0,
      carbs:   parseFloat(document.getElementById('barcode-carbs').value)   || 0,
      fat:     parseFloat(document.getElementById('barcode-fat').value)     || 0,
      fibre:   parseFloat(document.getElementById('barcode-fibre').value)   || 0,
    };

    const btn = document.getElementById('barcode-save-btn');
    btn.disabled = true;
    try {
      await DB.put('foods', food);
      closeResultSheet();
      await Foods.load();     // refresh the My Foods list
    } finally {
      btn.disabled = false;
    }
  }

  // ── Public init ─────────────────────────────────────────
  function init() {
    document.getElementById('scan-btn').addEventListener('click', openScanner);
    document.getElementById('scanner-close').addEventListener('click', closeScanner);
    document.getElementById('scanner-manual').addEventListener('click', openManualEntry);
    document.getElementById('barcode-save-btn').addEventListener('click', saveToFoods);
    document.getElementById('barcode-cancel-btn').addEventListener('click', closeResultSheet);

    // Tap the dark overlay backdrop to close the result sheet
    document.getElementById('barcode-result-sheet').addEventListener('click', e => {
      if (e.target.id === 'barcode-result-sheet') closeResultSheet();
    });

    // Segmented control
    document.querySelectorAll('#barcode-label-ctrl .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => setLabel(btn.dataset.value));
    });
  }

  return { init, closeScanner };
})();

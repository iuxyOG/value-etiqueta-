/* Etiqueta Shopee \u2014 Value (v3)
 * - UI premium (Value)
 * - Bot\xe3o "Processar" habilita corretamente
 * - Detecta embed (Elementor/iframe) e simplifica header
 * - Worker do PDF.js configurado
 * - Preset A4 (2 lado a lado) para ficar igual ao modelo do Shopee
 */

(() => {
  const PDFJS_VERSION = '2.14.305';

  const els = {
    pdfInput: document.getElementById('pdfInput'),
    dropZone: document.getElementById('dropZone'),
    btnPick: document.getElementById('btnPick'),
    btnClear: document.getElementById('btnClear'),
    fileName: document.getElementById('fileName'),
    fileMeta: document.getElementById('fileMeta'),
    preset: document.getElementById('preset'),
    presetChips: document.getElementById('presetChips'),
    btnProcess: document.getElementById('btnProcess'),
    btnDownload: document.getElementById('btnDownload'),
    btnPrint: document.getElementById('btnPrint'),
    autoPrint: document.getElementById('autoPrint'),
    status: document.getElementById('status'),
    meta: document.getElementById('meta'),
    counter: document.getElementById('counter'),
    preview: document.getElementById('preview'),
    btnViewCompact: document.getElementById('btnViewCompact'),
    btnViewLarge: document.getElementById('btnViewLarge'),
    btnFullscreen: document.getElementById('btnFullscreen'),
    progressWrap: document.getElementById('progressWrap'),
    progressText: document.getElementById('progressText'),
    progressPct: document.getElementById('progressPct'),
    progressFill: document.getElementById('progressFill'),

    // Stats
    statsBox: document.getElementById('statsBox'),
    statTotal: document.getElementById('statTotal'),
    statPages: document.getElementById('statPages'),
    statTime: document.getElementById('statTime'),

    previewModal: document.getElementById('previewModal'),
    modalPreview: document.getElementById('modalPreview'),
    modalClose: document.getElementById('modalClose'),
    modalCols1: document.getElementById('modalCols1'),
    modalCols2: document.getElementById('modalCols2'),
    modalCounter: document.getElementById('modalCounter'),

    viewerModal: document.getElementById('viewerModal'),
    viewerBody: document.getElementById('viewerBody'),
    viewerStage: document.getElementById('viewerStage'),
    viewerImg: document.getElementById('viewerImg'),
    viewerCounter: document.getElementById('viewerCounter'),
    viewerZoomPct: document.getElementById('viewerZoomPct'),
    viewerFit: document.getElementById('viewerFit'),
    viewer100: document.getElementById('viewer100'),
    viewerZoomIn: document.getElementById('viewerZoomIn'),
    viewerZoomOut: document.getElementById('viewerZoomOut'),
    viewerPrev: document.getElementById('viewerPrev'),
    viewerNext: document.getElementById('viewerNext'),
    viewerClose: document.getElementById('viewerClose'),

    toasts: document.getElementById('toasts'),
    steps: Array.from(document.querySelectorAll('.stepper .step')),
  };

  // libs
  let pdfjsLib;
  let jsPDF;

  const state = {
    labels: [],        // {dataUrl, wPx, hPx}
    presetKey: '',
    libsReady: false,
    processing: false,
    previewMode: 'compact',
    modalOpen: false,
    modalCols: 2,
    processStartTime: 0,
    lastPdfDoc: null,  // para reutilizar no print

    viewerOpen: false,
    viewerIdx: 0,
    viewerZoom: 1,
    viewerMode: 'fit', // fit | 100 | custom
  };

  const presets = {
    // Entrada A4 com 2 etiquetas (lado a lado) -> Sa\xedda A4 com 2 etiquetas (lado a lado no topo)
    'shopee_a4_2up_to_a4_2up_side': {
      label: 'Shopee \u2014 A4 (2 por p\xe1gina) \u2192 A4 (2 lado a lado)',
      cols: 2,
      rows: 1,
      output: 'a4',
      pack: 'a4_2up_side_top',
    },

    // Entrada A4 com 4 etiquetas -> Sa\xedda A4 com 2 etiquetas lado a lado
    'shopee_a4_4up_to_a4_2up_side': {
      label: 'Shopee \u2014 A4 (4 por p\xe1gina) \u2192 A4 (2 lado a lado)',
      cols: 2,
      rows: 2,
      output: 'a4',
      pack: 'a4_2up_side_top',
    },

    // Entrada A4 4up -> Sa\xedda A6 (1 por p\xe1gina)
    'shopee_a4_4up_to_a6': {
      label: 'Shopee \u2014 A4 (4 por p\xe1gina) \u2192 A6 (1 por p\xe1gina)',
      cols: 2,
      rows: 2,
      output: 'a6',
      pack: 'single',
    },

    // Entrada 10x15 (1 por p\xe1gina) -> Sa\xedda A4 (2 empilhadas)
    'label_10x15_to_a4_2up_stack': {
      label: '10x15 (1 por p\xe1gina) \u2192 A4 (2 empilhadas)',
      cols: 1,
      rows: 1,
      output: 'a4',
      pack: 'a4_2up_stack',
    },

    // Entrada 10x15 (1 por p\xe1gina) -> Sa\xedda A4 (1 centralizada)
    'label_10x15_to_a4_1up': {
      label: '10x15 (1 por p\xe1gina) \u2192 A4 (1 centralizada)',
      cols: 1,
      rows: 1,
      output: 'a4',
      pack: 'a4_1up_center',
    },
  };

  function setStatus(text, kind = 'idle') {
    els.status.textContent = text;
    els.status.classList.remove('status--idle', 'status--ok', 'status--warn', 'status--err');
    els.status.classList.add(`status--${kind}`);
  }

  function setMeta(text) {
    els.meta.textContent = text || '';
  }

  function syncBodyLock() {
    const open = !!(state.modalOpen || state.viewerOpen);
    document.body.classList.toggle('is-modal-open', open);
  }

  function updateCounters() {
    const total = state.labels.length;
    const shown = Math.min(8, total);
    if (els.counter) els.counter.textContent = total ? `Exibindo ${shown}/${total}` : '';
    if (els.modalCounter) els.modalCounter.textContent = total ? `${total} etiquetas` : '';
    if (els.viewerCounter && state.viewerOpen) {
      els.viewerCounter.textContent = total ? `${state.viewerIdx + 1}/${total}` : '—';
    }
  }

  function clearPreview() {
    els.preview.innerHTML = '<div class="empty">Selecione um PDF e clique em <b>Processar</b>.</div>';
  }

  function setPreviewMode(mode) {
    state.previewMode = mode === 'large' ? 'large' : 'compact';
    els.preview.classList.remove('is-compact', 'is-large');
    els.preview.classList.add(state.previewMode === 'large' ? 'is-large' : 'is-compact');

    if (els.btnViewCompact) els.btnViewCompact.classList.toggle('is-active', state.previewMode === 'compact');
    if (els.btnViewLarge) els.btnViewLarge.classList.toggle('is-active', state.previewMode === 'large');
  }

  function thumbHtml(lbl, i, { anim = true, delay = 0, badge = true } = {}) {
    const cls = anim ? 'thumb thumb--anim' : 'thumb';
    const style = anim ? `style="animation-delay:${delay}ms"` : '';
    return `
      <div class="${cls}" data-idx="${i}" role="button" tabindex="0" aria-label="Abrir etiqueta ${i + 1}" ${style}>
        ${badge ? `<div class="thumbBadge">#${i + 1}</div>` : ''}
        <img loading="lazy" alt="Etiqueta ${i + 1}" src="${lbl.dataUrl}">
      </div>
    `;
  }

  function renderThumbs(container, labels, { max = Infinity, badge = true, animated = true } = {}) {
    if (!labels.length) {
      container.innerHTML = '<div class="empty">Nada para mostrar ainda.</div>';
      return;
    }
    const limit = Math.min(labels.length, max);
    const html = [];
    for (let i = 0; i < limit; i++) {
      html.push(thumbHtml(labels[i], i, { anim: animated, delay: i * 24, badge }));
    }
    container.innerHTML = html.join('');
  }

  function renderPreview(labels) {
    renderThumbs(els.preview, labels, { max: 8, badge: true, animated: true });
    updateCounters();
  }

  function updateButtons() {
    const hasFile = !!els.pdfInput.files?.[0];
    const hasLabels = state.labels.length > 0;
    els.btnProcess.disabled = !state.libsReady || !hasFile || state.processing;
    els.btnDownload.disabled = !state.libsReady || state.processing || !hasLabels;
    if (els.btnPrint) els.btnPrint.disabled = !state.libsReady || state.processing || !hasLabels;
    if (els.btnClear) els.btnClear.disabled = state.processing || !hasFile;
    if (els.btnFullscreen) els.btnFullscreen.disabled = state.processing || !hasLabels;
    if (els.btnViewCompact) els.btnViewCompact.disabled = state.processing;
    if (els.btnViewLarge) els.btnViewLarge.disabled = state.processing;
    updateStepper();
  }

  function disableWhileProcessing(isProcessing) {
    state.processing = isProcessing;
    els.btnProcess.textContent = isProcessing ? 'Processando\u2026' : 'Processar';
    updateButtons();
  }

  function updateStepper() {
    if (!els.steps?.length) return;

    const hasFile = !!els.pdfInput.files?.[0];
    const hasLabels = state.labels.length > 0;

    // 0: nada
    // 1: arquivo selecionado (preset pronto)
    // 2: processando
    // 3: processado
    let stage = 0;
    if (hasFile) stage = 1;
    if (hasFile && state.processing) stage = 2;
    if (hasFile && !state.processing && hasLabels) stage = 3;

    const set = (step, { active = false, done = false, loading = false } = {}) => {
      step.classList.remove('is-active', 'is-done', 'is-loading');
      if (active) step.classList.add('is-active');
      if (done) step.classList.add('is-done');
      if (loading) step.classList.add('is-loading');
    };

    const s1 = els.steps.find(s => s.dataset.step === '1');
    const s2 = els.steps.find(s => s.dataset.step === '2');
    const s3 = els.steps.find(s => s.dataset.step === '3');

    if (stage === 0) {
      if (s1) set(s1, { active: true });
      if (s2) set(s2, {});
      if (s3) set(s3, {});
      return;
    }

    if (stage === 1) {
      if (s1) set(s1, { done: true });
      if (s2) set(s2, { active: true });
      if (s3) set(s3, {});
      return;
    }

    if (stage === 2) {
      if (s1) set(s1, { done: true });
      if (s2) set(s2, { done: true });
      if (s3) set(s3, { active: true, loading: true });
      return;
    }

    // stage === 3
    if (s1) set(s1, { done: true });
    if (s2) set(s2, { done: true });
    if (s3) set(s3, { done: true });
  }

  function updatePresetChips() {
    if (!els.presetChips) return;
    const preset = getPreset();
    if (!preset) {
      els.presetChips.innerHTML = '';
      return;
    }

    const label = String(preset.label || '').trim();
    const parts = label.split('→').map(s => s.trim()).filter(Boolean);
    const left = parts[0] || label;
    const right = parts[1] || '';

    let fonte = '';
    let entrada = left;
    if (left.includes('—')) {
      const s = left.split('—').map(x => x.trim()).filter(Boolean);
      fonte = s[0] || '';
      entrada = s.slice(1).join('—').trim() || left;
    }

    const saida = right || '';

    const chips = [];
    if (fonte) chips.push(`<span class="chip chip--soft">${escapeHtml(fonte)}</span>`);
    if (entrada) chips.push(`<span class="chip chip--outline">Entrada: ${escapeHtml(entrada)}</span>`);
    if (saida) chips.push(`<span class="chip chip--accent">Saída: ${escapeHtml(saida)}</span>`);
    chips.push(`<span class="chip chip--soft">Final: ${escapeHtml(String(preset.output || '').toUpperCase())}</span>`);

    els.presetChips.innerHTML = chips.join('');
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getPreset() {
    const key = els.preset.value;
    state.presetKey = key;
    return presets[key];
  }

  async function loadLibs() {
    // Espera os scripts defer carregarem
    pdfjsLib = window['pdfjsLib'];
    jsPDF = window['jspdf']?.jsPDF;

    if (!pdfjsLib) throw new Error('pdf.js n\xe3o carregou (verifique conex\xe3o/console).');
    if (!jsPDF) throw new Error('jsPDF n\xe3o carregou (verifique conex\xe3o/console).');

    // Worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  }

  function fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsArrayBuffer(file);
    });
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    const dp = i === 0 ? 0 : (i === 1 ? 0 : 1);
    return `${v.toFixed(dp)} ${units[i]}`;
  }

  function setFileUI(file) {
    if (!els.fileName || !els.fileMeta || !els.btnClear) return;
    if (file) {
      els.fileName.textContent = file.name;
      els.fileMeta.textContent = `${formatBytes(file.size)} • PDF`;
      els.btnClear.disabled = false;
    } else {
      els.fileName.textContent = 'Nenhum arquivo selecionado';
      els.fileMeta.textContent = 'Arraste e solte aqui • PDF';
      els.btnClear.disabled = true;
    }
  }

  function setPreviewLoading(text = 'Processando…') {
    els.preview.innerHTML = `<div class="loading"><span class="spinner" aria-hidden="true"></span>${text}</div>`;
  }

  function setProgress({ text = 'Processando…', current = 0, total = 1 } = {}) {
    if (!els.progressWrap || !els.progressText || !els.progressPct || !els.progressFill) return;
    const t = Math.max(1, Number(total) || 1);
    const c = Math.min(t, Math.max(0, Number(current) || 0));
    const pct = Math.round((c / t) * 100);
    els.progressWrap.hidden = false;
    els.progressText.textContent = text;
    els.progressPct.textContent = `${pct}%`;
    els.progressFill.style.width = `${pct}%`;
  }

  function hideProgress() {
    if (!els.progressWrap) return;
    els.progressWrap.hidden = true;
    if (els.progressFill) els.progressFill.style.width = '0%';
  }

  function toast(message, kind = 'ok') {
    if (!els.toasts) return;
    const type = (kind === 'warn' || kind === 'err') ? kind : 'ok';

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;

    const icon = document.createElement('div');
    icon.className = 'toastIcon';
    icon.textContent = type === 'ok' ? '✓' : (type === 'warn' ? '!' : '×');

    const text = document.createElement('div');
    text.className = 'toastText';
    text.textContent = String(message || '').trim();

    el.appendChild(icon);
    el.appendChild(text);
    els.toasts.appendChild(el);

    window.setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'opacity .18s ease, transform .18s ease';
      window.setTimeout(() => el.remove(), 220);
    }, 2800);
  }

  function setModalCols(cols) {
    state.modalCols = cols === 1 ? 1 : 2;
    if (!els.modalPreview) return;
    els.modalPreview.classList.remove('is-cols-1', 'is-cols-2');
    els.modalPreview.classList.add(state.modalCols === 1 ? 'is-cols-1' : 'is-cols-2');
    if (els.modalCols1) els.modalCols1.classList.toggle('is-active', state.modalCols === 1);
    if (els.modalCols2) els.modalCols2.classList.toggle('is-active', state.modalCols === 2);
  }

  function openModal(focusIdx = null) {
    if (!els.previewModal || !els.modalPreview) return;
    if (!state.labels.length) {
      toast('Nada para visualizar ainda.', 'warn');
      return;
    }

    state.modalOpen = true;
    syncBodyLock();
    els.previewModal.hidden = false;
    setModalCols(state.modalCols || 2);
    renderThumbs(els.modalPreview, state.labels, { max: Infinity, badge: true, animated: false });
    updateCounters();

    if (Number.isInteger(focusIdx)) {
      const target = els.modalPreview.querySelector(`[data-idx="${focusIdx}"]`);
      if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }

  function closeModal() {
    if (!els.previewModal) return;
    state.modalOpen = false;
    syncBodyLock();
    els.previewModal.hidden = true;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function computeFitScale() {
    if (!els.viewerBody || !els.viewerImg) return 1;
    const rect = els.viewerBody.getBoundingClientRect();
    const nw = els.viewerImg.naturalWidth || 1;
    const nh = els.viewerImg.naturalHeight || 1;
    // padding interno do viewerBody + uma folga
    const pad = 56;
    const fit = Math.min((rect.width - pad) / nw, (rect.height - pad) / nh);
    return clamp(fit, 0.1, 5);
  }

  function syncViewerPanMode() {
    if (!els.viewerBody || !els.viewerImg) return;
    // se estiver em fit, sempre centraliza.
    if (state.viewerMode === 'fit') {
      els.viewerBody.classList.remove('is-pan');
      return;
    }
    // se estiver com zoom maior que o fit, habilita pan natural (top-left)
    const fit = computeFitScale();
    const z = Number(state.viewerZoom) || 1;
    els.viewerBody.classList.toggle('is-pan', z > fit + 0.02);
  }

  function applyViewerZoom() {
    const z = clamp(Number(state.viewerZoom) || 1, 0.1, 5);
    state.viewerZoom = z;
    // Em vez de transform (que pode "bugar" scroll/centralização em alguns browsers),
    // ajustamos o tamanho real do <img>.
    if (els.viewerImg && (els.viewerImg.naturalWidth || els.viewerImg.width)) {
      const nw = els.viewerImg.naturalWidth || els.viewerImg.width;
      els.viewerImg.style.width = `${Math.round(nw * z)}px`;
    }
    if (els.viewerZoomPct) els.viewerZoomPct.textContent = `${Math.round(z * 100)}%`;
    syncViewerPanMode();
    updateCounters();
  }

  function setViewerMode(mode) {
    const m = (mode === '100') ? '100' : (mode === 'fit' ? 'fit' : 'custom');
    state.viewerMode = m;
    if (els.viewerFit) els.viewerFit.classList.toggle('is-active', m === 'fit');
    if (els.viewer100) els.viewer100.classList.toggle('is-active', m === '100');
    if (m === 'fit') state.viewerZoom = computeFitScale();
    if (m === '100') state.viewerZoom = 1;
    applyViewerZoom();
  }

  function zoomBy(mult) {
    state.viewerMode = 'custom';
    if (els.viewerFit) els.viewerFit.classList.remove('is-active');
    if (els.viewer100) els.viewer100.classList.remove('is-active');
    state.viewerZoom = clamp((Number(state.viewerZoom) || 1) * mult, 0.1, 5);
    applyViewerZoom();
  }

  function setViewerImage() {
    const total = state.labels.length;
    if (!total || !els.viewerImg) return;
    const idx = clamp(Number(state.viewerIdx) || 0, 0, total - 1);
    state.viewerIdx = idx;

    if (els.viewerPrev) els.viewerPrev.disabled = idx <= 0;
    if (els.viewerNext) els.viewerNext.disabled = idx >= total - 1;
    if (els.viewerCounter) els.viewerCounter.textContent = `${idx + 1}/${total}`;

    const src = state.labels[idx]?.dataUrl;
    if (!src) {
      toast('Não consegui carregar a etiqueta (imagem inválida).', 'err');
      return;
    }

    // evita ícone de imagem quebrada durante troca
    els.viewerImg.style.width = 'auto';
    els.viewerImg.src = src;

    els.viewerImg.onload = () => {
      if (!state.viewerOpen) return;
      if (state.viewerMode === 'fit') setViewerMode('fit');
      else applyViewerZoom();
    };

    els.viewerImg.onerror = () => {
      if (!state.viewerOpen) return;
      toast('Falha ao abrir a etiqueta (erro ao carregar imagem).', 'err');
    };

    updateCounters();
  }

  function setViewerIndex(idx) {
    state.viewerIdx = idx;
    setViewerImage();
  }

  function openViewer(idx = 0) {
    if (!els.viewerModal) return;
    if (!state.labels.length) {
      toast('Nada para visualizar ainda.', 'warn');
      return;
    }

    closeModal();

    state.viewerOpen = true;
    state.viewerIdx = clamp(Number(idx) || 0, 0, state.labels.length - 1);
    els.viewerModal.hidden = false;
    syncBodyLock();

    state.viewerMode = 'fit';
    state.viewerZoom = 1;
    setViewerImage();
  }

  function closeViewer() {
    if (!els.viewerModal) return;
    state.viewerOpen = false;
    els.viewerModal.hidden = true;
    // evita “ícone quebrado” quando o modal evita o src antigo
    if (els.viewerImg) {
      els.viewerImg.removeAttribute('src');
      els.viewerImg.style.width = 'auto';
    }
    syncBodyLock();
  }

  function setPdfFile(file) {
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    els.pdfInput.files = dt.files;
    els.pdfInput.dispatchEvent(new Event('change', { bubbles: true }));
  }


  function findLastInkRow(imgData, w, h, opts = {}) {
    const threshold = opts.threshold ?? 250;
    const stepX = opts.stepX ?? 6;
    const stepY = opts.stepY ?? 2;
    const data = imgData.data;

    for (let y = h - 1; y >= 0; y -= stepY) {
      const row = y * w * 4;
      for (let x = 0; x < w; x += stepX) {
        const i = row + x * 4;
        const a = data[i + 3];
        if (!a) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r < threshold || g < threshold || b < threshold) return y;
      }
    }
    return -1;
  }

  function trimCanvasBottom(srcCanvas, imgData, padPx = 18) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const last = findLastInkRow(imgData, w, h);

    if (last < 0) return srcCanvas;

    const newH = Math.max(120, Math.min(h, last + padPx));
    if (newH >= h) return srcCanvas;

    const out = document.createElement('canvas');
    out.width = w;
    out.height = newH;

    const octx = out.getContext('2d');
    octx.drawImage(srcCanvas, 0, 0, w, newH, 0, 0, w, newH);
    return out;
  }

  // Remove a "área de checklist" das etiquetas da Shopee.
  // Heurística:
  // - varre de baixo para cima procurando uma linha escura "espalhada" pela largura;
  // - geralmente é a linha tracejada/separador entre a etiqueta e o checklist.
  // Fallback: recorte por proporção.

  // Remove a "área de checklist" das etiquetas da Shopee.
  // Versão 2 (bem mais robusta):
  //  A) tenta achar a linha separadora (tracejada) pela cobertura na largura;
  //  B) se falhar, acha a última faixa densa (barcode) e corta no primeiro "vazio" abaixo;
  //  C) fallback por proporção.
  function cropShopeeChecklist(srcCanvas, imgData) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const data = imgData.data;

    // 1) Projeção horizontal: "densidade" de pixels escuros por linha.
    const stepX = 3;
    const grayThr = 215; // mais permissivo (captura cinza/antialias)
    const rowSamples = Math.max(1, Math.floor(w / stepX));
    const ratios = new Float32Array(h);

    for (let y = 0; y < h; y++) {
      let dark = 0;
      const row = y * w * 4;
      for (let x = 0; x < w; x += stepX) {
        const i = row + x * 4;
        const a = data[i + 3];
        if (!a) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const gray = (r * 0.299) + (g * 0.587) + (b * 0.114);
        if (gray < grayThr) dark++;
      }
      ratios[y] = dark / rowSamples;
    }

    const cropTo = (newH) => {
      const nh = Math.max(180, Math.min(h, Math.floor(newH)));
      if (nh >= h || nh <= 0) return srcCanvas;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = nh;
      const octx = out.getContext('2d');
      octx.drawImage(srcCanvas, 0, 0, w, nh, 0, 0, w, nh);
      return out;
    };

    // 2A) Detecta a linha separadora (tracejada) — baixa densidade, alta cobertura na largura.
    const segments = 10;
    const segW = w / segments;
    const segThr = Math.max(6, segments - 3);
    const minRatio = 0.012;
    const maxRatio = 0.16; // evita pegar barcode/caixas pretas
    const yMin = Math.floor(h * 0.22); // antes era 0.55 (perdia a linha em alguns PDFs)

    for (let y = h - 1; y >= yMin; y--) {
      const ratio = ratios[y];
      if (ratio < minRatio || ratio > maxRatio) continue;

      // cobertura por segmentos
      const segHits = new Array(segments).fill(0);
      const row = y * w * 4;
      for (let x = 0; x < w; x += stepX) {
        const i = row + x * 4;
        const a = data[i + 3];
        if (!a) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const gray = (r * 0.299) + (g * 0.587) + (b * 0.114);
        if (gray < grayThr) {
          const s = Math.min(segments - 1, Math.floor(x / segW));
          segHits[s] = 1;
        }
      }
      const covered = segHits.reduce((acc, v) => acc + (v ? 1 : 0), 0);
      if (covered < segThr) continue;

      // Corta um pouquinho acima da linha
      return cropTo(y - 10);
    }

    // 2B) Fallback inteligente: acha a última faixa densa (barcode) e corta no primeiro "vazio" abaixo.
    const denseThr = 0.20;
    const lowThr = 0.008;
    const run = 6;
    const searchFrom = Math.floor(h * 0.15);
    const searchTo = Math.floor(h * 0.90);

    let y0 = -1;
    for (let y = searchTo; y >= searchFrom; y--) {
      if (ratios[y] >= denseThr) { y0 = y; break; }
    }

    if (y0 >= 0) {
      let cnt = 0;
      for (let y = y0 + 1; y < h; y++) {
        if (ratios[y] <= lowThr) cnt++;
        else cnt = 0;
        if (cnt >= run) {
          const yCut = y - run + 1;
          return cropTo(yCut - 2);
        }
      }
    }

    // 2C) Último fallback por proporção (mais agressivo do que a versão anterior)
    return cropTo(h * 0.66);
  }

  async function extractLabelsFromPdf(arrayBuffer, preset, onPageProgress) {
    const scale = 2; // qualidade
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    if (typeof onPageProgress === 'function') {
      onPageProgress({ page: 0, total: pdf.numPages, phase: 'start' });
    }

    const labels = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (typeof onPageProgress === 'function') {
        onPageProgress({ page: pageNum - 1, total: pdf.numPages, phase: 'render' });
      }
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport }).promise;

      const cellW = Math.floor(canvas.width / preset.cols);
      const cellH = Math.floor(canvas.height / preset.rows);

      for (let r = 0; r < preset.rows; r++) {
        for (let c = 0; c < preset.cols; c++) {
          const crop = document.createElement('canvas');
          crop.width = cellW;
          crop.height = cellH;
          const cctx = crop.getContext('2d');

          const sx = c * cellW;
          const sy = r * cellH;

          cctx.drawImage(canvas, sx, sy, cellW, cellH, 0, 0, cellW, cellH);

          // Heur\xedstica simples para descartar \u201cquadro\u201d vazio (muito branco)
          const imgData = cctx.getImageData(0, 0, cellW, cellH);
          let nonWhite = 0;
          const step = 16; // amostragem
          for (let i = 0; i < imgData.data.length; i += 4 * step) {
            const rr = imgData.data[i];
            const gg = imgData.data[i + 1];
            const bb = imgData.data[i + 2];
            if (rr < 245 || gg < 245 || bb < 245) nonWhite++;
          }

          // se for praticamente branco, ignora
          if (nonWhite < 120) continue;

          // 1) SEMPRE remove o checklist da Shopee automaticamente
          let canvasOut = cropShopeeChecklist(crop, imgData);

          // 2) Trim leve para remover sobra branca (sem afetar o recorte)
          const padPx = Math.round(cellH * 0.012) + 10;
          const octx = canvasOut.getContext('2d');
          const outData = octx.getImageData(0, 0, canvasOut.width, canvasOut.height);
          const trimmed = trimCanvasBottom(canvasOut, outData, padPx);

          labels.push({
            dataUrl: trimmed.toDataURL('image/png'),
            wPx: trimmed.width,
            hPx: trimmed.height,
          });
          }
      }

      if (typeof onPageProgress === 'function') {
        onPageProgress({ page: pageNum, total: pdf.numPages, phase: 'donePage' });
      }
    }

    if (typeof onPageProgress === 'function') {
      onPageProgress({ page: pdf.numPages, total: pdf.numPages, phase: 'done' });
    }

    // Retorna objeto com labels e info do PDF
    labels.numPages = pdf.numPages;
    return labels;
  }

  function addLabelFitted(doc, lbl, x, y, maxW, maxH, align = 'top') {
    // Usa as dimensões reais da imagem recortada para manter proporção correta
    const imgW = lbl.wPx;
    const imgH = lbl.hPx;
    
    if (!imgW || !imgH) {
      console.warn('Etiqueta sem dimensões válidas', lbl);
      return;
    }

    // Proporção da imagem (largura / altura)
    const imgRatio = imgW / imgH;
    
    // Calcula dimensões de desenho que cabem no slot mantendo proporção
    let drawW, drawH;
    if (imgRatio > (maxW / maxH)) {
      // Imagem é mais "larga" que o slot - limita pela largura
      drawW = maxW;
      drawH = maxW / imgRatio;
    } else {
      // Imagem é mais "alta" que o slot - limita pela altura
      drawH = maxH;
      drawW = maxH * imgRatio;
    }

    // Centraliza horizontalmente no slot
    const dx = x + (maxW - drawW) / 2;
    // Alinha no topo ou centraliza verticalmente
    const dy = align === 'top' ? y : (y + (maxH - drawH) / 2);

    doc.addImage(lbl.dataUrl, 'PNG', dx, dy, drawW, drawH, undefined, 'FAST');
  }

  function exportToPdf(labels, preset) {
    const out = preset.output;
    const pack = preset.pack;

    // Doc base - A4 = 210x297mm
    const doc = new jsPDF({
      unit: 'mm',
      format: out === 'a6' ? 'a6' : 'a4',
      compress: true,
    });

    const pageW = doc.internal.pageSize.getWidth();  // 210mm para A4
    const pageH = doc.internal.pageSize.getHeight(); // 297mm para A4

    const margin = 3; // margem mínima
    const gap = 2;

    const addNewPage = () => doc.addPage(out === 'a6' ? 'a6' : 'a4');

    // Para TODOS os presets: 1 etiqueta por página A4, ocupando toda a folha
    // (igual à pré-visualização)
    const maxW = pageW - 2 * margin;
    const maxH = pageH - 2 * margin;
    
    for (let i = 0; i < labels.length; i++) {
      if (i > 0) addNewPage();
      addLabelFitted(doc, labels[i], margin, margin, maxW, maxH, 'top');
    }

    return doc;
  }

  async function onProcess() {
    const file = els.pdfInput.files?.[0];
    if (!file) {
      setStatus('Selecione um PDF primeiro.', 'warn');
      updateButtons();
      return;
    }

    const preset = getPreset();
    
    // Registrar tempo de início
    state.processStartTime = Date.now();
    let pdf = null;

    try {
      disableWhileProcessing(true);
      closeModal();
      hideStats();
      setStatus('Lendo PDF…', 'idle');
      setMeta('');
      setPreviewLoading('Lendo PDF…');
      setProgress({ text: 'Lendo PDF…', current: 0, total: 1 });

      const buf = await fileToArrayBuffer(file);
      setStatus('Processando páginas…', 'idle');
      setPreviewLoading('Processando páginas…');

      const labels = await extractLabelsFromPdf(buf, preset, (p) => {
        if (!p) return;
        pdf = p.pdf; // guardar referência
        const total = Number(p.total) || 1;
        const page = Number(p.page) || 0;
        if (p.phase === 'start') {
          setProgress({ text: `Processando páginas… (0/${total})`, current: 0, total });
          return;
        }
        if (p.phase === 'donePage') {
          setProgress({ text: `Processando página ${page}/${total}`, current: page, total });
          return;
        }
        if (p.phase === 'done') {
          setProgress({ text: 'Finalizando…', current: total, total });
        }
      });

      state.labels = labels;
      renderPreview(labels);
      updateButtons();

      // Calcular tempo de processamento
      const processTime = ((Date.now() - state.processStartTime) / 1000).toFixed(1);

      if (!labels.length) {
        setStatus('Não encontrei etiquetas nesse PDF (ou o PDF está muito "branco").', 'warn');
        setMeta('Dica: teste outro preset (A4 2/4 por página).');
        toast('Nenhuma etiqueta detectada. Tente outro preset.', 'warn');
        hideStats();
        return;
      }

      // Mostrar estatísticas
      showStats(labels.length, labels.numPages || 1, processTime);

      setStatus(`Pronto: ${labels.length} etiqueta(s) detectada(s).`, 'ok');
      setMeta(`Etiquetas: ${labels.length} • Preset: ${preset.label}`);
      toast(`Pronto! ${labels.length} etiqueta(s) detectada(s).`, 'ok');

      // Imprimir automaticamente se a opção estiver ativada
      if (els.autoPrint?.checked) {
        setTimeout(() => {
          onPrint();
        }, 300);
      }

    } catch (err) {
      console.error(err);
      setStatus('Erro ao processar. Abra o Console (F12) e me envie a mensagem.', 'err');
      setMeta(String(err?.message || err));
      toast('Erro ao processar o PDF.', 'err');
      state.labels = [];
      renderPreview([]);
      hideStats();
    } finally {
      hideProgress();
      disableWhileProcessing(false);
      updateButtons();
    }
  }

  function showStats(total, pages, time) {
    if (!els.statsBox) return;
    els.statsBox.hidden = false;
    if (els.statTotal) els.statTotal.textContent = total;
    if (els.statPages) els.statPages.textContent = pages;
    if (els.statTime) els.statTime.textContent = `${time}s`;
  }

  function hideStats() {
    if (els.statsBox) els.statsBox.hidden = true;
  }

  function onPrint() {
    if (!state.labels.length) {
      setStatus('Nada para imprimir. Primeiro processe um PDF.', 'warn');
      toast('Processe um PDF primeiro!', 'warn');
      return;
    }

    const preset = getPreset();

    try {
      setStatus('Preparando impressão…', 'idle');
      
      // Gera o PDF
      const doc = exportToPdf(state.labels, preset);
      
      // Converte para blob e abre em nova janela para impressão
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      // Abre em nova janela e dispara impressão
      const printWindow = window.open(pdfUrl, '_blank');
      
      if (printWindow) {
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 250);
        };
        setStatus('Janela de impressão aberta ✅', 'ok');
        toast('Janela de impressão aberta!', 'ok');
      } else {
        // Fallback: se popup bloqueado, baixa o PDF
        toast('Popup bloqueado. Baixando PDF...', 'warn');
        doc.save(`etiquetas_${preset.output}_${Date.now()}.pdf`);
        setStatus('PDF baixado (popup bloqueado).', 'warn');
      }
      
      // Limpa URL após um tempo
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
      
    } catch (err) {
      console.error(err);
      setStatus('Erro ao preparar impressão.', 'err');
      toast('Erro ao preparar impressão.', 'err');
    }
  }

  function onDownload() {
    if (!state.labels.length) {
      setStatus('Nada para baixar. Primeiro processe um PDF.', 'warn');
      return;
    }

    const preset = getPreset();
    
    try {
      setStatus('Gerando PDF final…', 'idle');
      const doc = exportToPdf(state.labels, preset);
      const name = `etiquetas_${preset.output}_${Date.now()}.pdf`;
      doc.save(name);
      setStatus('PDF gerado e baixado ✅', 'ok');
      toast('PDF gerado e baixado ✅', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('Erro ao gerar o PDF final.', 'err');
      setMeta(String(err?.message || err));
      toast('Erro ao gerar o PDF final.', 'err');
    }
  }

  function initPresetOptions() {
    const keys = Object.keys(presets);
    els.preset.innerHTML = keys.map(k => `<option value="${k}">${presets[k].label}</option>`).join('');
    els.preset.value = 'shopee_a4_2up_to_a4_2up_side';
    state.presetKey = els.preset.value;
    updatePresetChips();
  }

  function applyEmbedMode() {
    const params = new URLSearchParams(window.location.search || '');
    const v = String(params.get('embed') || '').trim().toLowerCase();
    const force = (v === '1' || v === 'true' || v === 'yes');

    if (force) {
      document.body.classList.add('is-embed');
      return;
    }

    try {
      if (window.self !== window.top) document.body.classList.add('is-embed');
    } catch (_) {
      // cross-origin access => assume embed
      document.body.classList.add('is-embed');
    }
  }

  async function init() {
    applyEmbedMode();

    // Segurança: garante que modais nunca iniciem abertos (alguns browsers/restauração de sessão podem manter o estado)
    state.modalOpen = false;
    state.viewerOpen = false;
    if (els.previewModal) els.previewModal.hidden = true;
    if (els.viewerModal) els.viewerModal.hidden = true;
    document.body.classList.remove('is-modal-open');

    clearPreview();
    setPreviewMode('compact');
    setModalCols(2);
    hideProgress();
    hideStats();
    setStatus('Carregando…', 'idle');
    setMeta('');
    updateButtons();
    setFileUI(null);

    // placeholder invisível para evitar ícone de imagem quebrada no viewer
    if (els.viewerImg) {
      els.viewerImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      els.viewerImg.style.width = 'auto';
    }

    // Preview tools
    if (els.btnViewCompact) els.btnViewCompact.addEventListener('click', () => setPreviewMode('compact'));
    if (els.btnViewLarge) els.btnViewLarge.addEventListener('click', () => setPreviewMode('large'));
    if (els.btnFullscreen) els.btnFullscreen.addEventListener('click', () => openModal(null));

    // Click (ou Enter/Espaço) na thumb abre o viewer (zoom)
    if (els.preview) {
      els.preview.addEventListener('click', (e) => {
        const t = e.target?.closest?.('.thumb');
        if (!t) return;
        const idx = Number(t.getAttribute('data-idx'));
        if (Number.isFinite(idx)) openViewer(idx);
      });
      els.preview.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const t = e.target?.closest?.('.thumb');
        if (!t) return;
        e.preventDefault();
        const idx = Number(t.getAttribute('data-idx'));
        if (Number.isFinite(idx)) openViewer(idx);
      });
    }

    // Modal fullscreen: clique/Enter/Espaço abre viewer
    if (els.modalPreview) {
      els.modalPreview.addEventListener('click', (e) => {
        const t = e.target?.closest?.('.thumb');
        if (!t) return;
        const idx = Number(t.getAttribute('data-idx'));
        if (Number.isFinite(idx)) openViewer(idx);
      });
      els.modalPreview.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const t = e.target?.closest?.('.thumb');
        if (!t) return;
        e.preventDefault();
        const idx = Number(t.getAttribute('data-idx'));
        if (Number.isFinite(idx)) openViewer(idx);
      });
    }

    // Modal listeners
    if (els.previewModal) {
      els.previewModal.addEventListener('click', (e) => {
        const close = e.target?.closest?.('[data-close="1"]');
        if (close) closeModal();
      });
    }
    if (els.modalClose) els.modalClose.addEventListener('click', closeModal);
    if (els.modalCols1) els.modalCols1.addEventListener('click', () => setModalCols(1));
    if (els.modalCols2) els.modalCols2.addEventListener('click', () => setModalCols(2));

    // Viewer listeners
    if (els.viewerModal) {
      els.viewerModal.addEventListener('click', (e) => {
        const close = e.target?.closest?.('[data-close-viewer="1"]');
        if (close) closeViewer();
      });
    }
    if (els.viewerClose) els.viewerClose.addEventListener('click', closeViewer);
    if (els.viewerPrev) els.viewerPrev.addEventListener('click', () => setViewerIndex(state.viewerIdx - 1));
    if (els.viewerNext) els.viewerNext.addEventListener('click', () => setViewerIndex(state.viewerIdx + 1));
    if (els.viewerFit) els.viewerFit.addEventListener('click', () => setViewerMode('fit'));
    if (els.viewer100) els.viewer100.addEventListener('click', () => setViewerMode('100'));
    if (els.viewerZoomIn) els.viewerZoomIn.addEventListener('click', () => zoomBy(1.15));
    if (els.viewerZoomOut) els.viewerZoomOut.addEventListener('click', () => zoomBy(1 / 1.15));

    if (els.viewerBody) {
      els.viewerBody.addEventListener('wheel', (e) => {
        if (!state.viewerOpen) return;
        if (!e.ctrlKey) return;
        e.preventDefault();
        const mult = e.deltaY < 0 ? 1.12 : (1 / 1.12);
        zoomBy(mult);
      }, { passive: false });
    }

    window.addEventListener('resize', () => {
      if (state.viewerOpen && state.viewerMode === 'fit') setViewerMode('fit');
    });

    // Atalhos
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.viewerOpen) {
          closeViewer();
          return;
        }
        if (state.modalOpen) {
          closeModal();
          return;
        }
      }

      if (state.viewerOpen) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setViewerIndex(state.viewerIdx - 1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setViewerIndex(state.viewerIdx + 1);
          return;
        }
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          zoomBy(1.15);
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          zoomBy(1 / 1.15);
          return;
        }
      }
      if (e.ctrlKey && (e.key === 'Enter' || e.key === 'NumpadEnter')) {
        if (!els.btnProcess.disabled) els.btnProcess.click();
      }
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        if (!els.btnDownload.disabled) {
          e.preventDefault();
          els.btnDownload.click();
        }
      }
    });

    // Upload premium (clique + arrastar/soltar)
    if (els.btnPick) els.btnPick.addEventListener('click', () => els.pdfInput.click());
    if (els.dropZone) {
      const openPicker = () => els.pdfInput.click();

      els.dropZone.addEventListener('click', (e) => {
        // evita duplo clique quando o usuário clica no botão interno
        if (e.target?.closest?.('button')) return;
        openPicker();
      });

      els.dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker();
        }
      });

      const stop = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };

      ['dragenter', 'dragover'].forEach((evt) => {
        els.dropZone.addEventListener(evt, (e) => {
          stop(e);
          els.dropZone.classList.add('is-dragover');
        });
      });

      ['dragleave', 'dragend'].forEach((evt) => {
        els.dropZone.addEventListener(evt, (e) => {
          stop(e);
          els.dropZone.classList.remove('is-dragover');
        });
      });

      els.dropZone.addEventListener('drop', (e) => {
        stop(e);
        els.dropZone.classList.remove('is-dragover');
        const file = e.dataTransfer?.files?.[0];
        if (file && file.type === 'application/pdf') setPdfFile(file);
        else setStatus('Solte um arquivo PDF válido.', 'warn');
      });
    }

    if (els.btnClear) {
      els.btnClear.addEventListener('click', () => {
        els.pdfInput.value = '';
        state.labels = [];
        closeModal();
        hideProgress();
        renderPreview([]);
        setMeta('');
        setFileUI(null);
        setStatus('Selecione um PDF para começar.', 'idle');
        updateButtons();
      });
    }

    // Listeners
    els.pdfInput.addEventListener('change', () => {
      state.labels = [];
      closeModal();
      hideProgress();
      renderPreview([]);
      setMeta('');
      setFileUI(els.pdfInput.files?.[0] || null);
      if (els.pdfInput.files?.[0]) {
        setStatus('PDF selecionado. Clique em Processar.', 'idle');
      } else {
        setStatus('Selecione um PDF.', 'idle');
      }
      updateButtons();
    });

    els.btnProcess.addEventListener('click', onProcess);
    els.btnDownload.addEventListener('click', onDownload);
    if (els.btnPrint) els.btnPrint.addEventListener('click', onPrint);

    // Carregar preferência de auto-print do localStorage
    if (els.autoPrint) {
      const savedAutoPrint = localStorage.getItem('etiqueta_autoPrint');
      if (savedAutoPrint === 'true') els.autoPrint.checked = true;
      
      els.autoPrint.addEventListener('change', () => {
        localStorage.setItem('etiqueta_autoPrint', els.autoPrint.checked ? 'true' : 'false');
      });
    }

    initPresetOptions();

    // Ao trocar preset, pede reprocessamento (evita recorte errado)
    els.preset.addEventListener('change', () => {
      state.labels = [];
      closeModal();
      hideProgress();
      renderPreview([]);
      setMeta('');
      updatePresetChips();
      if (els.pdfInput.files?.[0]) setStatus('Preset alterado. Clique em Processar.', 'idle');
      else setStatus('Selecione um PDF.', 'idle');
      updateButtons();
    });

    try {
      await loadLibs();
      state.libsReady = true;
      setStatus('Pronto para processar \u2705', 'ok');
      setMeta('Dica: se o PDF do Shopee vier em A4 com 2 etiquetas, use o primeiro preset.');
    } catch (err) {
      console.error(err);
      state.libsReady = false;
      setStatus('Falha ao carregar libs (PDF.js / jsPDF).', 'err');
      setMeta(String(err?.message || err));
    } finally {
      updateButtons();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

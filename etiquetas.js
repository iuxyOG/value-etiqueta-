(() => {
  'use strict';

  // ------------------------------------------------------------------
  // Constantes
  // ------------------------------------------------------------------
  const MM_TO_PT = 2.834645669;
  const LABEL_WIDTH_MM = 100;
  const LABEL_HEIGHT_MM = 150;
  const LABEL_WIDTH_PT = LABEL_WIDTH_MM * MM_TO_PT;
  const LABEL_HEIGHT_PT = LABEL_HEIGHT_MM * MM_TO_PT;
  const OUTPUT_PAGE = [LABEL_WIDTH_PT, LABEL_HEIGHT_PT];

  const PDFJS_VERSION = '2.14.305';
  const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  const MAX_THUMBS = 8;

  // Detecção de layout
  const DETECT_SCALE = 1.5;     // resolução do render usado para achar o conteúdo
  const INK_MAX = 244;          // por canal RGB: acima disso é considerado "branco"
  const PAD_PX = 4;             // folga ao redor do conteúdo (px do canvas de detecção)
  const MIN_CONTENT_MM = 15;    // ignora respingos menores que isso na maior dimensão

  // Combinação etiqueta + checklist na mesma página 10x15
  const COMBINE_MARGIN_MM = 3;
  const COMBINE_GAP_MM = 2;
  const CHECK_MAX_MM = 46;      // altura máxima do bloco de checklist na página combinada

  // Modos (a grade é detectada automaticamente em ambos):
  // 'auto'  -> junta a etiqueta com o checklist do mesmo pedido.
  // 'nochk' -> só as etiquetas; o checklist é descartado.
  const MODES = [
    { id: 'auto', label: 'Etiqueta + checklist' },
    { id: 'nochk', label: 'Só etiqueta (sem checklist)' },
  ];
  const DEFAULT_MODE_ID = 'auto';

  const ERROR_MESSAGES = {
    invalidFile: 'Arquivo inválido',
    encrypted: 'PDF protegido por senha',
    empty: 'Nenhuma etiqueta encontrada no PDF.',
    generic: 'Falha ao gerar, tente novamente',
  };

  const OUTPUT_FILE_PREFIX = 'etiquetas_100x150';

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  const state = {
    file: null,
    modeId: DEFAULT_MODE_ID,
    processing: false,
    cancelRequested: false,
    inputPages: 0,
    outputPages: 0,
    outputBytes: null,
    outputBlobUrl: '',
    previewPdf: null,
    viewerPage: 1,
    viewerScale: 1,
    processStart: 0,
    breakdown: null,
  };

  function resetOutput() {
    state.inputPages = 0;
    state.outputPages = 0;
    state.outputBytes = null;
    state.outputBlobUrl = '';
    state.breakdown = null;
  }

  const dom = {
    modeSelect: document.getElementById('modeSelect'),
    modeHint: document.getElementById('modeHint'),
    fileInput: document.getElementById('fileInput'),
    dropZone: document.getElementById('dropZone'),
    btnPick: document.getElementById('btnPick'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    autoPrint: document.getElementById('autoPrint'),
    btnGenerate: document.getElementById('btnGenerate'),
    btnCancel: document.getElementById('btnCancel'),
    btnDownload: document.getElementById('btnDownload'),
    btnOpenPreview: document.getElementById('btnOpenPreview'),
    btnTestPage: document.getElementById('btnTestPage'),
    statusText: document.getElementById('statusText'),
    progressText: document.getElementById('progressText'),
    progressFill: document.getElementById('progressFill'),
    elapsedTime: document.getElementById('elapsedTime'),
    etaText: document.getElementById('etaText'),
    previewCanvasContainer: document.getElementById('previewCanvasContainer'),
    previewCanvas: document.getElementById('previewCanvas'),
    previewEmpty: document.getElementById('previewEmpty'),
    previewThumbs: document.getElementById('previewThumbs'),
    summary: document.getElementById('summary'),
    summaryMode: document.getElementById('summaryMode'),
    summaryInput: document.getElementById('summaryInput'),
    summaryOutput: document.getElementById('summaryOutput'),
    toasts: document.getElementById('toastStack'),

    viewerModal: document.getElementById('viewerModal'),
    viewerCanvas: document.getElementById('viewerCanvas'),
    viewerClose: document.getElementById('viewerClose'),
    viewerPrev: document.getElementById('viewerPrev'),
    viewerNext: document.getElementById('viewerNext'),
    viewerZoomIn: document.getElementById('viewerZoomIn'),
    viewerZoomOut: document.getElementById('viewerZoomOut'),
    viewerScale: document.getElementById('viewerScale'),
  };

  let pdfjsLib = null;
  let detectCanvas = null;

  // ------------------------------------------------------------------
  // Utilidades de PDF / validação
  // ------------------------------------------------------------------
  function validatePdfFile(file) {
    if (!file) return { ok: false, message: ERROR_MESSAGES.invalidFile };
    const name = String(file.name || '');
    const hasPdfType = file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
    const hasSize = Number.isFinite(file.size) && file.size > 0;
    if (!hasPdfType || !hasSize) return { ok: false, message: ERROR_MESSAGES.invalidFile };
    return { ok: true, message: '' };
  }

  function getPdfLib() {
    const lib = window.PDFLib;
    if (!lib || !lib.PDFDocument) {
      throw new Error('PDFLib não carregou.');
    }
    return lib;
  }

  function initPdfJs() {
    const lib = window.pdfjsLib || window['pdfjsLib'];
    if (!lib) {
      pdfjsLib = null;
      return;
    }
    pdfjsLib = lib;
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    }
  }

  function getModeById(modeId) {
    return MODES.find((mode) => mode.id === modeId) || MODES[0];
  }

  // ------------------------------------------------------------------
  // Geometria: grade, recorte e posicionamento
  // ------------------------------------------------------------------
  const near = (value, target, tol = 25) => Math.abs(value - target) <= tol;

  function gridForMode(modeId, widthMm, heightMm) {
    const mode = getModeById(modeId);
    if (mode.cols && mode.rows) {
      return { cols: mode.cols, rows: mode.rows };
    }
    // Automático: 1×1 se já é 10×15; senão 2×2 (caso comum das folhas A4 da Shopee).
    const isLabel =
      (near(widthMm, LABEL_WIDTH_MM) && near(heightMm, LABEL_HEIGHT_MM)) ||
      (near(widthMm, LABEL_HEIGHT_MM) && near(heightMm, LABEL_WIDTH_MM));
    if (isLabel) return { cols: 1, rows: 1 };
    return { cols: 2, rows: 2 };
  }

  function snapAngle(angle) {
    const v = (((Number(angle) || 0) % 360) + 360) % 360;
    if (v >= 45 && v < 135) return 90;
    if (v >= 135 && v < 225) return 180;
    if (v >= 225 && v < 315) return 270;
    return 0;
  }

  // rotação (graus CCW, convenção pdf-lib) para deixar o conteúdo em pé
  function rotateToUpright(textAngle) {
    return (360 - snapAngle(textAngle)) % 360;
  }

  // âncora de desenho conforme a rotação (espelha o cálculo do bounding box girado)
  function rotationPlacement(rotation, scaledW, scaledH, ox, oy) {
    if (rotation === 90) return { x: ox + scaledH, y: oy };
    if (rotation === 180) return { x: ox + scaledW, y: oy + scaledH };
    if (rotation === 270) return { x: ox, y: oy + scaledW };
    return { x: ox, y: oy };
  }

  // bounding box do conteúdo (pixels não-brancos) dentro de uma região do canvas
  function inkBoundingBox(data, width, x0, y0, x1, y1) {
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = y0; y < y1; y += 1) {
      const row = y * width;
      for (let x = x0; x < x1; x += 1) {
        const i = (row + x) * 4;
        if (data[i] + data[i + 1] + data[i + 2] < INK_MAX * 3) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
  }

  function dominantRotation(items, x0, y0, x1, y1) {
    const counts = {};
    for (const it of items) {
      if (it.cx < x0 || it.cx >= x1 || it.cy < y0 || it.cy >= y1) continue;
      counts[it.angle] = (counts[it.angle] || 0) + it.weight;
    }
    let best = 0, bestN = -1;
    for (const k of Object.keys(counts)) {
      if (counts[k] > bestN) { bestN = counts[k]; best = Number(k); }
    }
    return rotateToUpright(best);
  }

  // Tokens "código" (ex.: nº do Pedido) para parear etiqueta com seu checklist
  function tokenize(str) {
    const out = [];
    const parts = String(str || '').toUpperCase().split(/[^A-Z0-9]+/);
    for (const p of parts) {
      if (p.length >= 10 && /[0-9]/.test(p) && /[A-Z]/.test(p)) out.push(p);
    }
    return out;
  }

  function collectTokens(items, x0, y0, x1, y1) {
    const set = new Set();
    for (const it of items) {
      if (it.cx < x0 || it.cx >= x1 || it.cy < y0 || it.cy >= y1) continue;
      for (const tk of tokenize(it.str)) set.add(tk);
    }
    return set;
  }

  function shareTokens(a, b) {
    if (!a || !b) return false;
    for (const t of a) { if (b.has(t)) return true; }
    return false;
  }

  function getDetectCanvas() {
    if (!detectCanvas) detectCanvas = document.createElement('canvas');
    return detectCanvas;
  }

  // ------------------------------------------------------------------
  // Detecção de células (etiquetas/checklists) numa página via pdf.js
  // ------------------------------------------------------------------
  async function detectCellsForPage(page, modeId) {
    const base = page.getViewport({ scale: 1 });
    const pageWpt = base.width;
    const pageHpt = base.height;
    const grid = gridForMode(modeId, pageWpt / MM_TO_PT, pageHpt / MM_TO_PT);

    const viewport = page.getViewport({ scale: DETECT_SCALE });
    const canvas = getDetectCanvas();
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    await page.render({ canvasContext: ctx, viewport }).promise;

    const W = canvas.width;
    const H = canvas.height;
    const data = ctx.getImageData(0, 0, W, H).data;

    // Itens de texto -> ângulo + centro em coordenadas do canvas (para detectar rotação)
    let textItems = [];
    try {
      const tc = await page.getTextContent();
      textItems = tc.items
        .map((it) => {
          const t = it.transform;
          const angle = snapAngle((Math.atan2(t[1], t[0]) * 180) / Math.PI);
          const cx = (t[4] / pageWpt) * W;
          const cy = ((pageHpt - t[5]) / pageHpt) * H;
          const weight = String(it.str || '').trim().length;
          return { angle, cx, cy, weight, str: String(it.str || '') };
        })
        .filter((o) => o.weight > 0);
    } catch (err) {
      textItems = [];
    }

    const cells = [];
    const sx = pageWpt / W;
    const sy = pageHpt / H;
    const cw = W / grid.cols;
    const ch = H / grid.rows;

    for (let r = 0; r < grid.rows; r += 1) {
      for (let c = 0; c < grid.cols; c += 1) {
        const rx0 = Math.floor(c * cw);
        const ry0 = Math.floor(r * ch);
        const rx1 = Math.floor((c + 1) * cw);
        const ry1 = Math.floor((r + 1) * ch);

        const bb = inkBoundingBox(data, W, rx0, ry0, rx1, ry1);
        if (!bb) continue; // célula vazia

        const x0 = Math.max(rx0, bb.x0 - PAD_PX);
        const y0 = Math.max(ry0, bb.y0 - PAD_PX);
        const x1 = Math.min(rx1, bb.x1 + PAD_PX);
        const y1 = Math.min(ry1, bb.y1 + PAD_PX);

        const wMm = ((x1 - x0) * sx) / MM_TO_PT;
        const hMm = ((y1 - y0) * sy) / MM_TO_PT;
        if (Math.max(wMm, hMm) < MIN_CONTENT_MM) continue; // respingo/ruído

        const rotation = dominantRotation(textItems, x0, y0, x1, y1);
        const tokens = collectTokens(textItems, x0, y0, x1, y1);
        const crop = {
          x: x0 * sx,
          y: pageHpt - y1 * sy, // bottom (y-up, espaço do pdf-lib)
          w: (x1 - x0) * sx,
          h: (y1 - y0) * sy,
        };
        cells.push({ crop, rotation, tokens });
      }
    }
    return cells;
  }

  // Fallback puramente geométrico (sem pdf.js): corta a grade, sem rotação/limpeza.
  function geometricCells(widthPt, heightPt, modeId) {
    const grid = gridForMode(modeId, widthPt / MM_TO_PT, heightPt / MM_TO_PT);
    const cw = widthPt / grid.cols;
    const ch = heightPt / grid.rows;
    const cells = [];
    for (let r = 0; r < grid.rows; r += 1) {
      for (let c = 0; c < grid.cols; c += 1) {
        cells.push({ crop: { x: c * cw, y: heightPt - (r + 1) * ch, w: cw, h: ch }, rotation: 0, tokens: new Set() });
      }
    }
    return cells;
  }

  function yieldToUI() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
  }

  function throwIfCancelled(shouldCancel) {
    if (typeof shouldCancel === 'function' && shouldCancel()) {
      const err = new Error('cancelled');
      err.code = 'cancelled';
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // Pareamento etiqueta <-> checklist e montagem das páginas
  // ------------------------------------------------------------------
  async function embedCell(outDoc, srcPages, srcDoc, cell) {
    const cr = cell.crop;
    const box = { left: cr.x, bottom: cr.y, right: cr.x + cr.w, top: cr.y + cr.h };
    try {
      return await outDoc.embedPage(srcPages[cell.pageIndex], box);
    } catch (err) {
      const [copied] = await outDoc.copyPages(srcDoc, [cell.pageIndex]);
      return await outDoc.embedPage(copied, box);
    }
  }

  // Desenha um recorte (com rotação) dentro de uma caixa da página de saída.
  // fitMode: 'contain' | 'width'. valign: 'top' | 'center' | 'bottom'.
  function drawCrop(outPage, embedded, crop, rotation, box, fitMode, valign, degrees) {
    const rot = (((rotation % 360) + 360) % 360);
    const footW = (rot === 90 || rot === 270) ? crop.h : crop.w;
    const footH = (rot === 90 || rot === 270) ? crop.w : crop.h;
    const scale = fitMode === 'width'
      ? box.w / Math.max(1, footW)
      : Math.min(box.w / Math.max(1, footW), box.h / Math.max(1, footH));
    const scaledW = crop.w * scale;
    const scaledH = crop.h * scale;
    const rotW = (rot === 90 || rot === 270) ? scaledH : scaledW;
    const rotH = (rot === 90 || rot === 270) ? scaledW : scaledH;
    const ox = box.x + (box.w - rotW) / 2;
    const oy = valign === 'top' ? box.y + box.h - rotH
      : valign === 'bottom' ? box.y
      : box.y + (box.h - rotH) / 2;
    const place = rotationPlacement(rot, scaledW, scaledH, ox, oy);
    outPage.drawPage(embedded, {
      x: place.x, y: place.y, xScale: scale, yScale: scale,
      rotate: rot ? degrees(rot) : undefined,
    });
  }

  // Página combinada: etiqueta em cima + checklist embaixo, em 100x150.
  async function buildCombinedPage(outDoc, srcPages, srcDoc, label, check, degrees) {
    const labEmb = await embedCell(outDoc, srcPages, srcDoc, label);
    const chkEmb = await embedCell(outDoc, srcPages, srcDoc, check);
    const page = outDoc.addPage(OUTPUT_PAGE);
    const margin = COMBINE_MARGIN_MM * MM_TO_PT;
    const gap = COMBINE_GAP_MM * MM_TO_PT;
    const checkMax = CHECK_MAX_MM * MM_TO_PT;
    const innerW = LABEL_WIDTH_PT - 2 * margin;

    const cRot = (((check.rotation % 360) + 360) % 360);
    const cFootW = (cRot === 90 || cRot === 270) ? check.crop.h : check.crop.w;
    const cFootH = (cRot === 90 || cRot === 270) ? check.crop.w : check.crop.h;
    const cScale = Math.min(innerW / Math.max(1, cFootW), checkMax / Math.max(1, cFootH));
    const checkBlockH = cFootH * cScale;

    const labelBoxY = margin + checkBlockH + gap;
    const labelBoxH = LABEL_HEIGHT_PT - margin - labelBoxY;

    drawCrop(page, labEmb, label.crop, label.rotation, { x: margin, y: labelBoxY, w: innerW, h: labelBoxH }, 'contain', 'top', degrees);
    drawCrop(page, chkEmb, check.crop, check.rotation, { x: margin, y: margin, w: innerW, h: checkBlockH }, 'contain', 'center', degrees);
  }

  // Página só com a etiqueta (sem checklist correspondente), 100x150 inteira.
  async function buildLabelPage(outDoc, srcPages, srcDoc, label, degrees) {
    const emb = await embedCell(outDoc, srcPages, srcDoc, label);
    const page = outDoc.addPage(OUTPUT_PAGE);
    drawCrop(page, emb, label.crop, label.rotation, { x: 0, y: 0, w: LABEL_WIDTH_PT, h: LABEL_HEIGHT_PT }, 'contain', 'center', degrees);
  }

  // Página só com o checklist (sem etiqueta correspondente): largura 100mm, altura do conteúdo.
  async function buildChecklistPage(outDoc, srcPages, srcDoc, check, degrees) {
    const emb = await embedCell(outDoc, srcPages, srcDoc, check);
    const margin = COMBINE_MARGIN_MM * MM_TO_PT;
    const innerW = LABEL_WIDTH_PT - 2 * margin;
    const cRot = (((check.rotation % 360) + 360) % 360);
    const cFootW = (cRot === 90 || cRot === 270) ? check.crop.h : check.crop.w;
    const cFootH = (cRot === 90 || cRot === 270) ? check.crop.w : check.crop.h;
    const cScale = innerW / Math.max(1, cFootW);
    const pageH = cFootH * cScale + 2 * margin;
    const page = outDoc.addPage([LABEL_WIDTH_PT, pageH]);
    drawCrop(page, emb, check.crop, check.rotation, { x: margin, y: margin, w: innerW, h: pageH - 2 * margin }, 'width', 'center', degrees);
  }

  // Pareia por nº do pedido (token comum). Se não parear todos, retorna null.
  function tryPairByToken(labels, checks) {
    if (!labels.length) return null;
    const used = new Set();
    const pairs = [];
    for (const label of labels) {
      let found = -1;
      for (let i = 0; i < checks.length; i += 1) {
        if (used.has(i)) continue;
        if (shareTokens(label.tokens, checks[i].tokens)) { found = i; break; }
      }
      if (found < 0) return null;
      used.add(found);
      pairs.push({ label, check: checks[found] });
    }
    for (let i = 0; i < checks.length; i += 1) {
      if (!used.has(i)) pairs.push({ label: null, check: checks[i] });
    }
    return pairs;
  }

  // Pareia etiquetas e checklists: por nº do pedido; se falhar, por ordem.
  function pairCells(labels, checks) {
    const byToken = tryPairByToken(labels, checks);
    if (byToken) return byToken;
    const pairs = [];
    const n = Math.max(labels.length, checks.length);
    for (let i = 0; i < n; i += 1) {
      pairs.push({ label: labels[i] || null, check: checks[i] || null });
    }
    return pairs;
  }

  // ------------------------------------------------------------------
  // Conversão: PDF de entrada -> PDF 100x150
  // ------------------------------------------------------------------
  async function convertToLabels({ bytes, modeId, onProgress, shouldCancel }) {
    const { PDFDocument, degrees } = getPdfLib();
    const outDoc = await PDFDocument.create();

    // 1) Detecta as células (etiquetas e checklists) de cada página
    const allCells = []; // { pageIndex, crop, rotation, tokens }

    if (pdfjsLib) {
      const jsDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      state.inputPages = jsDoc.numPages;
      try {
        for (let i = 1; i <= jsDoc.numPages; i += 1) {
          throwIfCancelled(shouldCancel);
          const page = await jsDoc.getPage(i);
          const cells = await detectCellsForPage(page, modeId);
          cells.forEach((cell) => allCells.push({ pageIndex: i - 1, ...cell }));
          if (typeof page.cleanup === 'function') page.cleanup();
          if (typeof onProgress === 'function') {
            onProgress({ phase: 'detect', current: i, total: jsDoc.numPages });
          }
          await yieldToUI();
        }
      } finally {
        if (typeof jsDoc.destroy === 'function') jsDoc.destroy();
      }
    }

    // Documento de origem no pdf-lib (faz o recorte preservando vetores)
    const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    const srcPages = srcDoc.getPages();
    if (!state.inputPages) state.inputPages = srcPages.length;

    if (!pdfjsLib) {
      srcPages.forEach((p, idx) => {
        const { width, height } = p.getSize();
        geometricCells(width, height, modeId).forEach((cell) => allCells.push({ pageIndex: idx, ...cell }));
      });
    }

    if (!allCells.length) {
      const err = new Error(ERROR_MESSAGES.empty);
      err.code = 'empty';
      throw err;
    }

    // 2) Separa etiquetas (em pé) de checklists (giradas) e pareia por nº do pedido.
    //    No modo "sem checklist" os checklists são descartados.
    const withChecklist = getModeById(modeId).id !== 'nochk';
    const labels = allCells.filter((c) => c.rotation === 0);
    const checks = withChecklist ? allCells.filter((c) => c.rotation !== 0) : [];
    let pairs;
    if (labels.length && checks.length) {
      pairs = pairCells(labels, checks);
    } else if (labels.length) {
      pairs = labels.map((c) => ({ label: c, check: null }));
    } else {
      pairs = checks.map((c) => ({ label: null, check: c }));
    }

    // 3) Monta as páginas (etiqueta + checklist juntos quando houver par)
    const breakdown = { combined: 0, labels: 0, checklists: 0 };
    const total = pairs.length;
    let done = 0;

    for (const pair of pairs) {
      throwIfCancelled(shouldCancel);
      if (pair.label && pair.check) {
        await buildCombinedPage(outDoc, srcPages, srcDoc, pair.label, pair.check, degrees);
        breakdown.combined += 1;
      } else if (pair.label) {
        await buildLabelPage(outDoc, srcPages, srcDoc, pair.label, degrees);
        breakdown.labels += 1;
      } else if (pair.check) {
        await buildChecklistPage(outDoc, srcPages, srcDoc, pair.check, degrees);
        breakdown.checklists += 1;
      }
      done += 1;
      if (typeof onProgress === 'function') onProgress({ phase: 'build', current: done, total });
      if (done % 4 === 0) await yieldToUI();
    }

    if (typeof onProgress === 'function') onProgress({ phase: 'finalize' });

    state.breakdown = breakdown;
    const pdfBytes = await outDoc.save();
    return { pdfBytes, pageCount: outDoc.getPageCount() };
  }

  // ------------------------------------------------------------------
  // Blob / download
  // ------------------------------------------------------------------
  function createPdfBlobUrl(bytes) {
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  }
  function revokePdfBlobUrl(url) {
    if (url) URL.revokeObjectURL(url);
  }
  function downloadPdfFromUrl(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // ------------------------------------------------------------------
  // Timer / progresso / status / toast
  // ------------------------------------------------------------------
  let timerId = null;
  let startTime = 0;

  function formatSeconds(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const rem = Math.round(seconds % 60);
    return `${minutes}m ${rem}s`;
  }
  function resetTimer() {
    if (dom.elapsedTime) dom.elapsedTime.textContent = '0s';
    if (dom.etaText) dom.etaText.textContent = '—';
    startTime = 0;
    state.processStart = 0;
  }
  function startTimer() {
    startTime = Date.now();
    state.processStart = startTime;
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (dom.elapsedTime) dom.elapsedTime.textContent = formatSeconds(elapsed);
    }, 500);
  }
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }
  function updateEta(current, total) {
    if (!dom.etaText) return;
    if (!state.processStart || !current || !total) { dom.etaText.textContent = '—'; return; }
    const elapsed = (Date.now() - state.processStart) / 1000;
    const perItem = elapsed / Math.max(1, current);
    dom.etaText.textContent = formatSeconds(Math.max(0, (total - current) * perItem));
  }

  function setStatus(text, kind = 'idle') {
    if (!dom.statusText) return;
    dom.statusText.textContent = text;
    dom.statusText.classList.remove('status-text--idle', 'status-text--ok', 'status-text--warn', 'status-text--err');
    dom.statusText.classList.add(`status-text--${kind}`);
  }
  function setProgress({ text = '', current = 0, total = 0 } = {}) {
    if (dom.progressText && text) dom.progressText.textContent = text;
    if (!dom.progressFill) return;
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeCurrent = Math.min(safeTotal, Math.max(0, Number(current) || 0));
    dom.progressFill.style.width = `${Math.round((safeCurrent / safeTotal) * 100)}%`;
  }
  function resetProgress(text = '—') {
    if (dom.progressText) dom.progressText.textContent = text;
    if (dom.progressFill) dom.progressFill.style.width = '0%';
  }

  function toast(message, type = 'info') {
    if (!dom.toasts || !message) return;
    const item = document.createElement('div');
    const safeType = ['info', 'ok', 'warn', 'err'].includes(type) ? type : 'info';
    item.className = `toast toast--${safeType}`;
    item.textContent = message;
    dom.toasts.appendChild(item);
    requestAnimationFrame(() => item.classList.add('toast--show'));
    const ttl = safeType === 'err' ? 4200 : 2800;
    window.setTimeout(() => {
      item.classList.remove('toast--show');
      item.addEventListener('transitionend', () => item.remove(), { once: true });
    }, ttl);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) { value /= 1024; idx += 1; }
    const digits = idx <= 1 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[idx]}`;
  }

  // ------------------------------------------------------------------
  // Pré-visualização (iframe + miniaturas) e visualizador modal
  // ------------------------------------------------------------------
  function setBodyModal(open) {
    document.body.classList.toggle('is-modal-open', open);
  }
  function setPreview(url) {
    if (dom.previewCanvasContainer) {
      dom.previewCanvasContainer.hidden = !url;
    }
    if (dom.previewEmpty) dom.previewEmpty.hidden = !!url;
    if (dom.previewThumbs) dom.previewThumbs.hidden = !url;
    if (dom.btnOpenPreview) dom.btnOpenPreview.disabled = !url || state.processing;
    if (!url && dom.previewCanvas) {
      const ctx = dom.previewCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, dom.previewCanvas.width, dom.previewCanvas.height);
    }
  }

  async function renderMainPreview(bytes) {
    if (!pdfjsLib || !dom.previewCanvas || !bytes) return;
    try {
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const page = await pdf.getPage(1);
      
      const containerHeight = 200; // Altura estável aproximada para manter a proporção
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = containerHeight / Math.max(1, unscaledViewport.height);
      const viewport = page.getViewport({ scale });
      
      const canvas = dom.previewCanvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      console.error('Falha ao renderizar pré-visualização principal:', err);
    }
  }
  function clearPreviewThumbs() {
    if (dom.previewThumbs) dom.previewThumbs.innerHTML = '';
    state.previewPdf = null;
  }
  async function renderThumbsFromBytes(bytes) {
    if (!pdfjsLib || !dom.previewThumbs || !bytes) return;
    clearPreviewThumbs();
    try {
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      state.previewPdf = pdf;
      const total = Math.min(MAX_THUMBS, pdf.numPages);
      for (let pageIndex = 1; pageIndex <= total; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        await page.render({ canvasContext: ctx, viewport }).promise;

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'thumb';
        item.dataset.page = String(pageIndex);
        const badge = document.createElement('span');
        badge.className = 'thumb-badge';
        badge.textContent = `#${pageIndex}`;
        item.appendChild(canvas);
        item.appendChild(badge);
        dom.previewThumbs.appendChild(item);
      }
    } catch (err) {
      clearPreviewThumbs();
    }
  }

  function openPreview() {
    if (!state.outputBlobUrl) return;
    const win = window.open(state.outputBlobUrl, '_blank');
    if (!win) toast('Popup bloqueado. Use o botão baixar.', 'warn');
  }

  async function renderViewerPage() {
    if (!dom.viewerCanvas || !pdfjsLib || !state.outputBytes) return;
    try {
      if (!state.previewPdf) {
        state.previewPdf = await pdfjsLib.getDocument({ data: state.outputBytes.slice() }).promise;
      }
      const total = state.previewPdf.numPages || 1;
      state.viewerPage = Math.max(1, Math.min(total, state.viewerPage));
      const page = await state.previewPdf.getPage(state.viewerPage);
      const viewport = page.getViewport({ scale: state.viewerScale });
      const canvas = dom.viewerCanvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (dom.viewerScale) dom.viewerScale.textContent = `${Math.round(state.viewerScale * 100)}%`;
      if (dom.viewerPrev) dom.viewerPrev.disabled = state.viewerPage <= 1;
      if (dom.viewerNext) dom.viewerNext.disabled = state.viewerPage >= total;
    } catch (err) {
      toast('Falha ao renderizar a pré-visualização. Abrindo PDF...', 'warn');
      closeViewer();
      openPreview();
    }
  }
  function openViewer(pageIndex) {
    if (!dom.viewerModal) return;
    if (!state.outputBytes || !pdfjsLib) { openPreview(); return; }
    state.viewerPage = pageIndex || 1;
    state.viewerScale = 1.1;
    dom.viewerModal.hidden = false;
    setBodyModal(true);
    renderViewerPage();
  }
  function closeViewer() {
    if (!dom.viewerModal) return;
    dom.viewerModal.hidden = true;
    setBodyModal(false);
  }

  function tryAutoPrint() {
    if (!dom.autoPrint?.checked || !state.outputBlobUrl) return;
    const printWindow = window.open(state.outputBlobUrl, '_blank');
    if (!printWindow) { toast('Popup bloqueado. Abra o PDF e imprima manualmente.', 'warn'); return; }
    const triggerPrint = () => {
      try { printWindow.focus(); printWindow.print(); }
      catch (err) { toast('Falha ao abrir a impressão automática.', 'warn'); }
    };
    printWindow.onload = () => setTimeout(triggerPrint, 250);
    setTimeout(triggerPrint, 1200);
  }

  // ------------------------------------------------------------------
  // Botões / resumo / hint
  // ------------------------------------------------------------------
  function updateButtons() {
    const hasFile = !!state.file;
    const hasOutput = !!state.outputBlobUrl;
    if (dom.btnGenerate) dom.btnGenerate.disabled = !hasFile || state.processing;
    if (dom.btnDownload) dom.btnDownload.disabled = !hasOutput || state.processing;
    if (dom.btnOpenPreview) dom.btnOpenPreview.disabled = !hasOutput || state.processing;
    if (dom.btnCancel) dom.btnCancel.disabled = !state.processing;
    if (dom.btnTestPage) dom.btnTestPage.disabled = state.processing;
  }
  function setFileInfo(file) {
    if (!dom.fileName || !dom.fileSize) return;
    if (!file) { dom.fileName.textContent = 'Nenhum arquivo selecionado'; dom.fileSize.textContent = '—'; return; }
    dom.fileName.textContent = file.name;
    dom.fileSize.textContent = formatBytes(file.size);
  }
  function setModeHint(text) {
    if (dom.modeHint) dom.modeHint.innerHTML = text;
  }
  function defaultModeHint() {
    if (state.modeId === 'nochk') {
      setModeHint('Gera <strong>só as etiquetas</strong> 10×15. O checklist é ignorado.');
    } else {
      setModeHint('Junta cada etiqueta com o <strong>checklist do mesmo pedido</strong>. Etiqueta sem checklist sai sozinha.');
    }
  }

  function clearOutput() {
    setPreview('');
    clearPreviewThumbs();
    closeViewer();
    state.cancelRequested = false;
    if (state.outputBlobUrl) revokePdfBlobUrl(state.outputBlobUrl);
    resetOutput();
    resetProgress('—');
    resetTimer();
    resetSummary();
    updateButtons();
  }

  function updateSummary() {
    if (!dom.summary) return;
    const mode = getModeById(state.modeId);
    if (dom.summaryMode) dom.summaryMode.textContent = mode.label;
    if (dom.summaryInput) dom.summaryInput.textContent = String(state.inputPages || 0);
    if (dom.summaryOutput) dom.summaryOutput.textContent = String(state.outputPages || 0);
    dom.summary.hidden = false;
  }

  function resetSummary() {
    if (!dom.summary) return;
    if (dom.summaryMode) dom.summaryMode.textContent = '—';
    if (dom.summaryInput) dom.summaryInput.textContent = '0';
    if (dom.summaryOutput) dom.summaryOutput.textContent = '0';
  }

  // ------------------------------------------------------------------
  // Seleção de arquivo
  // ------------------------------------------------------------------
  function setFileFromInput(file) {
    state.file = file || null;
    clearOutput();
    setFileInfo(state.file);
    if (state.file) {
      setStatus('PDF selecionado. Clique em Gerar etiquetas.', 'idle');
    } else {
      setStatus('Selecione um PDF para começar.', 'idle');
    }
    defaultModeHint();
    updateButtons();
  }
  function setFileFromDrop(file) {
    if (!dom.fileInput) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    dom.fileInput.files = dt.files;
    dom.fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function handleModeChange() {
    state.modeId = dom.modeSelect?.value || DEFAULT_MODE_ID;
    localStorage.setItem('value_mode', state.modeId);
    clearOutput();
    defaultModeHint();
    if (state.file) setStatus('Modo alterado. Clique em Gerar etiquetas.', 'idle');
  }

  function handleDownload() {
    if (!state.outputBlobUrl) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${OUTPUT_FILE_PREFIX}_${state.modeId}_${ts}.pdf`;
    downloadPdfFromUrl(state.outputBlobUrl, filename);
  }

  function handleCancel() {
    if (!state.processing) return;
    state.cancelRequested = true;
    setStatus('Cancelando...', 'warn');
  }

  // ------------------------------------------------------------------
  // Página de teste 100x150
  // ------------------------------------------------------------------
  async function handleTestPage() {
    try {
      const { PDFDocument, rgb, StandardFonts } = getPdfLib();
      const doc = await PDFDocument.create();
      const page = doc.addPage([LABEL_WIDTH_PT, LABEL_HEIGHT_PT]);
      const { width, height } = page.getSize();
      const margin = 10;
      page.drawRectangle({ x: margin, y: margin, width: width - margin * 2, height: height - margin * 2, borderColor: rgb(0.95, 0.55, 0.2), borderWidth: 1.5 });
      page.drawLine({ start: { x: width / 2, y: margin }, end: { x: width / 2, y: height - margin }, color: rgb(0.8, 0.8, 0.8), thickness: 0.5 });
      page.drawLine({ start: { x: margin, y: height / 2 }, end: { x: width - margin, y: height / 2 }, color: rgb(0.8, 0.8, 0.8), thickness: 0.5 });
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText('100 x 150 mm', { x: margin + 6, y: height - margin - 18, size: 14, font: fontBold, color: rgb(0.95, 0.8, 0.6) });
      page.drawText('Use escala 100% na impressão', { x: margin + 6, y: margin + 6, size: 9, font: fontRegular, color: rgb(0.8, 0.8, 0.8) });
      const pdfBytes = await doc.save();
      const url = createPdfBlobUrl(pdfBytes);
      downloadPdfFromUrl(url, 'pagina_teste_100x150.pdf');
      setTimeout(() => revokePdfBlobUrl(url), 4000);
    } catch (err) {
      toast('Falha ao gerar a página de teste.', 'err');
    }
  }

  // ------------------------------------------------------------------
  // Geração
  // ------------------------------------------------------------------
  function resolveErrorMessage(err) {
    if (err?.code === 'encrypted') return ERROR_MESSAGES.encrypted;
    if (err?.code === 'cancelled') return 'Processamento cancelado.';
    if (err?.code === 'empty') return ERROR_MESSAGES.empty;
    const message = String(err?.message || err || '').toLowerCase();
    if (message.includes('encrypted') || message.includes('password')) return ERROR_MESSAGES.encrypted;
    return ERROR_MESSAGES.generic;
  }

  function describeBreakdown(breakdown, totalPages) {
    if (!breakdown) return `${totalPages} página(s) 10×15 geradas.`;
    const parts = [];
    if (breakdown.combined) parts.push(`${breakdown.combined} etiqueta(s) com checklist`);
    if (breakdown.labels) parts.push(`${breakdown.labels} etiqueta(s)`);
    if (breakdown.checklists) parts.push(`${breakdown.checklists} checklist(s)`);
    if (!parts.length) return `${totalPages} página(s) 10×15 geradas.`;
    return `Detectado: ${parts.join(' + ')} — ${totalPages} página(s) 10×15.`;
  }

  async function handleGenerate() {
    if (state.processing) return;
    const validation = validatePdfFile(state.file);
    if (!validation.ok) { setStatus(validation.message, 'err'); toast(validation.message, 'err'); return; }

    state.processing = true;
    state.cancelRequested = false;
    updateButtons();
    resetProgress('—');
    resetTimer();
    startTimer();
    setPreview('');
    clearPreviewThumbs();
    resetSummary();

    try {
      setStatus('Lendo PDF...', 'idle');
      setProgress({ text: 'Lendo PDF...', current: 0, total: 1 });

      const buffer = await state.file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const onProgress = ({ phase, current, total }) => {
        if (phase === 'detect') {
          const text = `Analisando página ${current} de ${total}...`;
          setStatus(text, 'idle');
          if (dom.progressText) dom.progressText.textContent = text;
        }
        if (phase === 'build') {
          const text = `Montando etiqueta ${current} de ${total}...`;
          setStatus(text, 'idle');
          setProgress({ text, current, total });
          updateEta(current, total);
        }
        if (phase === 'finalize') {
          setStatus('Gerando PDF final...', 'idle');
          setProgress({ text: 'Gerando PDF final...', current: 1, total: 1 });
        }
      };

      const result = await convertToLabels({
        bytes,
        modeId: state.modeId,
        onProgress,
        shouldCancel: () => state.cancelRequested,
      });

      if (!result.pageCount) throw new Error(ERROR_MESSAGES.empty);

      if (state.outputBlobUrl) revokePdfBlobUrl(state.outputBlobUrl);
      state.outputBytes = result.pdfBytes;
      state.outputPages = result.pageCount;
      state.outputBlobUrl = createPdfBlobUrl(result.pdfBytes);

      setPreview(state.outputBlobUrl);
      renderMainPreview(state.outputBytes);
      renderThumbsFromBytes(state.outputBytes);
      updateSummary();
      setModeHint(describeBreakdown(state.breakdown, result.pageCount));
      setStatus('PDF pronto para download.', 'ok');
      setProgress({ text: 'Concluído', current: 1, total: 1 });
      toast('PDF pronto para download.', 'ok');
      tryAutoPrint();
    } catch (err) {
      const message = resolveErrorMessage(err);
      const kind = err?.code === 'cancelled' ? 'warn' : 'err';
      setStatus(message, kind);
      resetProgress('—');
      clearOutput();
      toast(message, kind);
    } finally {
      stopTimer();
      state.processing = false;
      updateButtons();
    }
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function initEvents() {
    initPdfJs();

    if (dom.modeSelect) {
      dom.modeSelect.innerHTML = MODES.map((mode) => `<option value="${mode.id}">${mode.label}</option>`).join('');
      const saved = localStorage.getItem('value_mode');
      const valid = MODES.some((mode) => mode.id === saved);
      state.modeId = valid ? saved : DEFAULT_MODE_ID;
      dom.modeSelect.value = state.modeId;
    }

    resetProgress('—');
    resetTimer();
    setStatus('Selecione um PDF para começar.', 'idle');
    setPreview('');
    defaultModeHint();
    updateButtons();

    if (dom.modeSelect) dom.modeSelect.addEventListener('change', handleModeChange);
    if (dom.btnOpenPreview) dom.btnOpenPreview.addEventListener('click', openPreview);
    if (dom.btnCancel) dom.btnCancel.addEventListener('click', handleCancel);
    if (dom.btnTestPage) dom.btnTestPage.addEventListener('click', handleTestPage);

    if (dom.previewThumbs) {
      dom.previewThumbs.addEventListener('click', (event) => {
        const target = event.target?.closest?.('.thumb');
        if (!target) return;
        const pageIndex = Number(target.dataset.page);
        if (Number.isFinite(pageIndex)) openViewer(pageIndex);
      });
    }

    if (dom.viewerModal) {
      dom.viewerModal.addEventListener('click', (event) => {
        if (event.target?.closest?.('[data-close="1"]')) closeViewer();
      });
    }
    if (dom.viewerClose) dom.viewerClose.addEventListener('click', closeViewer);
    if (dom.viewerPrev) dom.viewerPrev.addEventListener('click', () => { state.viewerPage -= 1; renderViewerPage(); });
    if (dom.viewerNext) dom.viewerNext.addEventListener('click', () => { state.viewerPage += 1; renderViewerPage(); });
    if (dom.viewerZoomIn) dom.viewerZoomIn.addEventListener('click', () => { state.viewerScale = Math.min(3, state.viewerScale + 0.2); renderViewerPage(); });
    if (dom.viewerZoomOut) dom.viewerZoomOut.addEventListener('click', () => { state.viewerScale = Math.max(0.4, state.viewerScale - 0.2); renderViewerPage(); });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dom.viewerModal && !dom.viewerModal.hidden) closeViewer();
    });

    if (dom.autoPrint) {
      if (localStorage.getItem('value_autoPrint') === 'true') dom.autoPrint.checked = true;
      dom.autoPrint.addEventListener('change', () => {
        localStorage.setItem('value_autoPrint', dom.autoPrint.checked ? 'true' : 'false');
      });
    }

    if (dom.fileInput) {
      dom.fileInput.addEventListener('change', () => {
        const file = dom.fileInput.files?.[0];
        if (!file) { setFileFromInput(null); return; }
        const validation = validatePdfFile(file);
        if (!validation.ok) { setFileFromInput(null); setStatus(validation.message, 'err'); toast(validation.message, 'err'); return; }
        setFileFromInput(file);
      });
    }

    if (dom.btnPick && dom.fileInput) {
      dom.btnPick.addEventListener('click', () => dom.fileInput.click());
    }

    if (dom.dropZone && dom.fileInput) {
      const stop = (event) => { event.preventDefault(); event.stopPropagation(); };
      dom.dropZone.addEventListener('click', (event) => {
        if (event.target?.closest?.('button')) return;
        dom.fileInput.click();
      });
      dom.dropZone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dom.fileInput.click(); }
      });
      ['dragenter', 'dragover'].forEach((evt) => dom.dropZone.addEventListener(evt, (event) => { stop(event); dom.dropZone.classList.add('is-dragover'); }));
      ['dragleave', 'dragend', 'drop'].forEach((evt) => dom.dropZone.addEventListener(evt, (event) => { stop(event); dom.dropZone.classList.remove('is-dragover'); }));
      dom.dropZone.addEventListener('drop', (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        const validation = validatePdfFile(file);
        if (!validation.ok) { setStatus(validation.message, 'err'); toast(validation.message, 'err'); return; }
        setFileFromDrop(file);
      });
    }

    if (dom.btnGenerate) dom.btnGenerate.addEventListener('click', handleGenerate);
    if (dom.btnDownload) dom.btnDownload.addEventListener('click', handleDownload);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEvents);
  } else {
    initEvents();
  }
})();

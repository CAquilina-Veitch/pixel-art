// State
const state = {
  canvas: { width: 32, height: 32 },
  layers: [],
  currentLayerId: null,
  colors: { 1: '#000000', 2: '#ffffff' },
  activeSwatch: 1,
  tool: 'pen',
  penSize: 1,
  showGrid: true,
  history: [],
  historyIndex: -1,
  maxHistory: 50,
  hasUnsavedChanges: false,
  selection: null,
  selectionMode: null,
  selectionData: null,
  isDrawing: false,
  lastPixel: null
};

// DOM Elements
const $ = id => document.getElementById(id);
const startScreen = $('start-screen');
const editor = $('editor');
const newDialog = $('new-dialog');
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const gridOverlay = $('grid-overlay');
const gridCtx = gridOverlay.getContext('2d');
const selectionOverlay = $('selection-overlay');
const selCtx = selectionOverlay.getContext('2d');
const canvasContainer = $('canvas-container');

// Touch slider helper for better mobile drag behavior
function setupTouchSlider(slider, onChange) {
  let isDragging = false;
  const min = parseInt(slider.min);
  const max = parseInt(slider.max);

  function calculateValue(clientX) {
    const rect = slider.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(min + ratio * (max - min));
  }

  slider.addEventListener('touchstart', (e) => {
    isDragging = true;
    e.preventDefault(); // Prevent scroll and tap-to-position
    const touch = e.touches[0];
    const value = calculateValue(touch.clientX);
    onChange(value);
  }, { passive: false });

  slider.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const value = calculateValue(touch.clientX);
    onChange(value);
  }, { passive: false });

  slider.addEventListener('touchend', () => {
    isDragging = false;
  });
}

// Initialize
function init() {
  setupEventListeners();
}

function setupEventListeners() {
  // Start Screen
  $('btn-new').addEventListener('click', () => showDialog(newDialog));
  $('btn-open').addEventListener('click', () => openFile());

  // New Dialog
  $('btn-cancel-new').addEventListener('click', () => hideDialog(newDialog));
  $('btn-create').addEventListener('click', createNewCanvas);
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const size = btn.dataset.size;
      $('canvas-width').value = size;
      $('canvas-height').value = size;
    });
  });

  // Swatches
  document.querySelectorAll('.swatch[data-swatch]').forEach(swatch => {
    swatch.addEventListener('click', () => selectSwatch(swatch.dataset.swatch));
  });
  $('swatch-picker').addEventListener('click', openColorPicker);

  // Tools
  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool));
  });

  // Pen Size
  $('size-minus').addEventListener('click', () => changePenSize(-1));
  $('size-plus').addEventListener('click', () => changePenSize(1));
  $('pen-size').addEventListener('change', (e) => {
    state.penSize = Math.max(1, Math.min(32, parseInt(e.target.value) || 1));
    e.target.value = state.penSize;
  });

  // Undo/Redo
  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);

  // Menu
  $('btn-menu').addEventListener('click', toggleMenu);
  $('menu-new').addEventListener('click', () => { hideMenu(); checkUnsaved(() => { hideEditor(); showDialog(newDialog); }); });
  $('menu-open').addEventListener('click', () => { hideMenu(); checkUnsaved(openFile); });
  $('menu-save').addEventListener('click', () => { hideMenu(); saveProject(); });
  $('menu-export').addEventListener('click', () => { hideMenu(); showDialog($('export-dialog')); });

  // Grid Toggle
  $('btn-grid').addEventListener('click', toggleGrid);

  // Layers
  $('btn-layers').addEventListener('click', toggleLayersPanel);
  $('add-layer').addEventListener('click', addLayer);

  // Color Picker
  $('close-picker').addEventListener('click', () => hideDialog($('color-picker-dialog')));
  document.querySelectorAll('.picker-target').forEach(target => {
    target.addEventListener('click', () => selectPickerTarget(target.dataset.target));
  });
  setupColorPicker();

  // Selection Toolbar
  $('sel-move').addEventListener('click', () => startSelectionAction('move'));
  $('sel-clone').addEventListener('click', () => startSelectionAction('clone'));
  $('sel-delete').addEventListener('click', deleteSelection);

  // Export Dialog
  $('export-cancel').addEventListener('click', () => hideDialog($('export-dialog')));
  $('export-confirm').addEventListener('click', exportImage);

  // Unsaved Dialog
  $('unsaved-cancel').addEventListener('click', () => hideDialog($('unsaved-dialog')));
  $('unsaved-continue').addEventListener('click', () => {
    hideDialog($('unsaved-dialog'));
    if (state.unsavedCallback) state.unsavedCallback();
  });

  // Canvas Events - use document for move/up to allow dragging outside canvas
  canvas.addEventListener('mousedown', handleCanvasDown);
  document.addEventListener('mousemove', handleCanvasMove);
  document.addEventListener('mouseup', handleCanvasUp);
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleCanvasUp);

  // Click outside to close
  document.addEventListener('click', (e) => {
    if (!$('menu-dropdown').classList.contains('hidden') && !e.target.closest('#btn-menu') && !e.target.closest('#menu-dropdown')) {
      hideMenu();
    }
    if (!$('layers-panel').classList.contains('hidden') && !e.target.closest('#btn-layers') && !e.target.closest('#layers-panel')) {
      $('layers-panel').classList.add('hidden');
    }
  });

  // Color picker dialog click outside
  $('color-picker-dialog').addEventListener('click', (e) => {
    if (e.target === $('color-picker-dialog')) hideDialog($('color-picker-dialog'));
  });

  // File input
  $('file-input').addEventListener('change', handleFileSelect);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'y') { e.preventDefault(); redo(); }
      if (e.key === 's') { e.preventDefault(); saveProject(); }
    }
    if (e.key === 'Escape') {
      clearSelection();
    }
  });
}

// Dialog Management
function showDialog(dialog) {
  dialog.classList.remove('hidden');
}

function hideDialog(dialog) {
  dialog.classList.add('hidden');
}

function hideEditor() {
  editor.classList.add('hidden');
  startScreen.classList.remove('hidden');
}

// Canvas Creation
function createNewCanvas() {
  const width = parseInt($('canvas-width').value) || 32;
  const height = parseInt($('canvas-height').value) || 32;

  state.canvas.width = Math.max(1, Math.min(256, width));
  state.canvas.height = Math.max(1, Math.min(256, height));
  state.layers = [];
  state.history = [];
  state.historyIndex = -1;
  state.hasUnsavedChanges = false;

  addLayer();

  hideDialog(newDialog);
  startScreen.classList.add('hidden');
  editor.classList.remove('hidden');

  resizeCanvases();
  render();
}

function resizeCanvases() {
  const containerRect = canvasContainer.getBoundingClientRect();
  const maxWidth = containerRect.width - 20;
  const maxHeight = containerRect.height - 20;

  const scaleX = maxWidth / state.canvas.width;
  const scaleY = maxHeight / state.canvas.height;
  const scale = Math.floor(Math.min(scaleX, scaleY));

  const displayWidth = state.canvas.width * scale;
  const displayHeight = state.canvas.height * scale;

  canvas.width = state.canvas.width;
  canvas.height = state.canvas.height;
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayHeight + 'px';

  gridOverlay.width = displayWidth;
  gridOverlay.height = displayHeight;
  gridOverlay.style.width = displayWidth + 'px';
  gridOverlay.style.height = displayHeight + 'px';

  selectionOverlay.width = displayWidth;
  selectionOverlay.height = displayHeight;
  selectionOverlay.style.width = displayWidth + 'px';
  selectionOverlay.style.height = displayHeight + 'px';

  state.scale = scale;

  drawGrid();
  render();
}

// Layers
function addLayer() {
  const id = Date.now().toString();
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = state.canvas.width;
  layerCanvas.height = state.canvas.height;

  const layer = {
    id,
    name: `Layer ${state.layers.length + 1}`,
    canvas: layerCanvas,
    ctx: layerCanvas.getContext('2d'),
    visible: true,
    opacity: 100
  };

  state.layers.unshift(layer);
  state.currentLayerId = id;

  updateLayersPanel();
  saveState();
}

function updateLayersPanel() {
  const list = $('layers-list');
  list.innerHTML = '';

  state.layers.forEach((layer, index) => {
    const item = document.createElement('div');
    item.className = 'layer-item' + (layer.id === state.currentLayerId ? ' selected' : '');
    item.draggable = true;
    item.dataset.id = layer.id;

    item.innerHTML = `
      <button class="layer-select-dot" data-id="${layer.id}" title="Select layer">
        ${layer.id === state.currentLayerId ? '●' : '○'}
      </button>
      <button class="layer-visibility ${!layer.visible ? 'hidden-layer' : ''}" data-id="${layer.id}">
        ${layer.visible ? '👁' : '○'}
      </button>
      <input class="layer-name" type="text" value="${layer.name}" data-id="${layer.id}">
      <div class="layer-opacity">
        <input type="range" min="0" max="100" value="${layer.opacity}" data-id="${layer.id}">
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (!e.target.matches('input, button')) {
        selectLayer(layer.id);
      }
    });

    item.querySelector('.layer-select-dot').addEventListener('click', (e) => {
      e.stopPropagation();
      selectLayer(layer.id);
    });

    item.querySelector('.layer-visibility').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLayerVisibility(layer.id);
    });

    item.querySelector('.layer-name').addEventListener('change', (e) => {
      layer.name = e.target.value;
      state.hasUnsavedChanges = true;
    });

    const opacitySlider = item.querySelector('.layer-opacity input');

    opacitySlider.addEventListener('input', (e) => {
      layer.opacity = parseInt(e.target.value);
      render();
      state.hasUnsavedChanges = true;
    });

    // Better touch handling for mobile - makes slider more "draggy"
    setupTouchSlider(opacitySlider, (value) => {
      layer.opacity = value;
      opacitySlider.value = value;
      render();
      state.hasUnsavedChanges = true;
    });

    // Drag and drop
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', layer.id);
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain');
      const draggedIndex = state.layers.findIndex(l => l.id === draggedId);
      const dropIndex = index;

      if (draggedIndex !== dropIndex) {
        const [draggedLayer] = state.layers.splice(draggedIndex, 1);
        state.layers.splice(dropIndex, 0, draggedLayer);
        updateLayersPanel();
        render();
        state.hasUnsavedChanges = true;
      }
    });

    list.appendChild(item);
  });
}

function selectLayer(id) {
  state.currentLayerId = id;
  updateLayersPanel();
}

function toggleLayerVisibility(id) {
  const layer = state.layers.find(l => l.id === id);
  if (layer) {
    layer.visible = !layer.visible;
    updateLayersPanel();
    render();
    state.hasUnsavedChanges = true;
  }
}

function getCurrentLayer() {
  return state.layers.find(l => l.id === state.currentLayerId);
}

function toggleLayersPanel() {
  $('layers-panel').classList.toggle('hidden');
}

// Swatch & Colors
function selectSwatch(swatch) {
  state.activeSwatch = swatch;
  document.querySelectorAll('.swatch[data-swatch]').forEach(s => {
    s.classList.toggle('selected', s.dataset.swatch === swatch);
  });
}

function openColorPicker() {
  const dialog = $('color-picker-dialog');
  showDialog(dialog);

  $('picker-swatch-1').style.backgroundColor = state.colors[1];
  $('picker-swatch-2').style.backgroundColor = state.colors[2];

  const activeTarget = state.activeSwatch === 'eraser' ? '1' : state.activeSwatch;
  selectPickerTarget(activeTarget);
}

function selectPickerTarget(target) {
  state.pickerTarget = target;
  document.querySelectorAll('.picker-target').forEach(t => {
    t.classList.toggle('selected', t.dataset.target === target);
  });

  const color = state.colors[target];
  const hsv = hexToHsv(color);
  updatePickerFromHsv(hsv);
}

// Color Picker
function setupColorPicker() {
  const svCanvas = $('sv-canvas');
  const hueCanvas = $('hue-canvas');
  const svCtx = svCanvas.getContext('2d');
  const hueCtx = hueCanvas.getContext('2d');

  // Draw hue gradient
  const hueGradient = hueCtx.createLinearGradient(0, 0, hueCanvas.width, 0);
  for (let i = 0; i <= 360; i += 60) {
    hueGradient.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
  }
  hueCtx.fillStyle = hueGradient;
  hueCtx.fillRect(0, 0, hueCanvas.width, hueCanvas.height);

  state.pickerHsv = { h: 0, s: 100, v: 100 };

  function updateSvCanvas() {
    const h = state.pickerHsv.h;

    // White to color gradient (horizontal)
    const colorGradient = svCtx.createLinearGradient(0, 0, svCanvas.width, 0);
    colorGradient.addColorStop(0, '#ffffff');
    colorGradient.addColorStop(1, `hsl(${h}, 100%, 50%)`);
    svCtx.fillStyle = colorGradient;
    svCtx.fillRect(0, 0, svCanvas.width, svCanvas.height);

    // Black gradient (vertical)
    const blackGradient = svCtx.createLinearGradient(0, 0, 0, svCanvas.height);
    blackGradient.addColorStop(0, 'rgba(0,0,0,0)');
    blackGradient.addColorStop(1, '#000000');
    svCtx.fillStyle = blackGradient;
    svCtx.fillRect(0, 0, svCanvas.width, svCanvas.height);
  }

  updateSvCanvas();

  // SV Picker interaction
  let svDragging = false;

  function handleSvPick(e) {
    const rect = svCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(svCanvas.width, (e.clientX || e.touches[0].clientX) - rect.left));
    const y = Math.max(0, Math.min(svCanvas.height, (e.clientY || e.touches[0].clientY) - rect.top));

    state.pickerHsv.s = (x / svCanvas.width) * 100;
    state.pickerHsv.v = 100 - (y / svCanvas.height) * 100;

    updatePickerCursors();
    updatePickerColor();
  }

  svCanvas.addEventListener('mousedown', (e) => { svDragging = true; handleSvPick(e); });
  svCanvas.addEventListener('mousemove', (e) => { if (svDragging) handleSvPick(e); });
  document.addEventListener('mouseup', () => svDragging = false);
  svCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); svDragging = true; handleSvPick(e); });
  svCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (svDragging) handleSvPick(e); });
  svCanvas.addEventListener('touchend', () => svDragging = false);

  // Hue Picker interaction
  let hueDragging = false;

  function handleHuePick(e) {
    const rect = hueCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(hueCanvas.width, (e.clientX || e.touches[0].clientX) - rect.left));

    state.pickerHsv.h = (x / hueCanvas.width) * 360;

    updateSvCanvas();
    updatePickerCursors();
    updatePickerColor();
  }

  hueCanvas.addEventListener('mousedown', (e) => { hueDragging = true; handleHuePick(e); });
  hueCanvas.addEventListener('mousemove', (e) => { if (hueDragging) handleHuePick(e); });
  document.addEventListener('mouseup', () => hueDragging = false);
  hueCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); hueDragging = true; handleHuePick(e); });
  hueCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (hueDragging) handleHuePick(e); });
  hueCanvas.addEventListener('touchend', () => hueDragging = false);

  // Hex input
  $('hex-input').addEventListener('change', (e) => {
    let hex = e.target.value;
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      state.colors[state.pickerTarget] = hex;
      updateSwatchColors();
      const hsv = hexToHsv(hex);
      state.pickerHsv = hsv;
      updateSvCanvas();
      updatePickerCursors();
      $('preview-color').style.backgroundColor = hex;
    }
  });

  state.updateSvCanvas = updateSvCanvas;
}

function updatePickerFromHsv(hsv) {
  state.pickerHsv = hsv;
  state.updateSvCanvas();
  updatePickerCursors();
  updatePickerColor();
}

function updatePickerCursors() {
  const svCanvas = $('sv-canvas');
  const hueCanvas = $('hue-canvas');
  const svCursor = $('sv-cursor');
  const hueCursor = $('hue-cursor');

  const svX = (state.pickerHsv.s / 100) * svCanvas.width;
  const svY = (1 - state.pickerHsv.v / 100) * svCanvas.height;
  svCursor.style.left = svX + 'px';
  svCursor.style.top = svY + 'px';

  const hueX = (state.pickerHsv.h / 360) * hueCanvas.width;
  hueCursor.style.left = hueX + 'px';
}

function updatePickerColor() {
  const hex = hsvToHex(state.pickerHsv.h, state.pickerHsv.s, state.pickerHsv.v);
  state.colors[state.pickerTarget] = hex;

  $('preview-color').style.backgroundColor = hex;
  $('hex-input').value = hex;

  updateSwatchColors();
}

function updateSwatchColors() {
  $('swatch-1').style.backgroundColor = state.colors[1];
  $('swatch-2').style.backgroundColor = state.colors[2];
  $('picker-swatch-1').style.backgroundColor = state.colors[1];
  $('picker-swatch-2').style.backgroundColor = state.colors[2];
}

// Color conversion utilities
function hsvToHex(h, s, v) {
  s /= 100;
  v /= 100;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function hexToHsv(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  return { h, s, v };
}

// Tools
function selectTool(tool) {
  state.tool = tool;
  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.tool === tool);
  });

  if (tool !== 'select') {
    clearSelection();
  }
}

function changePenSize(delta) {
  state.penSize = Math.max(1, Math.min(32, state.penSize + delta));
  $('pen-size').value = state.penSize;
}

// Canvas Drawing
function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
  const clientY = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;

  const x = Math.floor((clientX - rect.left) / state.scale);
  const y = Math.floor((clientY - rect.top) / state.scale);

  return { x, y };
}

function getCanvasPosClamped(e) {
  const pos = getCanvasPos(e);
  return {
    x: Math.max(0, Math.min(state.canvas.width - 1, pos.x)),
    y: Math.max(0, Math.min(state.canvas.height - 1, pos.y))
  };
}

function handleTouchStart(e) {
  e.preventDefault();
  handleCanvasDown(e);
}

function handleTouchMove(e) {
  e.preventDefault();
  handleCanvasMove(e);
}

function handleCanvasDown(e) {
  const pos = getCanvasPos(e);
  const posClamped = getCanvasPosClamped(e);
  state.isDrawing = true;
  state.lastPixel = pos;

  if (state.selectionMode === 'move' || state.selectionMode === 'clone') {
    state.moveStart = pos;
    return;
  }

  if (state.tool === 'pen') {
    drawPixel(pos.x, pos.y);
  } else if (state.tool === 'fill') {
    floodFill(posClamped.x, posClamped.y);
  } else if (state.tool === 'eyedropper') {
    pickColor(posClamped.x, posClamped.y);
  } else if (state.tool === 'select') {
    clearSelection();
    state.selectionStart = posClamped;
  }
}

function handleCanvasMove(e) {
  if (!state.isDrawing) return;

  const pos = getCanvasPos(e);
  const posClamped = getCanvasPosClamped(e);

  if (state.selectionMode === 'move' || state.selectionMode === 'clone') {
    const dx = pos.x - state.moveStart.x;
    const dy = pos.y - state.moveStart.y;
    state.selection.x += dx;
    state.selection.y += dy;
    state.moveStart = pos;
    drawSelection();
    return;
  }

  if (state.tool === 'pen') {
    // Bresenham's line algorithm for smooth lines
    const x0 = state.lastPixel.x;
    const y0 = state.lastPixel.y;
    const x1 = pos.x;
    const y1 = pos.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let x = x0, y = y0;
    while (true) {
      drawPixel(x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }

    state.lastPixel = pos;
  } else if (state.tool === 'eyedropper') {
    pickColor(posClamped.x, posClamped.y);
  } else if (state.tool === 'select' && state.selectionStart) {
    // Use clamped positions so selection stays within canvas bounds
    state.selection = {
      x: Math.min(state.selectionStart.x, posClamped.x),
      y: Math.min(state.selectionStart.y, posClamped.y),
      width: Math.abs(posClamped.x - state.selectionStart.x) + 1,
      height: Math.abs(posClamped.y - state.selectionStart.y) + 1
    };
    drawSelection();
  }
}

function handleCanvasUp() {
  if (state.isDrawing) {
    if (state.tool === 'pen' || state.tool === 'fill') {
      saveState();
    } else if (state.tool === 'select' && state.selection) {
      showSelectionToolbar();
    }

    if (state.selectionMode === 'move' || state.selectionMode === 'clone') {
      applySelectionMove();
    }
  }

  state.isDrawing = false;
  state.selectionStart = null;
}

function drawPixel(x, y) {
  const layer = getCurrentLayer();
  if (!layer || !layer.visible) return;

  const size = state.penSize;
  const halfSize = Math.floor(size / 2);

  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px = x - halfSize + dx;
      const py = y - halfSize + dy;

      if (px >= 0 && px < state.canvas.width && py >= 0 && py < state.canvas.height) {
        if (state.activeSwatch === 'eraser') {
          layer.ctx.clearRect(px, py, 1, 1);
        } else {
          layer.ctx.fillStyle = state.colors[state.activeSwatch];
          layer.ctx.fillRect(px, py, 1, 1);
        }
      }
    }
  }

  render();
  state.hasUnsavedChanges = true;
}

function floodFill(startX, startY) {
  const layer = getCurrentLayer();
  if (!layer || !layer.visible) return;

  const imageData = layer.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
  const data = imageData.data;

  const startIdx = (startY * state.canvas.width + startX) * 4;
  const startR = data[startIdx];
  const startG = data[startIdx + 1];
  const startB = data[startIdx + 2];
  const startA = data[startIdx + 3];

  let fillR, fillG, fillB, fillA;

  if (state.activeSwatch === 'eraser') {
    fillR = fillG = fillB = fillA = 0;
  } else {
    const hex = state.colors[state.activeSwatch];
    fillR = parseInt(hex.slice(1, 3), 16);
    fillG = parseInt(hex.slice(3, 5), 16);
    fillB = parseInt(hex.slice(5, 7), 16);
    fillA = 255;
  }

  // Don't fill if same color
  if (startR === fillR && startG === fillG && startB === fillB && startA === fillA) return;

  const stack = [[startX, startY]];
  const visited = new Set();

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const key = `${x},${y}`;

    if (visited.has(key)) continue;
    if (x < 0 || x >= state.canvas.width || y < 0 || y >= state.canvas.height) continue;

    const idx = (y * state.canvas.width + x) * 4;
    if (data[idx] !== startR || data[idx + 1] !== startG ||
        data[idx + 2] !== startB || data[idx + 3] !== startA) continue;

    visited.add(key);

    data[idx] = fillR;
    data[idx + 1] = fillG;
    data[idx + 2] = fillB;
    data[idx + 3] = fillA;

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  layer.ctx.putImageData(imageData, 0, 0);
  render();
  state.hasUnsavedChanges = true;
}

// Eyedropper
function pickColor(x, y) {
  // Get color from the merged/rendered canvas
  const imageData = ctx.getImageData(x, y, 1, 1).data;
  const r = imageData[0];
  const g = imageData[1];
  const b = imageData[2];
  const a = imageData[3];

  // If transparent, don't pick
  if (a === 0) return;

  const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');

  // Set the active swatch color (1 or 2, not eraser)
  const targetSwatch = state.activeSwatch === 'eraser' ? '1' : state.activeSwatch;
  state.colors[targetSwatch] = hex;
  updateSwatchColors();

  // Select that swatch
  selectSwatch(targetSwatch);
}

// Selection
function drawSelection() {
  if (!state.selection) return;

  selCtx.clearRect(0, 0, selectionOverlay.width, selectionOverlay.height);

  const { x, y, width, height } = state.selection;
  const scale = state.scale;

  selCtx.strokeStyle = '#7eb8da';
  selCtx.lineWidth = 2;
  selCtx.setLineDash([4, 4]);
  selCtx.strokeRect(x * scale, y * scale, width * scale, height * scale);
  selCtx.setLineDash([]);
}

function showSelectionToolbar() {
  if (!state.selection) return;

  const toolbar = $('selection-toolbar');
  const scale = state.scale;
  const rect = canvas.getBoundingClientRect();
  const containerRect = canvasContainer.getBoundingClientRect();

  const selX = state.selection.x * scale + (rect.left - containerRect.left);
  const selY = state.selection.y * scale + (rect.top - containerRect.top);

  toolbar.style.left = selX + 'px';
  toolbar.style.top = (selY - 30) + 'px';
  toolbar.classList.remove('hidden');

  // Capture selection data
  const layer = getCurrentLayer();
  if (layer) {
    state.selectionData = layer.ctx.getImageData(
      state.selection.x, state.selection.y,
      state.selection.width, state.selection.height
    );
  }
}

function clearSelection() {
  state.selection = null;
  state.selectionData = null;
  state.selectionMode = null;
  $('selection-toolbar').classList.add('hidden');
  selCtx.clearRect(0, 0, selectionOverlay.width, selectionOverlay.height);
}

function startSelectionAction(mode) {
  state.selectionMode = mode;
  $('selection-toolbar').classList.add('hidden');

  if (mode === 'move') {
    // Clear original area
    const layer = getCurrentLayer();
    if (layer) {
      layer.ctx.clearRect(state.selection.x, state.selection.y,
                          state.selection.width, state.selection.height);
      render();
    }
  }
}

function applySelectionMove() {
  if (!state.selection || !state.selectionData) return;

  const layer = getCurrentLayer();
  if (layer) {
    layer.ctx.putImageData(state.selectionData, state.selection.x, state.selection.y);
    render();
    saveState();
  }

  clearSelection();
}

function deleteSelection() {
  if (!state.selection) return;

  const layer = getCurrentLayer();
  if (layer) {
    layer.ctx.clearRect(state.selection.x, state.selection.y,
                        state.selection.width, state.selection.height);
    render();
    saveState();
  }

  clearSelection();
}

// Rendering
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw layers from bottom to top
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i];
    if (layer.visible) {
      ctx.globalAlpha = layer.opacity / 100;
      ctx.drawImage(layer.canvas, 0, 0);
    }
  }
  ctx.globalAlpha = 1;
}

// Grid
function drawGrid() {
  if (!state.showGrid) {
    gridCtx.clearRect(0, 0, gridOverlay.width, gridOverlay.height);
    return;
  }

  gridCtx.clearRect(0, 0, gridOverlay.width, gridOverlay.height);
  gridCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  gridCtx.lineWidth = 1;

  const scale = state.scale;

  for (let x = 0; x <= state.canvas.width; x++) {
    gridCtx.beginPath();
    gridCtx.moveTo(x * scale, 0);
    gridCtx.lineTo(x * scale, gridOverlay.height);
    gridCtx.stroke();
  }

  for (let y = 0; y <= state.canvas.height; y++) {
    gridCtx.beginPath();
    gridCtx.moveTo(0, y * scale);
    gridCtx.lineTo(gridOverlay.width, y * scale);
    gridCtx.stroke();
  }
}

function toggleGrid() {
  state.showGrid = !state.showGrid;
  $('btn-grid').classList.toggle('selected', state.showGrid);
  drawGrid();
}

// History (Undo/Redo)
function saveState() {
  // Remove any future states if we're not at the end
  state.history = state.history.slice(0, state.historyIndex + 1);

  // Serialize layers
  const layersData = state.layers.map(layer => ({
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    imageData: layer.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height)
  }));

  state.history.push({
    layers: layersData,
    currentLayerId: state.currentLayerId
  });

  // Limit history size
  if (state.history.length > state.maxHistory) {
    state.history.shift();
  } else {
    state.historyIndex++;
  }

  state.hasUnsavedChanges = true;
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  restoreState(state.history[state.historyIndex]);
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  restoreState(state.history[state.historyIndex]);
}

function restoreState(snapshot) {
  state.layers = snapshot.layers.map(data => {
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = state.canvas.width;
    layerCanvas.height = state.canvas.height;
    const layerCtx = layerCanvas.getContext('2d');
    layerCtx.putImageData(data.imageData, 0, 0);

    return {
      id: data.id,
      name: data.name,
      visible: data.visible,
      opacity: data.opacity,
      canvas: layerCanvas,
      ctx: layerCtx
    };
  });

  state.currentLayerId = snapshot.currentLayerId;
  updateLayersPanel();
  render();
}

// Menu
function toggleMenu() {
  $('menu-dropdown').classList.toggle('hidden');
}

function hideMenu() {
  $('menu-dropdown').classList.add('hidden');
}

// File Operations
function checkUnsaved(callback) {
  if (state.hasUnsavedChanges) {
    state.unsavedCallback = callback;
    showDialog($('unsaved-dialog'));
  } else {
    callback();
  }
}

function openFile() {
  $('file-input').click();
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.name.endsWith('.cpxl')) {
    loadProject(file);
  } else {
    loadImage(file);
  }

  e.target.value = '';
}

function loadProject(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      state.canvas.width = data.width;
      state.canvas.height = data.height;
      state.colors = data.colors || { 1: '#000000', 2: '#ffffff' };
      updateSwatchColors();

      state.layers = data.layers.map(layerData => {
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = state.canvas.width;
        layerCanvas.height = state.canvas.height;
        const layerCtx = layerCanvas.getContext('2d');

        // Load image data
        const img = new Image();
        img.onload = () => {
          layerCtx.drawImage(img, 0, 0);
          render();
        };
        img.src = layerData.imageData;

        return {
          id: layerData.id,
          name: layerData.name,
          visible: layerData.visible,
          opacity: layerData.opacity,
          canvas: layerCanvas,
          ctx: layerCtx
        };
      });

      state.currentLayerId = data.currentLayerId || state.layers[0]?.id;
      state.history = [];
      state.historyIndex = -1;
      state.hasUnsavedChanges = false;

      startScreen.classList.add('hidden');
      editor.classList.remove('hidden');

      resizeCanvases();
      updateLayersPanel();
      saveState();

    } catch (err) {
      alert('Failed to load project: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.canvas.width = img.width;
      state.canvas.height = img.height;
      state.layers = [];
      state.history = [];
      state.historyIndex = -1;

      addLayer();
      const layer = getCurrentLayer();
      layer.ctx.drawImage(img, 0, 0);

      state.hasUnsavedChanges = false;

      startScreen.classList.add('hidden');
      editor.classList.remove('hidden');

      resizeCanvases();
      saveState();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function saveProject() {
  const data = {
    version: 1,
    width: state.canvas.width,
    height: state.canvas.height,
    colors: state.colors,
    currentLayerId: state.currentLayerId,
    layers: state.layers.map(layer => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      imageData: layer.canvas.toDataURL('image/png')
    }))
  };

  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'artwork.cpxl';
  a.click();

  URL.revokeObjectURL(url);
  state.hasUnsavedChanges = false;
}

function exportImage() {
  const format = $('export-format').value;

  // Create temp canvas with all layers merged
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = state.canvas.width;
  tempCanvas.height = state.canvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  // Draw layers from bottom to top
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i];
    if (layer.visible) {
      tempCtx.globalAlpha = layer.opacity / 100;
      tempCtx.drawImage(layer.canvas, 0, 0);
    }
  }

  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const url = tempCanvas.toDataURL(mimeType);

  const a = document.createElement('a');
  a.href = url;
  a.download = `artwork.${format}`;
  a.click();

  hideDialog($('export-dialog'));
}

// Resize handler
window.addEventListener('resize', () => {
  if (!editor.classList.contains('hidden')) {
    resizeCanvases();
  }
});

// Start
init();

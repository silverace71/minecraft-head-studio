import { FACES, PALETTE, starterProject, makeLayer, key, canAddPixel, paddingFor, resizeProject, makeMotion, validateProject, skinPixelsFromImageData, clamp } from './model.js';
import { renderEditor, build3D, layerTelemetry, renderCordHtml, renderBrand, clear3DTextureCache } from './render.js';
import { blockbenchExport, blockbenchImport } from './blockbench.js';
import { faceSvg, guideHtml, saveText, safeFile } from './export.js';

const $ = id => document.getElementById(id);
const escapeText = s => String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const STORE_KEY = 'minecraft-head-studio:v1'; // Keep reading existing v0.1 browser projects
let project;
try { const saved = localStorage.getItem(STORE_KEY); project = saved ? validateProject(JSON.parse(saved)) : starterProject(); }
catch { project = starterProject(); }
let activeLayerId = project.layers[0].id;
let activeFace = 'front', tool = 'paint', paintColor = PALETTE[0], selection = null;
let rotationX = -18, rotationY = -30, zoom = 1, globalPhase = null;
let pointerDown = false, pointerButton = 0, selectAnchor = null, lastCell = '';
let undoStack = [], redoStack = [], lastToastTimer, saveTimer, paintRaf, animation = null;
let templateImage = null;

function toast(message, error = false) {
  const box = $('toast');
  box.textContent = message; box.className = error ? 'visible error' : 'visible';
  clearTimeout(lastToastTimer);
  lastToastTimer = setTimeout(() => box.classList.remove('visible'), 3900);
}
function saveLocal() {
  clearTimeout(saveTimer);
  $('save-status').textContent = 'Saving…';
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(project)); $('save-status').textContent = 'Saved in this browser'; }
    catch { $('save-status').textContent = 'Storage full · export JSON'; toast('Browser storage full; export your project JSON to keep the design.', true); }
  }, 380);
}
function pushHistory() {
  undoStack.push(JSON.stringify(project));
  if (undoStack.length > 35) undoStack.shift();
  redoStack = [];
}
function mutate(change, { renderFields = true } = {}) {
  pushHistory();
  change(); clear3DTextureCache();
  if (!project.layers.some(l => l.id === activeLayerId)) activeLayerId = project.layers[0].id;
  refresh({ fields: renderFields }); saveLocal();
}
function restore(kind) {
  const from = kind === 'undo' ? undoStack : redoStack;
  const to = kind === 'undo' ? redoStack : undoStack;
  if (!from.length) return toast(`Nothing to ${kind}`);
  to.push(JSON.stringify(project));
  project = validateProject(JSON.parse(from.pop())); clear3DTextureCache();
  if (!project.layers.some(l => l.id === activeLayerId)) activeLayerId = project.layers[0].id;
  globalPhase = null; selection = null; refresh(); saveLocal();
}
function selectedLayer() { return project.layers.find(l => l.id === activeLayerId) || project.layers[0]; }
function renderLayersList() {
  $('layer-count').textContent = project.layers.length;
  $('layer-count-new').textContent = project.layers.length;
  $('layer-list').innerHTML = project.layers.map((l, i) => {
    const t = layerTelemetry(project, l);
    return `<div class="layer-card ${l.id === activeLayerId ? 'active' : ''}"><div class="layer-card-main">
      <button type="button" class="layer-index" data-action="select-layer" data-id="${escapeText(l.id)}">${String(i + 1).padStart(2, '0')}</button>
      <button type="button" class="layer-meta" data-action="select-layer" data-id="${escapeText(l.id)}"><strong>${escapeText(l.name)}</strong><small>${t.offset >= 0 ? '+' : ''}${t.offset.toFixed(1)} mm · ${t.count} cells ${i < 2 ? '· fixed' : ''}</small></button>
      ${i >= 2 ? `<div class="layer-arrows"><button type="button" title="Move custom layer earlier" data-action="move-up" data-id="${escapeText(l.id)}">↑</button><button type="button" title="Move custom layer later" data-action="move-down" data-id="${escapeText(l.id)}">↓</button></div>` : ''}
      <button type="button" class="layer-eye ${l.visible ? '' : 'muted'}" title="${l.visible ? 'Hide' : 'Show'} layer" data-action="visibility" data-id="${escapeText(l.id)}">${l.visible ? '◉' : '◌'}</button>
      </div></div>`;
  }).join('');
}
function renderStats() {
  $('project-title').innerHTML = `${escapeText(project.name)} <span class="edit-icon">✎</span>`;
  $('stat-res').textContent = `${project.resolution} × ${project.resolution}`;
  $('stat-width').textContent = `${project.headSizeMm} mm`;
  $('stat-layers').textContent = `${project.layers.filter(l => l.visible).length}`;
  $('stat-motions').textContent = `${project.motions.length}`;
  const l = selectedLayer(), t = layerTelemetry(project, l);
  $('model-layer-name').textContent = l.name;
  $('model-radius').textContent = `${t.radius.toFixed(1)} mm`;
  $('undo-button').disabled = undoStack.length === 0;
  $('redo-button').disabled = redoStack.length === 0;
}
function renderFields() {
  const l = selectedLayer(), t = layerTelemetry(project, l);
  $('layer-name').value = l.name;
  $('layer-gap').value = l.gapMm;
  $('layer-gap').disabled = l.kind === 'base';
  $('layer-center').textContent = `${t.radius.toFixed(1)} mm`;
  $('face-side').textContent = `${t.side.toFixed(1)} mm`;
  $('pixel-pitch').textContent = `${t.pixel.toFixed(2)} mm`;
  $('delete-layer').disabled = l.kind === 'base' || l.kind === 'overlay';
  $('resolution-select').value = project.resolution;
  $('head-width').value = project.headSizeMm;
  $('foam-thickness').value = project.foamMm;
  $('trim-mode').value = project.trimMode;
  $('trim-color').value = project.trimColor;
  $('grid-toggle').checked = project.gridVisible;
  $('model-grid-toggle').checked = project.modelGridVisible;
  const ears = project.ears;
  $('ears-enabled').checked=ears.enabled;
  for(const [id,field] of [['ears-width','widthMm'],['ears-height','heightMm'],['ears-depth','depthMm'],['ears-vertical','vertical'],['ears-forward','forwardMm'],['ears-color','color']])$(id).value=ears[field];
  const p = project.plotter;
  $('plotter-enabled').checked = p.enabled;
  $('plotter-drive').value = p.drive;
  $('eye-left-x').value = p.eyeLeft[0]; $('eye-left-y').value = p.eyeLeft[1];
  $('eye-right-x').value = p.eyeRight[0]; $('eye-right-y').value = p.eyeRight[1];
  $('pupil-x').value = p.x * 100; $('pupil-y').value = p.y * 100;
  $('pupil-x-label').textContent = `${Math.round(p.x * 100)}%`;
  $('pupil-y-label').textContent = `${Math.round(p.y * 100)}%`;
  $('cord-lengths').innerHTML = renderCordHtml(project);
  $('motion-preview').value = globalPhase === null ? 0 : globalPhase * 100;
  $('motion-preview-value').textContent = `${Math.round((globalPhase ?? 0) * 100)}%`;
}
function renderMotions() {
  $('motion-list').innerHTML = project.motions.length ? project.motions.map(m => {
    const l = project.layers.find(l => l.id === m.layerId);
    return `<div class="motion-card"><div class="motion-header"><span>${escapeText(m.name)}</span><button title="Remove slider" data-action="delete-motion" data-id="${escapeText(m.id)}">×</button></div><small>${escapeText(m.face)} · ${escapeText(l?.name || 'missing')} · origin (${m.rect[0]},${m.rect[1]}), ${m.rect[2]}×${m.rect[3]} cells</small>
    <div class="field-row"><div><label>Travel X (pixels)</label><input type="number" step=".25" min="-${project.resolution}" max="${project.resolution}" data-motion="dx" data-id="${escapeText(m.id)}" value="${m.dx}"></div><div><label>Travel Y (pixels)</label><input type="number" step=".25" min="-${project.resolution}" max="${project.resolution}" data-motion="dy" data-id="${escapeText(m.id)}" value="${m.dy}"></div></div>
    <div class="field-row"><div><label>Channel gap (mm)</label><input type="number" min="0.5" max="20" step=".5" data-motion="clearanceMm" data-id="${escapeText(m.id)}" value="${m.clearanceMm}"></div><div><label>Return mode</label><select data-motion="returnMode" data-id="${escapeText(m.id)}"><option value="elastic" ${m.returnMode==='elastic'?'selected':''}>Elastic</option><option value="gravity" ${m.returnMode==='gravity'?'selected':''}>Gravity</option><option value="manual" ${m.returnMode==='manual'?'selected':''}>Manual</option></select></div></div></div>`;
  }).join('') : `<p class="helper">No sliders yet. Choose selection tool (⬚), drag a rectangle on a head face, then click the button above.</p>`;
}
function renderCanvas() {
  renderEditor(project, activeFace, $('editor-canvas'), { selectedLayerId: activeLayerId, selection, phase: globalPhase, gridVisible: project.gridVisible });
  $('face-selector').querySelectorAll('[data-face]').forEach(b => b.classList.toggle('selected', b.dataset.face === activeFace));
  $('tool-buttons').querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('selected', b.dataset.tool === tool));
  // Never reset a native color chooser from within paint/render; that used to close it.
}
function renderModel() { build3D(project, $('scene3d'), { rotationX, rotationY, zoom, phase: globalPhase, grid: project.modelGridVisible, selectedLayerId: activeLayerId }); }
function refresh({ fields = true } = {}) {
  renderLayersList(); renderStats(); renderMotions();
  if (fields) renderFields();
  renderCanvas(); renderModel();
}
function scheduleCanvasModel() {
  if (paintRaf) return;
  paintRaf = requestAnimationFrame(() => { paintRaf = null; renderCanvas(); renderModel(); });
}
function cellFromEvent(event) {
  const rect = $('editor-canvas').getBoundingClientRect();
  const cells = project.resolution + paddingFor(project.resolution) * 2;
  const x = Math.floor((event.clientX - rect.left) / rect.width * cells) - paddingFor(project.resolution);
  const y = Math.floor((event.clientY - rect.top) / rect.height * cells) - paddingFor(project.resolution);
  return [x, y];
}
function drawAt(x, y, forcedTool) {
  const l = selectedLayer(), n = project.resolution, pad = paddingFor(n);
  if (x < -pad || x >= n + pad || y < -pad || y >= n + pad) return;
  const brush = forcedTool || tool;
  const dest = l.surfaces[activeFace], k = key(x, y);
  if (brush === 'pick') {
    const pixel = dest[k];
    if (pixel) { setBrushColor(pixel.color); toast('Pixel color sampled'); }
    return;
  }
  if (brush === 'erase') { delete dest[k]; clear3DTextureCache(); scheduleCanvasModel(); return; }
  if (brush !== 'paint' && brush !== 'mesh') return;
  if (!canAddPixel(dest, n, x, y)) { toast('Extension pixels must be directly adjacent to another pixel on this layer.', true); return; }
  dest[k] = { color: paintColor, mesh: brush === 'mesh' }; clear3DTextureCache();
  if (!l.visible) l.visible = true;
  scheduleCanvasModel();
}
function eventForSelection(x, y) {
  const n = project.resolution;
  const cx = clamp(Math.floor(x), 0, n - 1), cy = clamp(Math.floor(y), 0, n - 1);
  if (!selectAnchor) selectAnchor = [cx, cy];
  const [ax, ay] = selectAnchor;
  selection = { face: activeFace, rect: [Math.min(ax, cx), Math.min(ay, cy), Math.abs(ax - cx) + 1, Math.abs(ay - cy) + 1] };
  renderCanvas();
}
function setTab(tab) {
  document.querySelectorAll('#inspector-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
}
function newLayer(kind) {
  mutate(() => {
    const idx = project.layers.length + 1;
    const l = makeLayer(kind, `${String(idx).padStart(2, '0')} · ${kind === 'internal' ? 'Internal backing' : 'Extra outer layer'}`, kind === 'internal' ? 5 : 8);
    project.layers.push(l); activeLayerId = l.id;
  });
  setTab('layers'); toast(kind === 'internal' ? 'Internal backing added. Paint a hidden coverage patch.' : 'External layer added. You can extend pixels beyond the original head.');
}
function importFileInput(file, onLoad) {
  if (!file || file.size > 5_000_000 || file.type && file.type !== 'image/png') throw new Error('Choose a PNG under 5 MB');
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    try {
      if (image.width > 1024 || image.height > 1024) throw new Error('Image is too large');
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      onLoad(ctx.getImageData(0, 0, image.width, image.height));
    } catch (err) { toast(err.message, true); }
    finally { URL.revokeObjectURL(objectUrl); }
  };
  image.onerror = () => { URL.revokeObjectURL(objectUrl); toast('Could not read this PNG skin', true); };
  image.src = objectUrl;
}
function applySkin(data, source) {
  const replacement = skinPixelsFromImageData(data, project.resolution);
  if (!window.confirm('Replace the current head skin and reset sliders / extra layers? Export a JSON backup first if you want to keep this design.')) return;
  mutate(() => {
    project.layers = replacement; project.motions = [];project.plotter.enabled = false;project.ears.enabled = false;
    project.username = source || ''; activeLayerId = project.layers[0].id;
    project.name = source ? `${source}'s foamboard head` : 'Imported foamboard head';
    selection = null; globalPhase = null;
  });
  toast('Head and hat layers imported across all six sides.');
}
async function fetchPlayer(name) {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return toast('Java username must be 3–16 letters, numbers or underscores.', true);
  const button = $('username-submit'); button.textContent = '…'; button.disabled = true;
  try {
    const response = await fetch(`/api/skin/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(23000) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Skin service returned ${response.status}`); }
    const blob = await response.blob();
    importFileInput(new File([blob], `${name}.png`, { type: 'image/png' }), data => applySkin(data, response.headers.get('X-Minecraft-Username') || name));
  } catch (err) { toast(`Could not load player skin: ${err.message}`, true); }
  finally { button.textContent = 'Fetch'; button.disabled = false; }
}
function exportJson() { saveText(`${safeFile(project.name)}.headstudio.json`, JSON.stringify(project, null, 2), 'application/json'); toast('Project JSON downloaded'); }
function exportSvg() { const l = selectedLayer(); saveText(`${safeFile(project.name)}-${safeFile(l.name)}-${activeFace}.svg`, faceSvg(project, l, activeFace), 'image/svg+xml'); toast(`SVG cut plan exported for ${activeFace}`); }
function exportGuide() { saveText(`${safeFile(project.name)}-BUILD-GUIDE.html`, guideHtml(project), 'text/html'); toast('Step-by-step guide downloaded. Open the HTML and print or save as PDF.'); }

$('username-form').addEventListener('submit', e => { e.preventDefault(); fetchPlayer($('username-input').value.trim()); });
$('skin-file').addEventListener('change', e => { const file = e.target.files?.[0]; if (file) { try { importFileInput(file, data => applySkin(data, '')); } catch(err) { toast(err.message, true); } } e.target.value = ''; });
const upload = $('upload-zone');
for (const e of ['dragenter','dragover']) upload.addEventListener(e, evt => { evt.preventDefault(); upload.classList.add('dragover'); });
for (const e of ['dragleave','drop']) upload.addEventListener(e, evt => { evt.preventDefault(); upload.classList.remove('dragover'); });
upload.addEventListener('drop', e => { const file = e.dataTransfer.files[0]; if (file) { try { importFileInput(file, data => applySkin(data, '')); } catch(err) { toast(err.message, true); } } });
$('import-project-button').addEventListener('click', () => $('project-file').click());
$('project-file').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 7_000_000) throw new Error('Project exceeds 7MB limit');
    const incoming = validateProject(JSON.parse(await file.text()));
    if (!confirm('Replace your current project with this JSON?')) return;
    pushHistory(); project = incoming; clear3DTextureCache(); activeLayerId = project.layers[0].id; globalPhase = null;selection = null;
    refresh();saveLocal();toast('Project imported');
  } catch (err) { toast(`Invalid project: ${err.message}`, true); }
  finally { e.target.value = ''; }
});
$('save-project-button').addEventListener('click', exportJson);
$('right-save-json').addEventListener('click', exportJson);
$('export-svg-button').addEventListener('click', exportSvg);
$('right-export-svg').addEventListener('click', exportSvg);
$('export-guide-button').addEventListener('click', exportGuide);
$('right-export-guide').addEventListener('click', exportGuide);
$('add-outer').addEventListener('click', () => newLayer('outer'));
$('add-internal').addEventListener('click', () => newLayer('internal'));
$('undo-button').addEventListener('click', () => restore('undo'));
$('redo-button').addEventListener('click', () => restore('redo'));
$('face-selector').addEventListener('click', e => { const button = e.target.closest('[data-face]'); if (!button) return; activeFace = button.dataset.face; selection = null;renderCanvas(); });
$('tool-buttons').addEventListener('click', e => { const button = e.target.closest('[data-tool]'); if (!button) return; tool = button.dataset.tool; renderCanvas(); });
$('paint-color').addEventListener('input', e => setBrushColor(e.target.value));
$('grid-toggle').addEventListener('change', e => { project.gridVisible = e.target.checked; renderCanvas(); saveLocal(); });
$('model-grid-toggle').addEventListener('change', e => { project.modelGridVisible=e.target.checked;renderModel();saveLocal(); });
$('layer-list').addEventListener('click', e => {
  const b = e.target.closest('button[data-action]'); if (!b) return;
  if (b.dataset.action === 'select-layer') { activeLayerId = b.dataset.id;refresh(); }
  if (b.dataset.action === 'visibility') mutate(() => { const l = project.layers.find(x => x.id === b.dataset.id); if (l) l.visible = !l.visible; });
  if (b.dataset.action === 'move-up' || b.dataset.action === 'move-down') {
    const at = project.layers.findIndex(x => x.id === b.dataset.id);
    if (at < 2) return;
    const direction = b.dataset.action === 'move-up' ? -1 : 1;
    const other = at + direction;
    if (other < 2 || other >= project.layers.length || project.layers[other].kind !== project.layers[at].kind) return toast('Layers can only be reordered within the same kind (outer or internal).');
    mutate(() => { [project.layers[at], project.layers[other]] = [project.layers[other], project.layers[at]]; });
  }
});
$('inspector-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
$('layer-name').addEventListener('change', e => mutate(() => { selectedLayer().name = e.target.value.trim().slice(0,70) || 'Untitled layer'; }));
$('layer-gap').addEventListener('change', e => mutate(() => { if (selectedLayer().kind !== 'base') selectedLayer().gapMm = clamp(e.target.value, 0, 150); }));
$('delete-layer').addEventListener('click', () => {
  const l = selectedLayer(); if (l.kind === 'base' || l.kind === 'overlay') return toast('The first two layers are protected.', true);
  if (!confirm(`Permanently delete "${l.name}" and its pixels? This can be undone while this page remains open.`)) return;
  mutate(() => { project.layers = project.layers.filter(x => x.id !== l.id);project.motions = project.motions.filter(m => m.layerId !== l.id);activeLayerId = project.layers[0].id; });
  toast('Layer deleted');
});
$('resolution-select').addEventListener('change', e => {
  const next = Number(e.target.value);
  mutate(() => { project = resizeProject(project, next);selection = null; });
  toast(`Resolution changed to ${next} × ${next}. Nearest-neighbor pixel scaling applied.`);
});
$('head-width').addEventListener('change', e => mutate(() => { project.headSizeMm = clamp(e.target.value,80,1500); }));
$('foam-thickness').addEventListener('change', e => mutate(() => { project.foamMm = clamp(e.target.value,1,25); }));
$('trim-mode').addEventListener('change', e => mutate(() => { project.trimMode = e.target.value === 'tape' ? 'tape' : 'paint'; }));
$('trim-color').addEventListener('change', e => mutate(() => { project.trimColor = e.target.value; }));
$('project-title').addEventListener('click', renameProject);
$('project-title').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault();renameProject(); } });
function renameProject() { const name = prompt('Project name:', project.name); if (name !== null && name.trim()) mutate(() => project.name = name.trim().slice(0,100)); }

const editor = $('editor-canvas');
editor.addEventListener('contextmenu', e => e.preventDefault());
editor.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.button !== 2) return;
  editor.setPointerCapture(e.pointerId);pointerDown = true;pointerButton = e.button;lastCell = '';
  const [x,y] = cellFromEvent(e);
  if (tool === 'select' && e.button === 0) { selectAnchor = null;eventForSelection(x,y); }
  else if (tool === 'pick' && e.button === 0) { drawAt(x,y);pointerDown = false; }
  else { pushHistory();drawAt(x,y,e.button === 2 ? 'erase' : null);lastCell = key(x,y); }
  e.preventDefault();
});
editor.addEventListener('pointermove', e => {
  const [x,y] = cellFromEvent(e);
  $('editor-coordinates').textContent = `${activeFace.toUpperCase()} · ${x}, ${y}`;
  if (!pointerDown) return;
  if (tool === 'select' && pointerButton === 0) eventForSelection(x,y);
  else if (lastCell !== key(x,y)) { drawAt(x,y,pointerButton===2?'erase':null);lastCell = key(x,y); }
});
function endDrawing() {
  if (!pointerDown) return;
  pointerDown = false; selectAnchor = null;
  if (tool !== 'select' && tool !== 'pick') { renderLayersList();renderStats();saveLocal(); }
}
editor.addEventListener('pointerup', endDrawing);
editor.addEventListener('pointercancel', endDrawing);
editor.addEventListener('lostpointercapture', endDrawing);
$('new-motion').addEventListener('click', () => {
  if (!selection || selection.face !== activeFace) { tool = 'select';renderCanvas(); return toast('Use the square selection tool and drag a rectangle inside a face first.'); }
  try { mutate(() => { project.motions.push(makeMotion(project,activeLayerId,activeFace,selection.rect)); });toast('Slider group added. Adjust travel and return type below.'); }
  catch (err) { toast(err.message, true); }
});
$('motion-list').addEventListener('click', e => {
  const button = e.target.closest('[data-action="delete-motion"]');
  if (!button) return;
  if (!confirm('Remove this motion group? Pixels will remain in their source layer.')) return;
  mutate(() => project.motions = project.motions.filter(m => m.id !== button.dataset.id));
});
$('motion-list').addEventListener('change', e => {
  const field = e.target.dataset.motion, id = e.target.dataset.id;
  if (!field || !id) return;
  // Defer replacement of the focused input until its change/blur event completes.
  // Replacing it synchronously causes a DOM mutation exception in Chromium.
  const value = e.target.value;
  setTimeout(() => mutate(() => {
    const m = project.motions.find(x => x.id === id); if (!m) return;
    if (field === 'returnMode') m.returnMode = ['gravity','elastic','manual'].includes(value) ? value : 'manual';
    else m[field] = clamp(value, field === 'clearanceMm' ? .5 : -project.resolution, field === 'clearanceMm' ? 20 : project.resolution);
  }), 0);
});
$('motion-preview').addEventListener('input', e => { globalPhase = Number(e.target.value) / 100; $('motion-preview-value').textContent = `${e.target.value}%`;scheduleCanvasModel(); });
$('animate-motion').addEventListener('click', () => {
  if (animation) { cancelAnimationFrame(animation);animation = null;$('animate-motion').textContent='▶ Play movement';return; }
  const start = performance.now();$('animate-motion').textContent='■ Stop movement';
  function step(t) { globalPhase = (1-Math.cos((t-start)/800*Math.PI))/2; $('motion-preview').value = globalPhase*100; $('motion-preview-value').textContent = `${Math.round(globalPhase*100)}%`;scheduleCanvasModel();animation=requestAnimationFrame(step); }
  animation = requestAnimationFrame(step);
});
$('plotter-enabled').addEventListener('change', e => mutate(() => { project.plotter.enabled = e.target.checked; }));
$('plotter-drive').addEventListener('change', e => mutate(() => { project.plotter.drive = e.target.value === 'hanging' ? 'hanging' : 'four-corner'; }));
for (const [input, which, index, maximum] of [['eye-left-x','eyeLeft',0,6],['eye-left-y','eyeLeft',1,5],['eye-right-x','eyeRight',0,6],['eye-right-y','eyeRight',1,5]]) {
  $(input).addEventListener('change', e => mutate(() => {project.plotter[which][index] = clamp(Math.round(Number(e.target.value)),0,maximum); }));
}
for (const [input, prop] of [['pupil-x','x'],['pupil-y','y']]) {
  $(input).addEventListener('input', e => { project.plotter[prop] = Number(e.target.value)/100; clear3DTextureCache(); $(input+'-label').textContent = `${e.target.value}%`; $('cord-lengths').innerHTML = renderCordHtml(project);scheduleCanvasModel();saveLocal(); });
}
$('reset-view').addEventListener('click', () => { rotationX = -18;rotationY = -30;zoom=1;$('zoom').value=1;renderModel(); });
$('zoom').addEventListener('input', e => {zoom=Number(e.target.value);renderModel();});
let orbitStart = null;
$('model-viewport').addEventListener('pointerdown', e => { if (e.button !== 0) return;orbitStart=[e.clientX,e.clientY,rotationX,rotationY];$('model-viewport').setPointerCapture(e.pointerId); });
$('model-viewport').addEventListener('pointermove', e => { if (!orbitStart) return;rotationY=orbitStart[3]+(e.clientX-orbitStart[0])*.55;rotationX=clamp(orbitStart[2]-(e.clientY-orbitStart[1])*.5,-80,80);renderModel(); });
$('model-viewport').addEventListener('pointerup', () => orbitStart=null);
$('model-viewport').addEventListener('pointercancel', () => orbitStart=null);
$('model-viewport').addEventListener('wheel', e => { e.preventDefault();zoom=clamp(zoom + (e.deltaY>0?-.07:.07),.65,1.5);$('zoom').value=zoom;renderModel(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select')) return;
  if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z') { e.preventDefault();restore(e.shiftKey?'redo':'undo'); }
  if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y') { e.preventDefault();restore('redo'); }
  if (e.key.toLowerCase()==='b') {tool='paint';renderCanvas();}
  if (e.key.toLowerCase()==='e') {tool='erase';renderCanvas();}
  if (e.key.toLowerCase()==='s' && !e.ctrlKey && !e.metaKey) {tool='select';renderCanvas();}
});

// Studio v0.2: a narrow left toolbar with all setup panels collapsed by default.
function toggleDrawer(force) {
  const open=force??!document.body.classList.contains('drawer-open');
  document.body.classList.toggle('drawer-open',open);
  $('left-drawer-toggle').setAttribute('aria-expanded',String(open));
}
$('left-drawer-toggle').addEventListener('click',()=>toggleDrawer());
$('left-drawer-close').addEventListener('click',()=>toggleDrawer(false));
document.addEventListener('keydown',e=>{ if(e.key==='Escape')toggleDrawer(false); });

function setBrushColor(hex) {
  if(!/^#[\da-f]{6}$/i.test(hex))return;
  paintColor=hex.toLowerCase();
  if($('paint-color').value!==paintColor)$('paint-color').value=paintColor;
  $('paint-hex').value=paintColor.toUpperCase();
  $('color-label').textContent=paintColor.toUpperCase();
  document.querySelectorAll('#color-palette button').forEach(b=>b.classList.toggle('selected',b.dataset.hex===paintColor));
}
$('color-palette').innerHTML=PALETTE.map(c=>`<button type="button" style="background:${c}" data-hex="${c}" title="Use ${c}" aria-label="Use ${c}"></button>`).join('');
$('color-palette').addEventListener('click',e=>{const b=e.target.closest('button[data-hex]');if(b)setBrushColor(b.dataset.hex);});
$('paint-hex').addEventListener('change',e=>{if(!/^#[0-9a-f]{6}$/i.test(e.target.value))return toast('Use a six-digit hex color, for example #3A5269',true);setBrushColor(e.target.value);});
setBrushColor(paintColor);

// Owner-supplied MinePic reference, keyed to the exact UUID rather than a
// potentially changed Minecraft username. No AI-generated imagery is used.
const OWNER_SKIN_UUID = '234d0c6aad2846eab6f26431c391c10c';
const OWNER_HEAD_URL = `https://minepic.org/head/${OWNER_SKIN_UUID}/256`;
const OWNER_ICON_URL = `https://minepic.org/head/${OWNER_SKIN_UUID}/64`;
const ownerLogo = $('brand-mark');
const favicon = document.querySelector('link[rel="icon"]');
if (favicon) favicon.addEventListener('error', () => { if (!favicon.href.endsWith('/favicon.png')) favicon.href = '/favicon.png'; });
let exactLocalOwnerRender = null;

// Show precisely the MinePic head supplied by the owner. If MinePic is down,
// use a locally rendered cube built from the SAME UUID's raw Mojang skin.
// If both services fail, use neutral HS lettering rather than the old,
// incorrect illustrated head.
ownerLogo.addEventListener('error', () => {
  const backup = exactLocalOwnerRender || '/logo.png';
  if (!ownerLogo.src.endsWith(backup) && ownerLogo.src !== backup) ownerLogo.src = backup;
});
ownerLogo.src = OWNER_HEAD_URL;
if (favicon) favicon.href = OWNER_ICON_URL;

async function loadOwnerBrand() {
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    // A 32-hex-character ID now bypasses username resolution on our API.
    const res = await fetch(`/api/skin/${OWNER_SKIN_UUID}`, { signal: AbortSignal.timeout(18000) });
    if (!res.ok) throw new Error(`Skin service returned ${res.status}`);
    const blob = await res.blob();
    if (blob.size > 2_000_000) throw new Error('Skin PNG exceeds allowed size');
    const temp = URL.createObjectURL(blob);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve; image.onerror = reject; image.src = temp;
      });
      if (image.width > 1024 || image.height > 1024) throw new Error('Skin exceeds maximum dimensions');
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const layers = skinPixelsFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), 8);
      const exactProject = starterProject(); exactProject.layers = layers;
      exactLocalOwnerRender = renderBrand(exactProject);
      // Preserve the exact MinePic logo unless that image failed to load.
      // Favicon comes from the verified raw-skin pixels, not a placeholder.
      if (favicon) favicon.href = exactLocalOwnerRender;
      if (ownerLogo.getAttribute('src') === '/logo.png') ownerLogo.src = exactLocalOwnerRender;
    } finally { URL.revokeObjectURL(temp); }
  } catch (err) {
    console.info('Exact UUID skin unavailable. Keeping the supplied MinePic head when accessible.', err?.message);
  }
}
loadOwnerBrand();

const ears=$('ears-enabled');
ears.addEventListener('change',e=>mutate(()=>{project.ears.enabled=e.target.checked;}));
for(const [id,field,lo,hi] of [['ears-width','widthMm',1,300],['ears-height','heightMm',1,300],['ears-depth','depthMm',1,300],['ears-vertical','vertical',-1,1],['ears-forward','forwardMm',-200,200]]) {
  $(id).addEventListener('change',e=>mutate(()=>{project.ears[field]=clamp(e.target.value,lo,hi);}));
}
$('ears-color').addEventListener('change',e=>mutate(()=>{project.ears.color=e.target.value;}));

// The image template is kept only in this tab's memory. No server storage, and
// the project JSON contains only painted pixels rather than base64 PNGs.
function rememberTemplate(canvas,face) {
  templateImage={canvas,face};
  Object.defineProperty(project,'_template',{value:templateImage,configurable:true,enumerable:false});
  $('template-status').textContent=`Previewing template on ${face}; export or stamp to save pixels.`;
  renderCanvas();
}
$('template-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try {
    if(file.size>3_000_000)throw Error('Template must be under 3 MB');
    if(file.name.toLowerCase().endsWith('.json')) {
      const obj=JSON.parse(await file.text());
      if(obj?.format!=='headstudio-face-template' || !FACES.includes(obj.face)||!obj.surface||typeof obj.surface!=='object'||Object.keys(obj.surface).length>10000)throw Error('Not a valid Head Studio face template');
      const entries=Object.entries(obj.surface);
      if(entries.some(([loc,pix])=>!/^[-\d]+,[-\d]+$/.test(loc)||!/^#[0-9a-f]{6}$/i.test(pix?.color||'')))throw Error('Template has invalid pixels');
      const n=project.resolution;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=n;
      const c=canvas.getContext('2d');const factor=n/(Number(obj.resolution)||n);
      for(const [loc,pix] of entries){const [x,y]=loc.split(',').map(Number);c.fillStyle=pix.color;c.fillRect(Math.floor(x*factor),Math.floor(y*factor),Math.max(1,Math.ceil(factor)),Math.max(1,Math.ceil(factor)));}
      rememberTemplate(canvas,activeFace);
      templateImage.surface=obj.surface;templateImage.resolution=Number(obj.resolution)||n;
    } else if(file.type==='image/png'||file.name.toLowerCase().endsWith('.png')) {
      const blob=URL.createObjectURL(file);const img=new Image();
      try {await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Could not decode template PNG'));img.src=blob;});
        if(img.width>2048||img.height>2048)throw Error('Template PNG must be 2048px or smaller');
        const canvas=document.createElement('canvas');canvas.width=canvas.height=project.resolution;
        const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(img,0,0,canvas.width,canvas.height);
        rememberTemplate(canvas,activeFace);
      }finally {URL.revokeObjectURL(blob);}
    }else throw Error('Use PNG or .headtemplate.json');
  }catch(err){toast(`Template: ${err.message}`,true);}
});
$('template-apply').addEventListener('click',()=>{
  if(!templateImage)return toast('Load a template image first',true);
  if(templateImage.face!==activeFace)return toast(`Switch to the ${templateImage.face} face to stamp this template`,true);
  const n=project.resolution,ctx=templateImage.canvas.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,n,n).data;
  if(!confirm(`Stamp all nontransparent template pixels onto ${selectedLayer().name} / ${activeFace}? Undo is available.`))return;
  mutate(()=>{
    const surface=selectedLayer().surfaces[activeFace];
    if(templateImage.surface) {
      const factor=n/templateImage.resolution,pad=paddingFor(n);
      for(const [loc,pix] of Object.entries(templateImage.surface)) {
        const [x,y]=loc.split(',').map(Number);
        const xx=Math.floor(x*factor),yy=Math.floor(y*factor);
        if(xx>=-pad && yy>=-pad && xx<n+pad && yy<n+pad)surface[key(xx,yy)]={color:pix.color,mesh:!!pix.mesh};
      }
    } else for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=(y*n+x)*4;if(data[i+3]<24)continue;
      surface[key(x,y)]={color:'#'+[data[i],data[i+1],data[i+2]].map(v=>v.toString(16).padStart(2,'0')).join(''),mesh:data[i+3]<180};
    }
    delete project._template;templateImage=null;
  });
  $('template-status').textContent='Template stamped; the colored pixels are now part of your project.';
});
$('template-export').addEventListener('click',()=>{
  const file={format:'headstudio-face-template',version:1,resolution:project.resolution,face:activeFace,surface:selectedLayer().surfaces[activeFace]};
  saveText(`${safeFile(project.name)}-${activeFace}.headtemplate.json`,JSON.stringify(file),'application/json');
  toast('Compact face template downloaded');
});
$('bbmodel-export').addEventListener('click',()=>{
  try {saveText(`${safeFile(project.name)}.bbmodel`,JSON.stringify(blockbenchExport(project)),'application/json');toast('Blockbench model exported, with editable cuboids and texture atlases');}
  catch(err){toast(`Blockbench export: ${err.message}`,true);}
});
$('bbmodel-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try {
    if(file.size>25_000_000)throw Error('Blockbench model exceeds 25 MB');
    const loaded=blockbenchImport(await file.text());
    if(!confirm('Replace current project from the Head Studio data embedded in this Blockbench model?'))return;
    pushHistory();project=loaded;clear3DTextureCache();templateImage=null;selection=null;globalPhase=null;activeLayerId=project.layers[0].id;refresh();saveLocal();toast('Head Studio project restored from Blockbench file');
  }catch(err){toast(`Blockbench import: ${err.message}`,true);}
});
// Keep the 3D canvas sized to the viewport, even after responsive layout changes.
if(typeof ResizeObserver!=='undefined') {
  const observer=new ResizeObserver(()=>requestAnimationFrame(renderModel));
  observer.observe($('model-viewport'));
}

refresh();

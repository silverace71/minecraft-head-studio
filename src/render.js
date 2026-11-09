import { FACES, paddingFor, parseKey, sortedLayers, offsets, cordLengths } from './model.js';

function paintPixel(ctx, pixel, x, y, cell) {
  if (!pixel || !/^#[\da-f]{6}$/i.test(pixel.color || '')) return;
  const px = x * cell, py = y * cell;
  ctx.fillStyle = pixel.color;
  if (!pixel.mesh) {
    ctx.fillRect(px, py, cell, cell);
  } else {
    // A translucent hatched swatch is a design notation, NOT a fabricated mesh specification.
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillRect(px, py, cell, cell);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = pixel.color;
    ctx.lineWidth = Math.max(0.7, cell / 9);
    ctx.beginPath();
    ctx.moveTo(px + 1, py + cell - 1); ctx.lineTo(px + cell - 1, py + 1);
    ctx.moveTo(px + 1, py + 1); ctx.lineTo(px + cell - 1, py + cell - 1);
    ctx.stroke();
    ctx.restore();
  }
}
function motionContains(m, x, y) {
  const [mx, my, mw, mh] = m.rect;
  return x >= mx && x < mx + mw && y >= my && y < my + mh;
}
export function drawSingleLayer(ctx, project, layer, face, cell, pad, phase) {
  const surface = layer.surfaces[face] || {};
  const motions = project.motions.filter(m => m.layerId === layer.id && m.face === face);
  for (const [loc, pixel] of Object.entries(surface)) {
    const [x, y] = parseKey(loc);
    if (motions.some(m => motionContains(m, x, y))) continue;
    paintPixel(ctx, pixel, x + pad, y + pad, cell);
  }
  for (const motion of motions) {
    const fraction = Math.max(0, Math.min(1, phase ?? motion.travel ?? 0));
    for (const [loc, pixel] of Object.entries(surface)) {
      const [x, y] = parseKey(loc);
      if (!motionContains(motion, x, y)) continue;
      paintPixel(ctx, pixel, x + pad + motion.dx * fraction, y + pad + motion.dy * fraction, cell);
    }
  }
}
export function drawPlotter(ctx, project, cell, pad) {
  const p = project.plotter;
  if (!p.enabled) return;
  const s = project.resolution / 8;
  for (const origin of [p.eyeLeft, p.eyeRight]) {
    if (!Array.isArray(origin)) continue;
    const [x, y] = origin.map(v => v * s);
    ctx.fillStyle = p.eyeColor;
    ctx.fillRect((x + pad) * cell, (y + pad) * cell, 2 * s * cell, 3 * s * cell);
    ctx.strokeStyle = '#263342'; ctx.lineWidth = Math.max(0.7, cell / 12);
    ctx.strokeRect((x + pad) * cell, (y + pad) * cell, 2 * s * cell, 3 * s * cell);
    ctx.fillStyle = p.pupilColor;
    ctx.fillRect((x + pad + p.x * s) * cell, (y + pad + p.y * s) * cell, s * cell, 2 * s * cell);
  }
}
export function renderFace(project, face, { layerId = null, plotterOnly = false, phase = null, cell = 8 } = {}) {
  const n = project.resolution, pad = paddingFor(n);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (n + 2 * pad) * cell;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!plotterOnly) {
    for (const layer of sortedLayers(project)) {
      if (!layer.visible || (layerId && layer.id !== layerId)) continue;
      drawSingleLayer(ctx, project, layer, face, cell, pad, phase);
    }
  }
  if ((layerId === null || plotterOnly) && face === 'front') drawPlotter(ctx, project, cell, pad);
  return canvas;
}
export function renderEditor(project, face, canvas, { selectedLayerId, selection, phase = null, gridVisible = true } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, n = project.resolution, pad = paddingFor(n), cells = n + 2 * pad;
  const size = w / cells;
  ctx.clearRect(0, 0, w, w);
  ctx.fillStyle = '#142033'; ctx.fillRect(0, 0, w, w);
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#1c293c' : '#243249';
    ctx.fillRect(x * size, y * size, size, size);
  }
  const preview = renderFace(project, face, { phase });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(preview, 0, 0, w, w);
  if (selectedLayerId) {
    const selected = project.layers.find(l => l.id === selectedLayerId);
    if (selected) {
      const p = renderFace(project, face, { layerId: selectedLayerId, phase });
      ctx.save(); ctx.globalAlpha = 0.17; ctx.drawImage(p, 0, 0, w, w); ctx.restore();
    }
  }
  if (gridVisible) {
    ctx.strokeStyle = 'rgba(206,230,255,.12)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= cells; x++) {
      const q = Math.round(x * size) + .5;
      ctx.moveTo(q, 0); ctx.lineTo(q, w);
      ctx.moveTo(0, q); ctx.lineTo(w, q);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = '#6ac8e9'; ctx.lineWidth = 2;
  ctx.strokeRect(pad * size, pad * size, n * size, n * size);
  const labels = [ 'EXTENSION GRID', `${n} × ${n} HEAD FACE` ];
  ctx.font = 'bold 11px ui-sans-serif,system-ui';
  ctx.fillStyle = '#e4f5fc'; ctx.fillText(labels[0], 10, 17);
  ctx.fillStyle = '#b9e6fa'; ctx.fillText(labels[1], pad * size + 8, pad * size + 18);
  if (selection && selection.face === face) {
    const [sx, sy, sw, sh] = selection.rect;
    ctx.fillStyle = 'rgba(251,166,82,.17)';
    ctx.fillRect((sx + pad) * size, (sy + pad) * size, sw * size, sh * size);
    ctx.setLineDash([7, 4]);ctx.strokeStyle = '#ffbf83';ctx.lineWidth = 2;
    ctx.strokeRect((sx + pad) * size, (sy + pad) * size, sw * size, sh * size);ctx.setLineDash([]);
  }
}
export function build3D(project, root, { rotationX = -18, rotationY = -30, zoom = 1, phase = null } = {}) {
  const n = project.resolution, pad = paddingFor(n), d = offsets(project);
  const virtualMm = 265 / project.headSizeMm;
  root.replaceChildren();
  root.style.transform = `translate(-50%, -50%) rotateX(${rotationX}deg) rotateY(${rotationY}deg) scale(${zoom})`;
  const faceTransforms = {
    front: z => `translate(-50%, -50%) translateZ(${z}px)`,
    back: z => `translate(-50%, -50%) rotateY(180deg) translateZ(${z}px)`,
    right: z => `translate(-50%, -50%) rotateY(90deg) translateZ(${z}px)`,
    left: z => `translate(-50%, -50%) rotateY(-90deg) translateZ(${z}px)`,
    top: z => `translate(-50%, -50%) rotateX(90deg) translateZ(${z}px)`,
    bottom: z => `translate(-50%, -50%) rotateX(-90deg) translateZ(${z}px)`
  };
  for (const layer of sortedLayers(project)) {
    if (!layer.visible) continue;
    const offset = d[layer.id];
    const side = project.headSizeMm + offset * 2;
    if (side <= 0) continue;
    const pxSize = side * virtualMm * (1 + 2 * pad / n);
    const z = side * virtualMm / 2;
    for (const face of FACES) {
      const surface = layer.surfaces[face];
      if (!surface || !Object.keys(surface).length) continue;
      const el = document.createElement('div');
      el.className = 'cube-face';
      el.style.width = el.style.height = `${pxSize}px`;
      el.style.transform = faceTransforms[face](z);
      el.style.backgroundImage = `url("${renderFace(project, face, { layerId: layer.id, phase }).toDataURL('image/png')}")`;
      root.appendChild(el);
    }
  }
  if (project.plotter.enabled) {
    const farthest = Math.max(0, ...Object.values(d));
    const side = project.headSizeMm + 2 * (farthest + 1);
    const el = document.createElement('div');
    el.className = 'cube-face';
    el.style.width = el.style.height = `${side * virtualMm * (1 + 2 * pad / n)}px`;
    el.style.transform = faceTransforms.front(side * virtualMm / 2);
    el.style.backgroundImage = `url("${renderFace(project, 'front', { plotterOnly: true }).toDataURL('image/png')}")`;
    root.appendChild(el);
  }
}
export function layerTelemetry(project, layer) {
  const offset = offsets(project)[layer.id];
  const side = project.headSizeMm + offset * 2;
  return { offset, radius: side / 2, side, pixel: side / project.resolution, count: Object.values(layer.surfaces).reduce((s, obj) => s + Object.keys(obj).length, 0) };
}
export function renderCordHtml(project) {
  const cords = cordLengths(project);
  const active = project.plotter.drive === 'hanging' ? ['TL', 'TR'] : ['TL', 'TR', 'BL', 'BR'];
  return active.map(k => `<span><b>${k}</b> ${cords[k].toFixed(1)} mm</span>`).join('');
}

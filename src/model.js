export const FACES = ['front', 'right', 'back', 'left', 'top', 'bottom'];
export const UV = {
  front: [8, 8], right: [0, 8], back: [24, 8], left: [16, 8],
  top: [8, 0], bottom: [16, 0]
};
export const RESOLUTIONS = [8, 16, 32, 64];
export const PALETTE = ['#dfb18f', '#b97862', '#563a36', '#1e222d', '#ffffff', '#8ddee5', '#ffa765', '#7353b8', '#80bb93', '#f6df79'];
export const id = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);
export const key = (x, y) => `${x},${y}`;
export const parseKey = str => str.split(',').map(Number);
export const clamp = (v, low, high) => Math.min(high, Math.max(low, Number(v) || 0));
export const paddingFor = n => Math.max(2, n / 4);

export function makeLayer(kind = 'outer', name = 'New layer', gapMm = 6) {
  return { id: id(), kind, name, gapMm, visible: true, surfaces: Object.fromEntries(FACES.map(f => [f, {}])) };
}
export function starterProject() {
  const base = makeLayer('base', '01 · Head shell', 0);
  const overlay = makeLayer('overlay', '02 · Skin outer layer', 6);
  const n = 8;
  for (const face of FACES) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let color = '#c58e70';
    if (face === 'front') {
      color = y < 2 ? '#362b37' : '#dca986';
      if ((x === 1 || x === 2 || x === 5 || x === 6) && (y === 3 || y === 4)) color = '#f2eee6';
      if ((x === 2 || x === 5) && y === 4) color = '#3e6c87';
      if ((x === 2 || x === 5) && y === 3) color = '#292e3c';
      if (y === 6 && x >= 3 && x <= 4) color = '#a35c59';
    }
    if (face === 'top') color = '#342b36';
    if (face === 'back') color = y < 5 ? '#332b36' : '#7c534b';
    if (face === 'left' || face === 'right') color = y < 3 ? '#3c3038' : '#c58e70';
    base.surfaces[face][key(x, y)] = { color, mesh: false };
    if (face === 'front' && y === 0 && (x < 2 || x > 5)) overlay.surfaces[face][key(x, y)] = { color: '#2f2634', mesh: false };
    if (face === 'top' && (x === 0 || y === 0)) overlay.surfaces[face][key(x, y)] = { color: '#282632', mesh: false };
  }
  return {
    version: 1, name: 'My Minecraft foamboard head', username: '', resolution: 8,
    headSizeMm: 280, foamMm: 5, trimMode: 'paint', trimColor: '#202735',
    gridVisible: true, layers: [base, overlay], motions: [],
    plotter: { enabled: false, drive: 'four-corner', eyeLeft: [1, 2], eyeRight: [5, 2],
      pupilColor: '#1b293b', eyeColor: '#f5fbff', x: 0.5, y: 0.5 }
  };
}
export function offsets(project) {
  const result = {};
  let outer = 0;
  let inner = 0;
  for (const layer of project.layers) {
    if (layer.kind === 'base') { result[layer.id] = 0; continue; }
    if (layer.kind === 'internal') { inner += Math.max(0, Number(layer.gapMm) || 0); result[layer.id] = -inner; }
    else { outer += Math.max(0, Number(layer.gapMm) || 0); result[layer.id] = outer; }
  }
  return result;
}
export function sortedLayers(project) {
  const d = offsets(project);
  return [...project.layers].sort((a, b) => d[a.id] - d[b.id]);
}
export function projectedSizeMm(project, layerId) {
  const off = offsets(project)[layerId] ?? 0;
  return project.headSizeMm + off * 2;
}
export function canAddPixel(surface, n, x, y) {
  const pad = paddingFor(n);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < -pad || y < -pad || x >= n + pad || y >= n + pad) return false;
  if (x >= 0 && y >= 0 && x < n && y < n) return true;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !!surface[key(x + dx, y + dy)]);
}
export function resizeProject(project, newN) {
  if (!RESOLUTIONS.includes(newN)) throw Error('Unsupported resolution');
  const oldN = project.resolution;
  if (oldN === newN) return project;
  const next = structuredClone(project);
  const oldPad = paddingFor(oldN), newPad = paddingFor(newN);
  for (const layer of next.layers) for (const face of FACES) {
    const old = layer.surfaces[face] || {};
    const fresh = {};
    for (let y = -newPad; y < newN + newPad; y++) for (let x = -newPad; x < newN + newPad; x++) {
      const ox = Math.floor(x * oldN / newN), oy = Math.floor(y * oldN / newN);
      if (ox < -oldPad || oy < -oldPad || ox >= oldN + oldPad || oy >= oldN + oldPad) continue;
      const pixel = old[key(ox, oy)];
      if (pixel) fresh[key(x, y)] = { ...pixel };
    }
    layer.surfaces[face] = fresh;
  }
  next.resolution = newN;
  const factor = newN / oldN;
  next.motions = next.motions.map(m => ({ ...m, rect: m.rect.map(v => Math.round(v * factor)), dx: m.dx * factor, dy: m.dy * factor }));
  // Plotter eye positions are in logical native 8x8 face coordinates, so remain unchanged.
  return next;
}
export function makeMotion(project, layerId, face, rect) {
  const n = project.resolution;
  const [x, y, w, h] = rect;
  if (!project.layers.some(l => l.id === layerId)) throw Error('Unknown layer');
  if (!FACES.includes(face) || w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > n || y + h > n) throw Error('Select a rectangle inside the face first');
  return { id: id(), name: `Slider ${project.motions.length + 1}`, layerId, face, rect: [x, y, w, h],
    dx: 0, dy: 2 * n / 8, returnMode: 'elastic', clearanceMm: 2, travel: 0 };
}
export function validateProject(obj) {
  if (!obj || typeof obj !== 'object' || obj.version !== 1 || !RESOLUTIONS.includes(obj.resolution)) throw Error('Invalid or unsupported project file');
  if (!Array.isArray(obj.layers) || obj.layers.length < 2 || obj.layers.length > 32) throw Error('Invalid layer count');
  if (obj.layers[0].kind !== 'base' || obj.layers[1].kind !== 'overlay') throw Error('First two layers must be the base and outer skin');
  if (!FACES.every(f => obj.layers.every(l => l.surfaces && typeof l.surfaces[f] === 'object' && l.surfaces[f] !== null))) throw Error('Invalid face data');
  if (!Array.isArray(obj.motions) || obj.motions.length > 50 || !obj.plotter) throw Error('Invalid mechanisms');
  if (!Number.isFinite(Number(obj.headSizeMm)) || obj.headSizeMm < 80 || obj.headSizeMm > 1500) throw Error('Invalid head width');
  if (!Number.isFinite(Number(obj.foamMm)) || obj.foamMm < 1 || obj.foamMm > 25) throw Error('Invalid foam thickness');
  let total = 0;
  for (const layer of obj.layers) {
    if (!['base', 'overlay', 'outer', 'internal'].includes(layer.kind) || typeof layer.name !== 'string' || layer.name.length > 100) throw Error('Invalid layer');
    for (const f of FACES) { total += Object.keys(layer.surfaces[f]).length; if (total > 500000) throw Error('Project is too large'); }
  }
  return obj;
}
export const pixelCount = layer => FACES.reduce((sum, face) => sum + Object.keys(layer.surfaces[face] || {}).length, 0);
export function cordLengths(project) {
  const p = project.plotter, pixel = project.headSizeMm / 8;
  const cx = (0.5 + p.x) * pixel, cy = (1 + p.y) * pixel;
  const w = 2 * pixel, h = 3 * pixel;
  const dist = (x, y) => Math.sqrt((cx - x) ** 2 + (cy - y) ** 2);
  return { TL: dist(0, 0), TR: dist(w, 0), BL: dist(0, h), BR: dist(w, h) };
}
export function skinPixelsFromImageData(image, targetN) {
  const { width, height, data } = image;
  if (!(width % 64 === 0 && (height === width || height === width / 2) && width >= 64 && width <= 1024)) {
    throw Error('Use a Minecraft skin PNG: 64×64, legacy 64×32, or an HD multiple (128×128, etc.).');
  }
  const scale = width / 64;
  const layers = [makeLayer('base', '01 · Head shell', 0), makeLayer('overlay', '02 · Skin outer layer', 6)];
  FACES.forEach(face => {
    for (let index = 0; index < 2; index++) {
      if (index === 1 && height === width / 2) continue;
      const [ux, uy] = UV[face];
      const sheetX = (ux + index * 32) * scale, sheetY = uy * scale;
      const dest = layers[index].surfaces[face];
      for (let y = 0; y < targetN; y++) for (let x = 0; x < targetN; x++) {
        const sx = sheetX + Math.floor((x + 0.5) * (8 * scale) / targetN);
        const sy = sheetY + Math.floor((y + 0.5) * (8 * scale) / targetN);
        const idx = (sy * width + sx) * 4;
        if (data[idx + 3] < 24) continue;
        const color = '#' + [...data.slice(idx, idx + 3)].map(v => v.toString(16).padStart(2, '0')).join('');
        dest[key(x, y)] = { color, mesh: data[idx + 3] < 180 };
      }
    }
  });
  return layers;
}

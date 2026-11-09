import { renderCPU3D } from './cpu3d-renderer.js';
import { renderWebGL } from './webgl-renderer.js';
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
  ctx.fillStyle = '#202630'; ctx.fillRect(0, 0, w, w);
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#222831' : '#292f38';
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
  if (project._template && project._template.face === face && project._template.canvas) {
    ctx.save(); ctx.globalAlpha = .38; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(project._template.canvas, pad * size, pad * size, n * size, n * size); ctx.restore();
  }
  if (gridVisible) {
    ctx.strokeStyle = 'rgba(229,236,241,.29)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= cells; x++) {
      const q = Math.round(x * size) + .5;
      ctx.moveTo(q, 0); ctx.lineTo(q, w);
      ctx.moveTo(0, q); ctx.lineTo(w, q);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = '#edbf82'; ctx.lineWidth = 2;
  ctx.strokeRect(pad * size, pad * size, n * size, n * size);
  const labels = [ 'EXTENSION GRID', `${n} × ${n} HEAD FACE` ];
  ctx.font = 'bold 11px ui-sans-serif,system-ui';
  ctx.fillStyle = '#f4f0ea'; ctx.fillText(labels[0], 10, 17);
  ctx.fillStyle = '#f5e7d1'; ctx.fillText(labels[1], pad * size + 8, pad * size + 18);
  if (selection && selection.face === face) {
    const [sx, sy, sw, sh] = selection.rect;
    ctx.fillStyle = 'rgba(251,166,82,.17)';
    ctx.fillRect((sx + pad) * size, (sy + pad) * size, sw * size, sh * size);
    ctx.setLineDash([7, 4]);ctx.strokeStyle = '#ffbf83';ctx.lineWidth = 2;
    ctx.strokeRect((sx + pad) * size, (sy + pad) * size, sw * size, sh * size);ctx.setLineDash([]);
  }
}
/** Canvas 2D software 3D: keeps a single persistent drawing surface, no CSS 3D
 * compositor flicker, no back-face culling, and isotropic X/Y scale. */
function rotated([x,y,z], rx, ry) {
  const a = ry*Math.PI/180, b=rx*Math.PI/180;
  const X=x*Math.cos(a)+z*Math.sin(a), Z=-x*Math.sin(a)+z*Math.cos(a);
  return [X, y*Math.cos(b)-Z*Math.sin(b), y*Math.sin(b)+Z*Math.cos(b)];
}
function faceCorners(face, side, plane) {
  const h=side/2;
  switch(face) {
    case 'front': return [[-h,h,plane],[h,h,plane],[-h,-h,plane],[h,-h,plane]];
    case 'back': return [[h,h,-plane],[-h,h,-plane],[h,-h,-plane],[-h,-h,-plane]];
    case 'right': return [[plane,h,h],[plane,h,-h],[plane,-h,h],[plane,-h,-h]];
    case 'left': return [[-plane,h,-h],[-plane,h,h],[-plane,-h,-h],[-plane,-h,h]];
    case 'top': return [[-h,plane,-h],[h,plane,-h],[-h,plane,h],[h,plane,h]];
    case 'bottom': return [[-h,-plane,h],[h,-plane,h],[-h,-plane,-h],[h,-plane,-h]];
  }
}
function lerpQuad(p, u, v) {
  return [0,1,2].map(i=>p[0][i]*(1-u)*(1-v)+p[1][i]*u*(1-v)+p[2][i]*(1-u)*v+p[3][i]*u*v);
}
function projectPoint(pos, cx, cy, scale, rx, ry) {
  const [x,y,z]=rotated(pos,rx,ry);
  // Large focal length keeps faces visually square over the whole zoom range.
  const perspective= Math.max(.65, 1100/(1100-z*scale));
  return [cx+x*scale*perspective, cy-y*scale*perspective,z];
}
function texturedTriangle(ctx, img, src, dst) {
  const [[u0,v0],[u1,v1],[u2,v2]]=src;
  const [[x0,y0],[x1,y1],[x2,y2]]=dst;
  const det=(u1-u0)*(v2-v0)-(u2-u0)*(v1-v0);
  if(Math.abs(det)<.00001)return;
  const a=((x1-x0)*(v2-v0)-(x2-x0)*(v1-v0))/det;
  const b=((y1-y0)*(v2-v0)-(y2-y0)*(v1-v0))/det;
  const c=((x2-x0)*(u1-u0)-(x1-x0)*(u2-u0))/det;
  const d=((y2-y0)*(u1-u0)-(y1-y0)*(u2-u0))/det;
  const e=x0-a*u0-c*v0, f=y0-b*u0-d*v0;
  ctx.save();ctx.beginPath();
  ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.closePath();ctx.clip();
  ctx.transform(a,b,c,d,e,f);ctx.drawImage(img,0,0);ctx.restore();
}
function drawTextureQuad(ctx,img,p) {
  const w=img.width,h=img.height;
  ctx.imageSmoothingEnabled=false;
  texturedTriangle(ctx,img,[[0,0],[w,0],[0,h]],[p[0],p[1],p[2]]);
  texturedTriangle(ctx,img,[[w,0],[w,h],[0,h]],[p[1],p[3],p[2]]);
}
function drawWire(ctx,p,divisions,from,to,stroke,weight=.6) {
  ctx.strokeStyle=stroke;ctx.lineWidth=weight;
  const trace=(u0,v0,u1,v1)=>{
    const a=[p[0][0]*(1-u0)*(1-v0)+p[1][0]*u0*(1-v0)+p[2][0]*(1-u0)*v0+p[3][0]*u0*v0,
      p[0][1]*(1-u0)*(1-v0)+p[1][1]*u0*(1-v0)+p[2][1]*(1-u0)*v0+p[3][1]*u0*v0];
    const b=[p[0][0]*(1-u1)*(1-v1)+p[1][0]*u1*(1-v1)+p[2][0]*(1-u1)*v1+p[3][0]*u1*v1,
      p[0][1]*(1-u1)*(1-v1)+p[1][1]*u1*(1-v1)+p[2][1]*(1-u1)*v1+p[3][1]*u1*v1];
    ctx.moveTo(...a);ctx.lineTo(...b);
  };
  ctx.beginPath();
  for(let i=0;i<=divisions;i++) {let t=from+(to-from)*i/divisions;trace(t,from,t,to);trace(from,t,to,t);}
  ctx.stroke();
}
function drawSolidQuad(ctx,p,color){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...p[0]);ctx.lineTo(...p[1]);ctx.lineTo(...p[3]);ctx.lineTo(...p[2]);ctx.closePath();ctx.fill();
}
// No image regeneration while simply orbiting the model.
const textureCache=new Map();
let textureRevision=0;
export function clear3DTextureCache(){textureCache.clear();textureRevision++;}
function cachedTexture(project,layer,face,phase,n,pad){
  const cacheKey=`${layer.id}:${face}:${phase??'still'}:${n}`;
  if(!textureCache.has(cacheKey)){
    if(textureCache.size>220)textureCache.clear();
    textureCache.set(cacheKey,renderFace(project,face,{layerId:layer.id,phase,cell:Math.max(2,Math.floor(512/(n+2*pad)))}));
  }
  return textureCache.get(cacheKey);
}
export function build3D(project, canvas, {rotationX=-18,rotationY=-30,zoom=1,phase=null,grid=true,transparent=false,brand=false,selectedLayerId=null}={}) {
  const opts={rotationX,rotationY,zoom,phase,grid,transparent,brand,selectedLayerId};
  const plotterTexture=(p,n,pad)=>renderFace(p,'front',{plotterOnly:true,cell:Math.max(2,Math.floor(512/(n+2*pad)))});
  try {
    if(renderWebGL(project,canvas,opts,cachedTexture,plotterTexture,textureRevision))return;
  } catch(error) {console.warn('WebGL 3D renderer unavailable; switching to software depth buffer:',error);}
  // A context with a failed WebGL program cannot switch to 2D in-place.
  // Replace only the viewport canvas, never the user's editable project.
  if(!canvas.getContext('2d')){
    const fresh=document.createElement('canvas');
    fresh.id=canvas.id;fresh.className=canvas.className;
    fresh.width=canvas.width;fresh.height=canvas.height;
    if(canvas.parentNode)canvas.replaceWith(fresh);
    canvas=fresh;
  }
  if(renderCPU3D(project,canvas,opts,cachedTexture,plotterTexture))return;
  // Legacy emergency fallback for environments without WebGL. The depth-buffered path above is preferred.
  const ctx=canvas.getContext('2d',{alpha:true});
  const rect=canvas.getBoundingClientRect();
  const w=brand?canvas.width:Math.max(200,Math.round(rect.width || canvas.width || 600));
  const h=brand?canvas.height:Math.max(200,Math.round(rect.height || canvas.height || 520));
  const dpr=brand?1:Math.min(2,window.devicePixelRatio||1);
  if(canvas.width!==Math.round(w*dpr))canvas.width=Math.round(w*dpr);
  if(canvas.height!==Math.round(h*dpr))canvas.height=Math.round(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  if(!transparent) {
    const grad=ctx.createLinearGradient(0,0,w,h);
    grad.addColorStop(0,'#191e24');grad.addColorStop(1,'#101419');
    ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    // Neutral construction grid, intentionally separate from texture pixels.
    ctx.strokeStyle='rgba(205,211,209,.055)';ctx.lineWidth=1;
    for(let x=(w/2)%32;x<w;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=(h/2)%32;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  }
  const width=project.headSizeMm, scale=Math.min(w,h)/(width*1.85)*zoom;
  const cx=w*.5,cy=h*.52;
  const drawables=[];
  const off=offsets(project),n=project.resolution,pad=paddingFor(n);
  const drawLayers=brand?project.layers.slice(0,2):sortedLayers(project);
  for(const layer of drawLayers) {
    if(!layer.visible) continue;
    const physical=width+2*off[layer.id];if(physical<=0)continue;
    const side=physical*(1+2*pad/n),plane=physical/2;
    for(const face of FACES) {
      const data=layer.surfaces[face]||{};
      const hasCells=Object.keys(data).length>0;
      if(!hasCells && !(grid && (layer.id===project.layers[0]?.id || layer.id===project.layers[1]?.id || layer.id===selectedLayerId)))continue;
      const pos=faceCorners(face,side,plane);
      const rotatedPts=pos.map(p=>rotated(p,rotationX,rotationY));
      const p=pos.map(q=>projectPoint(q,cx,cy,scale,rotationX,rotationY));
      const z=rotatedPts.reduce((s,v)=>s+v[2],0)/4;
      const image=hasCells?cachedTexture(project,layer,face,phase,n,pad):null;
      drawables.push({z,p,image,kind:'layer',side,plane,face,layer});
    }
  }
  if(!brand && project.plotter.enabled) {
    const outer=Math.max(0,...Object.values(off));const physical=width+2*(outer+1);
    const side=physical*(1+2*pad/n),pos=faceCorners('front',side,physical/2);
    const p=pos.map(q=>projectPoint(q,cx,cy,scale,rotationX,rotationY));
    drawables.push({z:pos.reduce((a,q)=>a+rotated(q,rotationX,rotationY)[2],0)/4+.05,p,image:renderFace(project,'front',{plotterOnly:true,cell:Math.max(2,Math.floor(512/(n+2*pad)))}),kind:'layer',side,plane:physical/2,face:'front'});
  }
  const ear=project.ears;
  if(ear?.enabled && !brand) {
    const ew=Math.max(1,Number(ear.widthMm)||35),eh=Math.max(1,Number(ear.heightMm)||70),ed=Math.max(1,Number(ear.depthMm)||35);
    const centerY=(Number(ear.vertical)||0)*width/2;
    const cz=(Number(ear.forwardMm)||0);
    for(const side of [-1,1]) {
      const ex=side*(width/2+ew/2);
      const center=[ex,centerY,cz];
      const faces={
        front:[[-1,1,1],[1,1,1],[-1,-1,1],[1,-1,1]],
        back:[[1,1,-1],[-1,1,-1],[1,-1,-1],[-1,-1,-1]],
        right:[[1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1]],
        left:[[-1,1,-1],[-1,1,1],[-1,-1,-1],[-1,-1,1]],
        top:[[-1,1,-1],[1,1,-1],[-1,1,1],[1,1,1]],
        bottom:[[-1,-1,1],[1,-1,1],[-1,-1,-1],[1,-1,-1]]
      };
      for(const [face,vertices] of Object.entries(faces)) {
        const pos=vertices.map(v=>[center[0]+v[0]*ew/2,center[1]+v[1]*eh/2,center[2]+v[2]*ed/2]);
        const p=pos.map(q=>projectPoint(q,cx,cy,scale,rotationX,rotationY));
        const z=pos.reduce((sum,q)=>sum+rotated(q,rotationX,rotationY)[2],0)/4;
        drawables.push({z,p,kind:'ear',color:ear.color||'#48546b'});
      }
    }
  }
  drawables.sort((a,b)=>a.z-b.z);
  for(const item of drawables) {
    if(item.image)drawTextureQuad(ctx,item.image,item.p);
    else if(item.kind==='ear')drawSolidQuad(ctx,item.p,item.color);
    if(grid && !brand && item.kind==='layer' && (item.layer?.kind==='base' || item.layer?.id===selectedLayerId)) {
      const divisions=Math.max(1,n+2*pad);
      const b=pad/(n+2*pad),e=(pad+n)/(n+2*pad);
      drawWire(ctx,item.p,n,b,e,'rgba(232,241,235,.17)',.65);
      ctx.strokeStyle='rgba(233,198,135,.76)';ctx.lineWidth=1.2;
      // original head boundary is stronger than extension grid
      drawWire(ctx,item.p,1,b,e,'rgba(232,198,130,.5)',1.1);
      if(item.layer?.id===selectedLayerId && item.layer.kind!=='base')drawWire(ctx,item.p,1,0,1,'rgba(232,198,130,.13)',.7);
    }
    if(item.kind==='ear'){ctx.strokeStyle='rgba(245,238,227,.7)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(...item.p[0]);ctx.lineTo(...item.p[1]);ctx.lineTo(...item.p[3]);ctx.lineTo(...item.p[2]);ctx.closePath();ctx.stroke();}
  }
}
export function renderBrand(project) {
  const c=document.createElement('canvas');c.width=c.height=192;
  build3D(project,c,{rotationX:-22,rotationY:-32,zoom:1.55,grid:false,transparent:true,brand:true});
  return c.toDataURL('image/png');
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

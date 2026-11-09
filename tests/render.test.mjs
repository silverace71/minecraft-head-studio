import test from 'node:test';
import assert from 'node:assert/strict';
import { starterProject, makeLayer, key, paddingFor } from '../src/model.js';
import { sceneFaces } from '../src/webgl-renderer.js';

test('depth renderer uses six double-sided face geometries with no back-face culling', () => {
  const p = starterProject();
  const faces = sceneFaces(p, { grid: false });
  assert.equal(faces.filter(f => f.layer?.kind === 'base').length, 6);
  assert.ok(faces.some(f => f.face === 'back'));
  assert.ok(faces.some(f => f.face === 'bottom'));
});

test('base and transparent skin overlay stay on distinct physical planes', () => {
  const p=starterProject();
  const faces=sceneFaces(p, {grid:false});
  const front=faces.find(f=>f.layer.kind==='base' && f.face==='front');
  const hat=faces.find(f=>f.layer.kind==='overlay' && f.face==='front');
  assert.ok(hat);
  assert.ok(hat.p[0][2] > front.p[0][2]);
  assert.equal(hat.p[0][2]-front.p[0][2], 6);
});

test('extension grid does not scale the original head footprint', () => {
  const p=starterProject();p.resolution=16;
  const f=sceneFaces(p,{grid:true,selectedLayerId:p.layers[0].id}).find(f=>f.face==='front' && f.layer.kind==='base');
  const n=p.resolution,pad=paddingFor(n),side=f.p[1][0]-f.p[0][0];
  const original=side * n/(n+2*pad);
  assert.equal(Math.round(original),p.headSizeMm);
});

test('empty outer layer has visible guide geometry when selected',()=>{
 const p=starterProject();const extra=makeLayer('outer','outer strand',8);
 p.layers.push(extra);
 let faces=sceneFaces(p,{grid:true,selectedLayerId:extra.id}).filter(f=>f.layer?.id===extra.id);
 assert.equal(faces.length,6);
 assert.ok(faces.every(f=>f.wire && !f.filled));
 faces=sceneFaces(p,{grid:false,selectedLayerId:extra.id}).filter(f=>f.layer?.id===extra.id);
 assert.equal(faces.length,0);
});

test('ear cuboids produce all six sides on each ear',()=>{
 const p=starterProject();p.ears.enabled=true;
 assert.equal(sceneFaces(p,{grid:false}).filter(f=>f.ear).length,12);
});

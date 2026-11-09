import test from 'node:test';
import assert from 'node:assert/strict';
import { starterProject, canAddPixel, skinPixelsFromImageData, key, resizeProject, offsets, makeLayer, cordLengths, validateProject } from '../src/model.js';
test('two undeletable default layers and six faces', () => {
 const p=starterProject(); assert.equal(p.layers.length,2); assert.equal(p.layers[0].kind,'base'); assert.equal(p.layers[1].kind,'overlay'); assert.equal(Object.keys(p.layers[0].surfaces).length,6); validateProject(p);
});
test('outside placement requires an existing edge-neighbor',()=>{
 const surface={[key(0,0)]:{color:'#ffffff'}}; assert.equal(canAddPixel(surface,8,-1,0),true); assert.equal(canAddPixel(surface,8,-2,0),false); assert.equal(canAddPixel(surface,8,-3,0),false); assert.equal(canAddPixel(surface,8,1,1),true);
});
test('upscale 8 to 16 using nearest neighbors',()=>{
 const a=starterProject(), b=resizeProject(a,16); assert.equal(b.resolution,16); assert.deepEqual(b.layers[0].surfaces.front[key(0,0)],a.layers[0].surfaces.front[key(0,0)]); assert.deepEqual(b.layers[0].surfaces.front[key(1,0)],a.layers[0].surfaces.front[key(0,0)]);
});
test('layers expand by accumulated specified distance',()=>{
 const p=starterProject(); p.layers[1].gapMm=6; const extra=makeLayer('outer','test',12);p.layers.push(extra); assert.equal(offsets(p)[extra.id],18);
});
test('64 skin front and overlay UV mapping',()=>{
 const data=new Uint8ClampedArray(64*64*4);const paint=(x,y,r,g,b)=>{const i=(y*64+x)*4;data.set([r,g,b,255],i);};paint(8,8,255,0,0);paint(40,8,0,0,255);const [base,overlay]=skinPixelsFromImageData({width:64,height:64,data},8);assert.equal(base.surfaces.front[key(0,0)].color,'#ff0000');assert.equal(overlay.surfaces.front[key(0,0)].color,'#0000ff');
});
test('plotter cord geometry is symmetric at midpoint',()=>{
 const p=starterProject();const c=cordLengths(p);assert.ok(Math.abs(c.TL-c.TR)<1e-8);assert.ok(Math.abs(c.BL-c.BR)<1e-8);
});

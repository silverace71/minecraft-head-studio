import test from 'node:test';
import assert from 'node:assert/strict';
import { starterProject, skinPixelsFromImageData, validateProject, FACES, offsets } from '../src/model.js';
import { faceSvg, guideHtml } from '../src/export.js';

test('every head and hat face imports from a 64x64 PNG, respecting transparency',()=>{
  const data=new Uint8ClampedArray(64*64*4), colors=['#aa0000','#00bb00','#0000cc','#dddd00','#00eeee','#ff00ff'];
  const UV={front:[8,8],right:[0,8],back:[24,8],left:[16,8],top:[8,0],bottom:[16,0]};
  FACES.forEach((f,fi)=>{
    const [sx,sy]=UV[f],hex=colors[fi];
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      for(const layer of [0,1]){
        const i=((sy+y)*64+sx+x+layer*32)*4;
        const color=layer?[180,160,140]:[Number.parseInt(hex.slice(1,3),16),Number.parseInt(hex.slice(3,5),16),Number.parseInt(hex.slice(5,7),16)];
        data.set([...color,layer && x===0 ? 0 : 255],i);
      }
    }
  });
  const [base,overlay]=skinPixelsFromImageData({width:64,height:64,data},16);
  FACES.forEach((f,i)=>{
    assert.equal(base.surfaces[f]['0,0'].color,colors[i]);
    assert.equal(overlay.surfaces[f]['0,0'],undefined);
    assert.equal(overlay.surfaces[f]['4,0'].color,'#b4a08c');
  });
});

test('SVG export respects imported pixels, dimensions and mesh marks',()=>{
  const p=starterProject();p.layers[0].surfaces.front['0,0']={color:'#123456',mesh:true};
  const svg=faceSvg(p,p.layers[0],'front');
  assert.match(svg,/width="[\d.]+mm"/);
  assert.match(svg,/url\(#mesh\)/);
  assert.match(svg,/Core face: 280 mm/);
});

test('ear guidance has all six panels and 45-degree corner instructions',()=>{
  const p=starterProject();p.ears.enabled=true;p.ears.widthMm=44;p.ears.heightMm=60;p.ears.depthMm=22;
  const guide=guideHtml(p);
  assert.match(guide,/Ear cutting and mounting plan/);
  assert.match(guide,/Front\/back/);
  assert.match(guide,/Top\/bottom/);
  assert.match(guide,/45°/);
  assert.match(guide,/44/);
});

test('existing version-1 JSON projects acquire optional ear defaults',()=>{
  const p=starterProject();delete p.ears;delete p.modelGridVisible;
  validateProject(p);
  assert.equal(p.ears.enabled,false);
  assert.equal(p.modelGridVisible,true);
});

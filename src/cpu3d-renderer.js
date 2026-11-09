/**
 * Correct-depth software fallback for browsers without WebGL.
 * Rasterizes actual textured triangles with a per-pixel Z buffer rather than
 * painting whole faces back-to-front. Intentionally caps raster DPR for speed.
 */
import { sceneFaces } from './webgl-renderer.js';
import { offsets, paddingFor } from './model.js';

const sources = new WeakMap();
const FOCAL = 1100;
function texData(canvas) {
  if (!sources.has(canvas)) sources.set(canvas, canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));
  return sources.get(canvas);
}
function rotated(point,rx,ry){
  const [x,y,z]=point;
  const sy=Math.sin(ry),cy=Math.cos(ry),sx=Math.sin(rx),cx=Math.cos(rx);
  const a=x*cy+z*sy,b=-x*sy+z*cy;
  return [a,y*cx-b*sx,y*sx+b*cx];
}
function quad(face,side,plane){
  const h=side/2;
  if(face==='front')return [[-h,h,plane],[h,h,plane],[-h,-h,plane],[h,-h,plane]];
  return null;
}
function interpolate(p,u,v) {
  return [0,1,2].map(i=>p[0][i]*(1-u)*(1-v)+p[1][i]*u*(1-v)+p[2][i]*(1-u)*v+p[3][i]*u*v);
}
function rgba(hex){
  const s=/^#([\da-f]{6})$/i.exec(hex||'');
  const n=s?parseInt(s[1],16):0x43546d;
  return [(n>>16)&255,(n>>8)&255,n&255,255];
}
const FACE_SHADE={front:1,back:.87,left:.91,right:.95,top:1,bottom:.8};
function blend(out,i,r,g,b,a){
  const t=a/255, inv=1-t;
  out[i]=Math.round(r*t+out[i]*inv);
  out[i+1]=Math.round(g*t+out[i+1]*inv);
  out[i+2]=Math.round(b*t+out[i+2]*inv);
  out[i+3]=Math.round(a+out[i+3]*inv);
}
function projectPoint(point, scale, w, h, rx, ry){
  const [x,y,z]=rotated(point,rx,ry);
  const q=FOCAL/(FOCAL-z*scale);
  return {x:w*.5+x*scale*q, y:h*.52-y*scale*q, z, q};
}
function triangleRasterizer(v0,v1,v2,tex,shade,opaque,w,h,out,depth,flat){
  const area=(v1.y-v2.y)*(v0.x-v2.x)+(v2.x-v1.x)*(v0.y-v2.y);
  if(Math.abs(area)<.0000001)return;
  const minX=Math.max(0,Math.floor(Math.min(v0.x,v1.x,v2.x)));
  const maxX=Math.min(w-1,Math.ceil(Math.max(v0.x,v1.x,v2.x)));
  const minY=Math.max(0,Math.floor(Math.min(v0.y,v1.y,v2.y)));
  const maxY=Math.min(h-1,Math.ceil(Math.max(v0.y,v1.y,v2.y)));
  const inverted=1/area;
  const sampler=tex?.data,tw=tex?.width||0,th=tex?.height||0;
  for(let y=minY;y<=maxY;y++) {
    const py=y+.5;
    for(let x=minX;x<=maxX;x++) {
      const px=x+.5;
      const l0=((v1.y-v2.y)*(px-v2.x)+(v2.x-v1.x)*(py-v2.y))*inverted;
      const l1=((v2.y-v0.y)*(px-v2.x)+(v0.x-v2.x)*(py-v2.y))*inverted;
      const l2=1-l0-l1;
      if(l0<-.00001||l1<-.00001||l2<-.00001)continue;
      const idx=y*w+x,pi=idx*4;
      const invW=l0*v0.q+l1*v1.q+l2*v2.q;
      const z=(l0*v0.z*v0.q+l1*v1.z*v1.q+l2*v2.z*v2.q)/invW;
      if(z<depth[idx]+.00005)continue;
      let r,g,b,a;
      if(tex){
        const u=(l0*v0.u*v0.q+l1*v1.u*v1.q+l2*v2.u*v2.q)/invW;
        const v=(l0*v0.v*v0.q+l1*v1.v*v1.q+l2*v2.v*v2.q)/invW;
        const xx=Math.min(tw-1,Math.max(0,Math.floor(u*tw)));
        const yy=Math.min(th-1,Math.max(0,Math.floor(v*th)));
        const i=(yy*tw+xx)*4;
        r=sampler[i];g=sampler[i+1];b=sampler[i+2];a=sampler[i+3];
      } else [r,g,b,a]=flat;
      if(opaque){if(a<254)continue;}
      else {if(a<1||a>=254)continue;}
      r=Math.round(r*shade);g=Math.round(g*shade);b=Math.round(b*shade);
      if(opaque){
        out[pi]=r;out[pi+1]=g;out[pi+2]=b;out[pi+3]=255;depth[idx]=z;
      }else blend(out,pi,r,g,b,a);
    }
  }
}
function lineRasterizer(a,b,color,w,h,out,depth){
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))));
  for(let j=0;j<=steps;j++){
    const t=j/steps, x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t);
    if(x<0||x>=w||y<0||y>=h)continue;
    const q=a.q*(1-t)+b.q*t;
    const z=(a.z*a.q*(1-t)+b.z*b.q*t)/q;
    const idx=y*w+x;
    if(z+.05<depth[idx])continue;
    blend(out,idx*4,...color);
  }
}
function applyGrid(item,n,pad,projectPointFn,w,h,out,depth) {
  const low=pad/(n+2*pad), high=(pad+n)/(n+2*pad);
  for(const count of [n,1]) {
    const color=count===1?[246,194,115,170]:[230,236,234,46];
    for(let i=0;i<=count;i++){
      const t=low+(high-low)*i/count;
      for(const [u0,v0,u1,v1] of [[t,low,t,high],[low,t,high,t]]){
        const a=projectPointFn(interpolate(item.p,u0,v0));
        const b=projectPointFn(interpolate(item.p,u1,v1));
        lineRasterizer(a,b,color,w,h,out,depth);
      }
    }
  }
}
export function renderCPU3D(project,canvas,options,getTexture,drawPlotterTexture) {
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return false;
  const {brand=false,grid=true,phase=null,rotationX=-18,rotationY=-30,zoom=1}=options;
  const rect=canvas.getBoundingClientRect();
  const displayW=brand?canvas.width:Math.max(200,Math.round(rect.width||canvas.width||600));
  const displayH=brand?canvas.height:Math.max(200,Math.round(rect.height||canvas.height||520));
  // Rendering at display resolution is adequate when hardware WebGL is unavailable.
  const dpr=brand?1:Math.min(1,window.devicePixelRatio||1);
  const w=Math.round(displayW*dpr), h=Math.round(displayH*dpr);
  if(canvas.width!==w)canvas.width=w;
  if(canvas.height!==h)canvas.height=h;
  const pixels=ctx.createImageData(w,h);
  const out=pixels.data,depth=new Float32Array(w*h).fill(-Infinity);
  const rx=rotationX*Math.PI/180,ry=rotationY*Math.PI/180;
  const scale=Math.min(w,h)/(project.headSizeMm*1.85)*zoom;
  const projectFn=p=>projectPoint(p,scale,w,h,rx,ry);
  const faces=sceneFaces(project,options),n=project.resolution,pad=paddingFor(n);
  if(!brand&&project.plotter.enabled){
    const outside=Math.max(0,...Object.values(offsets(project)))+1;
    const physical=project.headSizeMm+2*outside;
    faces.push({face:'front',kind:'plotter',p:quad('front',physical*(1+2*pad/n),physical/2),filled:true});
  }
  const tris=[];
  for(const face of faces){
    const source=face.kind==='layer'&&face.filled?getTexture(project,face.layer,face.face,phase,n,pad):
      face.kind==='plotter'?drawPlotterTexture(project,n,pad):null;
    if(!source&&!face.ear)continue;
    const verts=face.p.map(projectFn);
    const shade=FACE_SHADE[face.face]||1;
    const color=face.ear?rgba(project.ears.color):null;
    const image=source?texData(source):null;
    const uv=[[0,0],[1,0],[0,1],[1,1]];
    for(const v of verts){const i=verts.indexOf(v);v.u=uv[i][0];v.v=uv[i][1];}
    tris.push({v:[verts[0],verts[2],verts[1]],tex:image,shade,color,z:(verts[0].z+verts[2].z+verts[1].z)/3});
    tris.push({v:[verts[1],verts[2],verts[3]],tex:image,shade,color,z:(verts[1].z+verts[2].z+verts[3].z)/3});
  }
  for(const t of tris)triangleRasterizer(...t.v,t.tex,t.shade,true,w,h,out,depth,t.color);
  tris.sort((a,b)=>a.z-b.z);
  for(const t of tris)if(t.tex)triangleRasterizer(...t.v,t.tex,t.shade,false,w,h,out,depth,t.color);
  if(grid&&!brand)for(const item of faces)if(item.wire)applyGrid(item,n,pad,projectFn,w,h,out,depth);
  ctx.putImageData(pixels,0,0);
  return true;
}

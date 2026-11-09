/**
 * Depth-buffered, double-sided head renderer. No third-party dependencies.
 * WebGL keeps front/back/outer/inner surfaces in the right order even as
 * the camera crosses an edge; transparent skin pixels never write depth.
 * GPU contexts and uploaded skin textures are cached per canvas.
 */
import { FACES, offsets, paddingFor, sortedLayers } from './model.js';

const contexts = new WeakMap();
const VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec2 a_uv;
uniform mat3 u_rotation;
uniform vec2 u_dimensions;
uniform vec2 u_offset;
uniform float u_scale;
uniform float u_focal;
uniform float u_depthBias;
varying vec2 v_uv;
void main() {
  vec3 p = u_rotation * a_position;
  float w = 1.0 - p.z * u_scale / u_focal;
  vec2 xy = vec2(p.x * u_scale * 2.0 / u_dimensions.x,
                 p.y * u_scale * 2.0 / u_dimensions.y) + u_offset * w;
  gl_Position = vec4(xy, -p.z * u_scale / u_focal + u_depthBias * w, w);
  v_uv = a_uv;
}`;
const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec4 u_flatColor;
uniform bool u_textured;
uniform int u_pass;
uniform float u_shade;
varying vec2 v_uv;
void main() {
  vec4 col = u_textured ? texture2D(u_texture, v_uv) : u_flatColor;
  if (u_pass == 0 && col.a < 0.995) discard;
  if (u_pass == 1 && (col.a <= 0.005 || col.a >= 0.995)) discard;
  if (col.a <= 0.005) discard;
  gl_FragColor = vec4(col.rgb * u_shade, col.a);
}`;
function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('WebGL shader compile: ' + error);
  }
  return shader;
}
function initialize(canvas) {
  if (contexts.has(canvas)) return contexts.get(canvas);
  // A WebGL context must be requested before a 2D context on the same canvas.
  const gl = canvas.getContext('webgl', { alpha: true, depth: true, antialias: true,
    preserveDrawingBuffer: true, premultipliedAlpha: false }) ||
    canvas.getContext('experimental-webgl', { alpha: true, depth: true, antialias: true,
    preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) return null;
  try {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const state = { gl, program, attributes: {
      position: gl.getAttribLocation(program, 'a_position'),
      uv: gl.getAttribLocation(program, 'a_uv')
    }, uniforms: Object.fromEntries(['rotation','dimensions','offset','scale','focal',
      'depthBias','texture','flatColor','textured','pass','shade'].map(k =>
      [k, gl.getUniformLocation(program, 'u_' + k)])),
      buffer: gl.createBuffer(), textures: new Map(), revision: -1 };
    contexts.set(canvas, state);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); contexts.delete(canvas); }, { passive: false });
    return state;
  } catch (e) {
    console.error('3D renderer failed to initialize:', e);
    return null;
  }
}
function faceCorners(face, side, plane) {
  const h = side / 2;
  switch (face) {
    case 'front': return [[-h,h,plane],[h,h,plane],[-h,-h,plane],[h,-h,plane]];
    case 'back': return [[h,h,-plane],[-h,h,-plane],[h,-h,-plane],[-h,-h,-plane]];
    case 'right': return [[plane,h,h],[plane,h,-h],[plane,-h,h],[plane,-h,-h]];
    case 'left': return [[-plane,h,-h],[-plane,h,h],[-plane,-h,-h],[-plane,-h,h]];
    case 'top': return [[-h,plane,-h],[h,plane,-h],[-h,plane,h],[h,plane,h]];
    case 'bottom': return [[-h,-plane,h],[h,-plane,h],[-h,-plane,-h],[h,-plane,-h]];
  }
}
function bilerp(p, u, v) {
  return [0,1,2].map(i => p[0][i]*(1-u)*(1-v) + p[1][i]*u*(1-v) + p[2][i]*(1-u)*v + p[3][i]*u*v);
}
function vertex(p,uv) { return [...p,...uv]; }
function quadTriangles(p) {
  return new Float32Array([
    ...vertex(p[0],[0,0]),...vertex(p[2],[0,1]),...vertex(p[1],[1,0]),
    ...vertex(p[1],[1,0]),...vertex(p[2],[0,1]),...vertex(p[3],[1,1])
  ]);
}
function gridLines(p, n, pad, boundaryOnly = false) {
  const result=[];
  const low=pad/(n+2*pad),high=(pad+n)/(n+2*pad);
  const segment=(u0,v0,u1,v1)=>{
    result.push(...vertex(bilerp(p,u0,v0),[0,0]),...vertex(bilerp(p,u1,v1),[0,0]));
  };
  const count=boundaryOnly?1:n;
  for(let i=0;i<=count;i++){
    const t=low+(high-low)*i/count;
    segment(t,low,t,high); segment(low,t,high,t);
  }
  return new Float32Array(result);
}
function shadeForFace(face) {
  return { front:1, back:.87, left:.91, right:.95, top:1, bottom:.8 }[face] || 1;
}
function rgba(hex) {
  const matched=/^#([0-9a-f]{6})$/i.exec(hex||'');
  if (!matched) return [0.3,0.35,0.43,1];
  const n=parseInt(matched[1],16);
  return [(n>>16 & 255)/255,(n>>8 & 255)/255,(n&255)/255,1];
}
function makeEarFaces(project) {
  const e=project.ears;
  if(!e?.enabled) return [];
  const width=project.headSizeMm;
  const ew=Math.max(1,Number(e.widthMm)||35), eh=Math.max(1,Number(e.heightMm)||70), ed=Math.max(1,Number(e.depthMm)||35);
  const faces=[];
  for(const side of [-1,1]) {
    const center=[side*(width/2+ew/2), (Number(e.vertical)||0)*width/2, Number(e.forwardMm)||0];
    const coords={
      front:[[-1,1,1],[1,1,1],[-1,-1,1],[1,-1,1]],
      back:[[1,1,-1],[-1,1,-1],[1,-1,-1],[-1,-1,-1]],
      right:[[1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1]],
      left:[[-1,1,-1],[-1,1,1],[-1,-1,-1],[-1,-1,1]],
      top:[[-1,1,-1],[1,1,-1],[-1,1,1],[1,1,1]],
      bottom:[[-1,-1,1],[1,-1,1],[-1,-1,-1],[1,-1,-1]]
    };
    for(const [face,verts] of Object.entries(coords)){
      const p=verts.map(v=>[center[0]+v[0]*ew/2,center[1]+v[1]*eh/2,center[2]+v[2]*ed/2]);
      faces.push({face,p,color:rgba(e.color),ear:true});
    }
  }
  return faces;
}
// Public pure-data function for geometry and depth regression tests.
export function sceneFaces(project, {brand=false,grid=true,selectedLayerId=null}={}) {
  const faces=[];
  const n=project.resolution,pad=paddingFor(n),width=project.headSizeMm;
  const off=offsets(project);
  const layers=brand?project.layers.slice(0,2):sortedLayers(project);
  for(const layer of layers){
    if(!layer.visible) continue;
    const physical=width+2*off[layer.id]; if(physical<=0)continue;
    const side=physical*(1+2*pad/n),plane=physical/2;
    for(const face of FACES){
      const filled=Object.keys(layer.surfaces[face]||{}).length>0;
      const wire=grid && (layer.kind==='base'||layer.id===selectedLayerId);
      if(!filled&&!wire) continue;
      faces.push({face,layer,p:faceCorners(face,side,plane),filled,wire,kind:'layer'});
    }
  }
  if(!brand)faces.push(...makeEarFaces(project));
  return faces;
}
function upload(gl,state,source){
  if(state.textures.has(source)) return state.textures.get(source);
  const t=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  state.textures.set(source,t);
  return t;
}
function prepareBuffer(gl,state,vertices){
  gl.bindBuffer(gl.ARRAY_BUFFER,state.buffer);
  gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(state.attributes.position);
  gl.vertexAttribPointer(state.attributes.position,3,gl.FLOAT,false,20,0);
  gl.enableVertexAttribArray(state.attributes.uv);
  gl.vertexAttribPointer(state.attributes.uv,2,gl.FLOAT,false,20,12);
}
export function renderWebGL(project,canvas,options,getTexture,drawPlotterTexture,revision){
  const state=initialize(canvas);
  if(!state) return false;
  const {gl,program,uniforms:u}=state;
  const {brand=false,grid=true,selectedLayerId=null,rotationX=-18,rotationY=-30,
    zoom=1,phase=null,transparent=false}=options;
  if(state.revision!==revision){
    for(const texture of state.textures.values())gl.deleteTexture(texture);
    state.textures.clear(); state.revision=revision;
  }
  const rect=canvas.getBoundingClientRect();
  const w=brand?canvas.width:Math.max(200,Math.round(rect.width||canvas.width||600));
  const h=brand?canvas.height:Math.max(200,Math.round(rect.height||canvas.height||520));
  const dpr=brand?1:Math.min(2,window.devicePixelRatio||1);
  const targetW=Math.round(w*dpr), targetH=Math.round(h*dpr);
  if(canvas.width!==targetW)canvas.width=targetW;
  if(canvas.height!==targetH)canvas.height=targetH;
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.clearColor(0,0,0,0);gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);
  gl.disable(gl.CULL_FACE); // All six faces must render from both sides.
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.texture,0);
  const rx=rotationX*Math.PI/180,ry=rotationY*Math.PI/180;
  const sx=Math.sin(rx),cx=Math.cos(rx),sy=Math.sin(ry),cy=Math.cos(ry);
  gl.uniformMatrix3fv(u.rotation,false,new Float32Array([
    cy,sy*sx,-sy*cx, 0,cx,sx, sy,-cy*sx,cy*cx
  ]));
  gl.uniform2f(u.dimensions,w,h);
  gl.uniform2f(u.offset,0,(.5-.52)*2);
  gl.uniform1f(u.scale,Math.min(w,h)/(project.headSizeMm*1.85)*zoom);
  gl.uniform1f(u.focal,1100);
  gl.uniform1f(u.depthBias,0);
  const faces=sceneFaces(project,options), n=project.resolution,pad=paddingFor(n);
  // Plotter floats slightly above outer visible shell.
  if(!brand&&project.plotter.enabled){
    const outside=Math.max(0,...Object.values(offsets(project)))+1;
    const physical=project.headSizeMm+2*outside;
    faces.push({face:'front',kind:'plotter',filled:true,p:faceCorners('front',physical*(1+2*pad/n),physical/2)});
  }
  for(const item of faces){
    if(item.kind==='layer'&&item.filled){item.source=getTexture(project,item.layer,item.face,phase,n,pad);}
    if(item.kind==='plotter')item.source=drawPlotterTexture(project,n,pad);
    item.tris=quadTriangles(item.p);
  }
  const renderItem=(item,pass)=>{
    const flat=!item.source;
    if(pass===1&&flat)return;
    if(!item.source&&!item.ear)return;
    gl.uniform1f(u.shade,shadeForFace(item.face));
    gl.uniform1i(u.textured,flat?0:1);
    gl.uniform4fv(u.flatColor,item.color||[0,0,0,0]);
    gl.uniform1i(u.pass,pass);
    if(item.source)gl.bindTexture(gl.TEXTURE_2D,upload(gl,state,item.source));
    prepareBuffer(gl,state,item.tris);
    gl.drawArrays(gl.TRIANGLES,0,6);
  };
  // First only fully opaque texels, writing a correct per-pixel depth buffer.
  gl.depthMask(true);
  for(const item of faces)renderItem(item,0);
  // Then partially transparent mesh texels, preserving their translucency.
  gl.depthMask(false);
  for(const item of faces)renderItem(item,1);
  if(grid&&!brand){
    gl.uniform1i(u.textured,0);gl.uniform1i(u.pass,2);gl.uniform1f(u.shade,1);
    gl.uniform1f(u.depthBias,-.00007); // wire hovers just above the panel: no z-fighting.
    for(const item of faces){
      if(!item.wire)continue;
      gl.uniform4fv(u.flatColor,[.9,.94,.94,.23]);
      const wires=gridLines(item.p,n,pad);
      prepareBuffer(gl,state,wires);
      gl.drawArrays(gl.LINES,0,wires.length/5);
      gl.uniform4fv(u.flatColor,[.94,.73,.43,.65]);
      const border=gridLines(item.p,n,pad,true);
      prepareBuffer(gl,state,border);
      gl.drawArrays(gl.LINES,0,border.length/5);
    }
    gl.uniform1f(u.depthBias,0);
  }
  gl.depthMask(true);
  return true;
}

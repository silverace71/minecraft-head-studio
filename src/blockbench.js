import { FACES, paddingFor, validateProject, offsets } from './model.js';
import { renderFace } from './render.js';

const directions={ front:'north',back:'south',left:'west',right:'east',top:'up',bottom:'down' };
function uuid(){
  if(typeof crypto!=='undefined' && typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=new Uint8Array(16);
  if(typeof crypto!=='undefined' && typeof crypto.getRandomValues==='function')crypto.getRandomValues(bytes);
  else for(let i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
/** Blockbench 5.x free-model export with PNG atlases embedded and an exact
 * Head Studio round-trip payload. Normal cubes are editable in Blockbench.
 * Motion logic and extension placements are preserved in the payload only. */
export function blockbenchExport(project) {
  validateProject(project);
  const n=project.resolution,pad=paddingFor(n),textures=[],elements=[],outliner=[];
  const scaling=16/project.headSizeMm, off=offsets(project);
  for(const layer of project.layers) {
    if(!layer.visible)continue;
    const atlas=document.createElement('canvas');atlas.width=n*3;atlas.height=n*2;
    const ctx=atlas.getContext('2d');ctx.imageSmoothingEnabled=false;
    for(let i=0;i<FACES.length;i++) {
      const face=FACES[i];const tex=renderFace(project,face,{layerId:layer.id,cell:8});
      ctx.drawImage(tex,pad*8,pad*8,n*8,n*8,(i%3)*n,Math.floor(i/3)*n,n,n);
    }
    const textureUUID=uuid();
    textures.push({name:`${layer.name.replace(/[^\w .-]/g,'_')}.png`,id:String(textures.length),uuid:textureUUID,source:atlas.toDataURL('image/png'),uv_width:n*3,uv_height:n*2});
    const h=Math.max(.05,(project.headSizeMm+off[layer.id]*2)*scaling/2), faces={};
    for(let i=0;i<FACES.length;i++){
      const f=FACES[i],x=(i%3)*n,y=Math.floor(i/3)*n;
      faces[directions[f]]={uv:[x,y,x+n,y+n],texture:textureUUID};
    }
    const elem={name:layer.name,type:'cube',uuid:uuid(),from:[-h,-h,-h],to:[h,h,h],origin:[0,0,0],rotation:[0,0,0],faces};
    elements.push(elem);outliner.push(elem.uuid);
  }
  if(project.ears?.enabled) {
    const e=project.ears, ew=e.widthMm*scaling,eh=e.heightMm*scaling,ed=e.depthMm*scaling,vertical=Number(e.vertical||0)*8,forward=Number(e.forwardMm||0)*scaling;
    const atlas=document.createElement('canvas');atlas.width=atlas.height=8;
    const ctx=atlas.getContext('2d');ctx.fillStyle=e.color;ctx.fillRect(0,0,8,8);
    const textureUUID=uuid();textures.push({name:'ears.png',id:String(textures.length),uuid:textureUUID,source:atlas.toDataURL('image/png'),uv_width:8,uv_height:8});
    for(const side of [-1,1]) {
      const cx=side*(8+ew/2), from=[cx-ew/2,vertical-eh/2,forward-ed/2],to=[cx+ew/2,vertical+eh/2,forward+ed/2];
      const faces=Object.fromEntries(Object.values(directions).map(d=>[d,{uv:[0,0,8,8],texture:textureUUID}]));
      const elem={name:side<0?'Left ear':'Right ear',type:'cube',uuid:uuid(),from,to,origin:[cx,vertical,forward],rotation:[0,0,0],faces};
      elements.push(elem);outliner.push(elem.uuid);
    }
  }
  return {
    meta:{format_version:'5.0',model_format:'free',box_uv:false},
    name:project.name,model_identifier:'headstudio',
    resolution:{width:n*3,height:n*2},textures,elements,outliner,groups:[],
    headstudio_project:structuredClone(project),
    headstudio_notice:'Edit geometry/textures in Blockbench. Re-import into Head Studio restores its embedded project; external Blockbench edits are not reverse-converted.'
  };
}
export function blockbenchImport(text) {
  const doc=JSON.parse(text);
  if (!doc?.meta || !Array.isArray(doc.elements))throw Error('Not a Blockbench model');
  if (!doc.headstudio_project)throw Error('Only Head Studio-exported .bbmodel files can be re-imported at present; arbitrary Blockbench geometry is not yet supported.');
  return validateProject(doc.headstudio_project);
}

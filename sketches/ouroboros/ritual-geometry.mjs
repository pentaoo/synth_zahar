import {TAU,ATLAS,HEAD_UNITS,MOUTH_UNITS,bodyPoint,presentation,project,unproject,grid} from './body-geometry.mjs?v=chains-5';
import {CREATURES,PHRASE_BEATS} from './ritual-model.mjs';
import {clamp,angleDelta} from './score.mjs';
export const mobileLayout=(w,h)=>w<700||(h<520&&w<1000);
// On desktop the three rings, heads included, fit the middle three grid columns.
export function ritualSize(w,h){return mobileLayout(w,h)?Math.max(76,Math.min(w*.37,h*.31)):Math.max(90,Math.min(grid(w).span(3)/2.3,h*.385,410));}
export function pairCreatures(ring,lead=0,skins={},lengths=PHRASE_BEATS){
  const total=lengths.reduce((a,b)=>a+b,0),order=[lead,1-lead];let fraction=0;
  return order.map(part=>{
    const c=CREATURES[ring.index*2+part],skin=skins[c.id]||ATLAS,nextSkin=skins[CREATURES[ring.index*2+1-part].id]||ATLAS;
    const bodyHeight=skin.bottom-skin.top,headUnits=skin.neck/bodyHeight*skin.width/skin.height;
    const mouth=(nextSkin.neck-nextSkin.gullet)/(nextSkin.bottom-nextSkin.top)*nextSkin.width/nextSkin.height;
    const share=lengths[part]/total,offset=fraction*TAU*ring.radius;
    const own={...ring,...c,offset,headUnits,skin,
      length:Math.max(0,TAU*ring.radius*share-mouth*ring.thickness),
      fullLength:TAU*ring.baseRadius*ring.ratio*share-mouth*ring.baseWidth,
      tileLength:ring.baseWidth*(skin.end-skin.neck)/bodyHeight*skin.width/skin.height};
    fraction+=share;return own;
  });
}
// A ring is a chain of N snakes; each takes its share of the circle. The
// lead snake starts at the ring head. Weights let a new snake grow in and a
// removed one leave a closing gap instead of making the others jump.
export function chainShares(snakes,weights){
  const w=snakes.map(s=>Math.max(0,weights?.[s.uid]??1)),total=w.reduce((a,b)=>a+b,0)||1;
  let sum=0;return snakes.map((s,i)=>{const share=w[i]/total,start=sum;sum+=share;return {uid:s.uid,start,share};});
}
// stretch 0..1: in flight a pinched snake grows back to its full material
// length instead of showing the part it had swallowed as a cut tail.
export function chainCreatures(ring,snakes,lead=0,skins={},weights=null,stretch=0){
  const n=snakes.length;if(!n)return [];
  const shares=chainShares(snakes,weights),order=[...Array(n).keys()].map(k=>(k+lead)%n);let fraction=0;
  return order.map((index,k)=>{
    const snake=snakes[index],skin=skins[snake.id]||ATLAS,nextSkin=skins[snakes[order[(k+1)%n]].id]||ATLAS;
    const bodyHeight=skin.bottom-skin.top,headUnits=skin.neck/bodyHeight*skin.width/skin.height;
    const mouth=n>1||!snake.ghost?(nextSkin.neck-nextSkin.gullet)/(nextSkin.bottom-nextSkin.top)*nextSkin.width/nextSkin.height:0;
    const radius=ring.radius+((ring.baseRadius*ring.ratio||ring.radius)-ring.radius)*Math.max(0,Math.min(1,stretch));
    const share=shares[index].share,offset=fraction*TAU*radius;fraction+=share;
    return {...ring,id:snake.id,uid:snake.uid,channel:ring.index,part:index,name:snake.name,cells:snake.cells,ghost:!!snake.ghost,share,offset,headUnits,skin,
      length:Math.max(0,TAU*radius*share-mouth*ring.thickness),
      fullLength:TAU*ring.baseRadius*ring.ratio*share-mouth*ring.baseWidth,
      tileLength:ring.baseWidth*(skin.end-skin.neck)/bodyHeight*skin.width/skin.height};
  });
}
export function creaturePoint(creature,s,path=0){return bodyPoint(creature,creature.offset+s,path);}
export function sampleCreature(creature,path,segments,buffer){for(let i=0;i<=segments;i++){const s=creature.length*i/segments,p=creaturePoint(creature,s,path),k=i*5;buffer[k]=p.x;buffer[k+1]=p.y;buffer[k+2]=p.tx;buffer[k+3]=p.ty;buffer[k+4]=s;}return buffer;}
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export function ritualPresentation(w,h,base,ring,state){
  const layout=presentation(w,h,base,ring,state);
  if(!mobileLayout(w,h))return {...layout,mobile:false};
  const p=state.progress,closing=!!layout.closing,overview={scale:1,rotation:0,tx:w/2,ty:h*.45};
  const miniSize=Math.min(146,Math.max(92,h*.19)),mini={x:(w-miniSize)/2,y:8+(state.safeTop||0),size:miniSize};
  const move=closing?smooth((p-.5)/.15):smooth((p-.33)/.2),miniScale=miniSize/(base*2.5);
  const remaining={scale:1+(miniScale-1)*move,rotation:0,tx:w/2,ty:overview.ty+(mini.y+miniSize/2-overview.ty)*move};
  const skinWidth=clamp(w*.21,68,96),zoom=skinWidth/Math.max(1,ring.baseWidth);
  const focus={scale:zoom,rotation:0,tx:w/2,ty:h*.77+ring.radius*zoom+(state.spelling&&h<520?35:0)};
  let view=(closing?p>.65:p>=.54)?focus:overview,path=layout.path,angle=layout.angle;const H=ring.thickness*(ring.headUnits??HEAD_UNITS);
  if(layout.stage==='arrive'){const clear=w/zoom+ring.thickness*4;path={kind:'arrive',distance:-clear+smooth((p-.54)/.40)*(clear+TAU*ring.radius+H)};}
  if(layout.stage==='return-depart'){const clear=Math.hypot(w,h)/zoom+ring.thickness*4;path={...path,distance:((1-p)/.35)**3*(Math.max(ring.length,ring.fullLength||0)+H+clear)};}
  // Keep the leading eye in the large bottom arc when the camera settles.
  if(!closing&&p>=.94)angle=-Math.PI/2+angleDelta(state.focusAngle,-Math.PI/2)*smooth((p-.94)/.06);
  return {...layout,overview,remaining,view,path,angle,mini,move,mobile:true};
}
export function hitCreature(point,creatures,view,path=0){
  const p=unproject(point,view);let best=null;
  for(const c of creatures){let previous=creaturePoint(c,0,path);for(let j=1;j<=96;j++){
    const next=creaturePoint(c,c.length*j/96,path),dx=next.x-previous.x,dy=next.y-previous.y;
    const f=clamp(((p.x-previous.x)*dx+(p.y-previous.y)*dy)/(dx*dx+dy*dy||1),0,1),distance=Math.hypot(p.x-previous.x-dx*f,p.y-previous.y-dy*f);
    if(distance<c.thickness*.58+4/view.scale&&(!best||distance<best.distance))best={channel:c.channel,phraseId:c.uid||c.id,uid:c.uid||c.id,part:c.part,s:c.offset+c.length*(j-1+f)/96,angle:Math.atan2(p.y,p.x),ring:c,distance};previous=next;
  }}return best;
}
export function eyePoint(c,path=0){const s=(c.skin.eye[0]-c.skin.neck)/(c.skin.bottom-c.skin.top)*c.skin.width/c.skin.height*c.thickness,p=creaturePoint(c,s,path),y=(c.skin.eye[1]-c.skin.center)/(c.skin.bottom-c.skin.top)*c.thickness;return {x:p.x+p.ty*y,y:p.y-p.tx*y};}

import {clamp,wrap,angleDelta} from './score.mjs';
export const TAU=Math.PI*2;
export const RINGS=Object.freeze([
  {name:'Бас',ratio:1,width:.125,angle:.18},
  {name:'Напев',ratio:.64,width:.080,angle:-1.76},
  {name:'Барабаны',ratio:.35,width:.044,angle:.30}
]);
// Measured on the unedited 2172 × 724 atlas. Head and skin share its x=.4
// cross-section: no separate image, seam, vertical correction or tail bridge.
export const ATLAS=Object.freeze({width:2172,height:724,neck:.4,end:.98,top:220/724,bottom:516/724,center:368/724,gullet:.16});
export const HEAD_UNITS=ATLAS.neck*ATLAS.width/296;
export const MOUTH_UNITS=(ATLAS.neck-ATLAS.gullet)*ATLAS.width/296;
export function sceneSize(width,height){return Math.max(90,Math.min(width*.275,height*.385,410));}
export function ringMetrics(index,baseRadius,compression=1,phase=0,finale=0){
  const spec=RINGS[index],finish=clamp(finale,0,1);
  const finalWidth=finish<.73?1:(1-finish)/.27;
  const thickness=baseRadius*spec.width*Math.max(0,finalWidth);
  const radius=baseRadius*spec.ratio*compression*(1-finish);
  const fullLength=TAU*baseRadius*spec.ratio-baseRadius*spec.width*MOUTH_UNITS;
  const length=Math.max(0,TAU*radius-thickness*MOUTH_UNITS);
  return {index,name:spec.name,radius,thickness,fullLength,length,swallowed:Math.max(0,fullLength-length),headAngle:spec.angle+phase*TAU,tileLength:baseRadius*spec.width*(ATLAS.end-ATLAS.neck)*ATLAS.width/296,baseWidth:baseRadius*spec.width};
}
function circle(ring,s,angle=ring.headAngle){
  const a=angle-s/Math.max(1,ring.radius);
  return {x:Math.cos(a)*ring.radius,y:Math.sin(a)*ring.radius,tx:Math.sin(a),ty:-Math.cos(a)};
}
export function bodyPoint(ring,s,path=0){
  let p;
  if(path&&typeof path==='object'){
    // The straight line is the tangent at the gate; the snake always moves
    // head first along it. The default gate is the top of the circle.
    const gate=path.gate??-Math.PI/2,H=path.headLength??ring.thickness*HEAD_UNITS;
    const top=gate===-Math.PI/2,c=top?0:Math.cos(gate),n=top?-1:Math.sin(gate),line=q=>({x:ring.radius*c+q*n,y:ring.radius*n-q*c,tx:n,ty:-c});
    if(path.kind==='depart'){
      const q=s+H-path.distance;
      p=q<0?line(q):circle(ring,q,gate);
    }else{
      const q=path.distance-s-H;
      p=q<0?line(-q):circle(ring,-q,gate);
    }
  }else p=circle(ring,s);
  return {...p,s,u:s/ring.tileLength};
}
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export function camera(width,height,baseRadius,ring,progress=0,focusRotation=0){
  const t=smooth(progress),zoom=clamp(height*.19,90,145)/Math.max(1,ring.baseWidth);
  let cx=-width*.09,cy=ring.radius*zoom+height*.15;
  // Keep controls in the white interior as compression reduces the circle.
  // Translate the camera, never stretch skin or hide print under a white card.
  const rect=controlRect(width,height),inside=ring.radius*zoom-clamp(height*.19,90,145)*.65-10;
  if(inside>Math.hypot(rect.width,rect.height)/2){
    const corners=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]];
    for(let j=0;j<30;j++)for(const [x,y] of corners){const dx=cx-x,dy=cy-y,d=Math.hypot(dx,dy);if(d>inside){cx=x+dx*inside/d;cy=y+dy*inside/d;}}
  }
  return {scale:Math.exp(Math.log(zoom)*t),rotation:focusRotation*t,tx:width/2+(cx-width/2)*t,ty:height*.51+(cy-height*.51)*t};
}
// Desktop page grid: seven columns. The rings take the middle three, the
// line and the snake settings the first two, the log of words the last two.
export function grid(width){
  const margin=clamp(width*.03,24,64),gutter=clamp(width*.016,16,32),col=Math.max(0,(width-2*margin-6*gutter)/7);
  return {margin,gutter,col,x:i=>margin+i*(col+gutter),span:n=>n*col+(n-1)*gutter};
}
export function controlRect(width,height){
  const small=width<=600,medium=width<=850;
  const h=Math.min(480,height-(small?250:160)),bottom=small?30:medium?40:48;
  if(small)return {x:28,y:height-bottom-h,width:Math.min(280,width*.7),height:h};
  const g=grid(width);return {x:g.x(0),y:height-bottom-h,width:Math.max(240,g.span(2)),height:h};
}
// Opening: the ring's snakes leave the overview head first along the tangent
// where they are, then arrive head first into the large view. Closing never
// replays that in reverse: they leave the large view head first and arrive
// head first back into the overview, landing where the music has carried them.
export function presentation(width,height,baseRadius,ring,viewState){
  const p=viewState.progress,closing=!!viewState.closing&&p>0,overview={scale:1,rotation:0,tx:width/2,ty:height*.51};
  const g=grid(width),miniSize=Math.min(230,Math.max(120,g.span(2))),mini={x:g.x(5)+(g.span(2)-miniSize)/2,y:30,size:miniSize};
  const miniScale=mini.size/(baseRadius*2.55),move=closing?smooth((p-.5)/.15):smooth((p-.33)/.2);
  const remaining={scale:1+(miniScale-1)*move,rotation:0,tx:overview.tx+(mini.x+mini.size/2-overview.tx)*move,ty:overview.ty+(mini.y+mini.size/2-overview.ty)*move};
  const focus=camera(width,height,baseRadius,ring,1),H=ring.thickness*(ring.headUnits??HEAD_UNITS),radius=Math.max(1,ring.radius);
  const span=scale=>Math.hypot(width,height)/scale+ring.thickness*4,departGate=(viewState.departAngle??ring.headAngle)+H/radius;
  let view=overview,path=0,visible=true,angle=ring.headAngle,stage='overview';
  if(!closing){
    if(p>0&&p<.40){path={kind:'depart',gate:departGate,distance:smooth(p/.40)*(Math.max(ring.length,ring.fullLength||0)+H+span(1))};stage='depart';}
    else if(p>=.40&&p<.54){visible=false;stage='transfer';}
    else if(p>=.54&&p<.94){
      view=focus;const clear=width/focus.scale+ring.thickness*4;
      path={kind:'arrive',distance:-clear+smooth((p-.54)/.40)*(clear+TAU*ring.radius+H)};stage='arrive';
    }else if(p>=.94){view=focus;angle=-Math.PI/2+angleDelta(viewState.focusAngle,-Math.PI/2)*smooth((p-.94)/.06);stage='focus';}
  }else{
    const c=1-p;
    if(c<.35){view=focus;path={kind:'depart',gate:departGate,distance:(c/.35)**3*(Math.max(ring.length,ring.fullLength||0)+H+span(focus.scale))};stage='return-depart';}
    else if(c<.5){visible=false;stage='transfer';}
    else{const clear=span(1);path={kind:'arrive',gate:viewState.arriveGate??ring.headAngle,distance:-clear+smooth((c-.5)/.5)*(clear+TAU*ring.radius+H)};stage='return';}
  }
  return {overview,remaining,view,path,visible,angle,stage,mini,miniActive:closing?p>.65:p>=.54,move,closing};
}
export function collapsePresentation(layout,pose,progress){
  const t=smooth(progress),end=layout.overview;
  const move=start=>({scale:start.scale+(1-start.scale)*t,rotation:start.rotation*(1-t),tx:start.tx+(end.tx-start.tx)*t,ty:start.ty+(end.ty-start.ty)*t});
  return {...layout,view:move(pose.view),remaining:move(pose.remaining),path:pose.path?{...pose.path,distance:pose.path.distance*(1-progress)}:0,angle:pose.angle,visible:true,miniActive:false,stage:'collapse'};
}
export function project(point,view){const c=Math.cos(view.rotation),s=Math.sin(view.rotation);return {x:view.tx+view.scale*(point.x*c-point.y*s),y:view.ty+view.scale*(point.x*s+point.y*c)};}
export function unproject(point,view){const x=(point.x-view.tx)/view.scale,y=(point.y-view.ty)/view.scale,c=Math.cos(view.rotation),s=Math.sin(view.rotation);return {x:x*c+y*s,y:-x*s+y*c};}
export function hitBody(point,rings,view,path=0,selected=-1){
  const p=unproject(point,view);let best=null;
  for(const ring of rings){
    if(selected>=0&&ring.index!==selected)continue;
    const count=160;let previous=bodyPoint(ring,0,path);
    for(let j=1;j<=count;j++){
      const next=bodyPoint(ring,ring.length*j/count,path),dx=next.x-previous.x,dy=next.y-previous.y;
      const f=clamp(((p.x-previous.x)*dx+(p.y-previous.y)*dy)/(dx*dx+dy*dy||1),0,1);
      const distance=Math.hypot(p.x-previous.x-dx*f,p.y-previous.y-dy*f);
      const allowance=ring.thickness*.58+4/view.scale;
      if(distance<allowance&&(!best||distance<best.distance))best={channel:ring.index,s:previous.s+(next.s-previous.s)*f,angle:Math.atan2(p.y,p.x),distance,ring};
      previous=next;
    }
  }
  return best;
}
export function materialDelta(next,previous,length){return wrap(next-previous+length/2,length)-length/2;}
export function sampleBody(ring,path,segments,buffer=new Float32Array((segments+1)*5)){
  for(let i=0;i<=segments;i++){
    const material=ring.length*i/segments,p=bodyPoint(ring,material,path),k=i*5;
    buffer[k]=p.x;buffer[k+1]=p.y;buffer[k+2]=p.tx;buffer[k+3]=p.ty;buffer[k+4]=material;
  }
  return buffer;
}
export class BodyIntent {
  constructor(x,y,time){this.x=x;this.y=y;this.time=time;this.dragging=false;}
  move(x,y){if(Math.hypot(x-this.x,this.y-y)>=5)this.dragging=true;return this.dragging;}
  release(time,cancelled=false){return !cancelled&&!this.dragging&&time-this.time<550?'select':'release';}
}

import {TAU,RINGS,ringMetrics,collapsePresentation,project,unproject} from './body-geometry.mjs?v=chains-5';
import {chainCreatures,chainShares,creaturePoint,sampleCreature,ritualPresentation,hitCreature,eyePoint} from './ritual-geometry.mjs?v=chains-5';
import {SPECIES,CELLS,runeFor} from './chain-model.mjs?v=chains-2';
import {angleDelta} from './score.mjs';
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const SUMMON_SECONDS=3.4,DEPART_SECONDS=1.8,ARRIVE_SECONDS=2.6,PASS_SECONDS=2.8;
const loadImage=async src=>{
  for(let attempt=0;attempt<3;attempt++){
    const im=new Image(),url=new URL(src);if(attempt)url.searchParams.set('retry',String(attempt));
    try{
      await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;im.src=url.href;});
      // Some WebKit / embedded views reject decode after a successful load.
      try{await im.decode();}catch(error){if(!im.complete||!im.naturalWidth)throw error;}
      return im;
    }catch{if(attempt===2)throw new Error('Не загрузился атлас: '+src);}
  }
};
export class EngravingRenderer {
  constructor(canvas,inkCanvas){
    this.canvas=canvas;this.inkCanvas=inkCanvas;this.ctx=inkCanvas.getContext('2d');
    this.gl=canvas.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:true});
    if(!this.gl)throw new Error('Для растровой гравюры нужен WebGL 2. Открой инструмент в актуальном Chrome.');
    this.vertices=new Float32Array(514*2*4);this.path=new Float32Array(513*5);this.headVertices=new Float32Array(65*8);this.matrix=new Float32Array(9);this.segments=384;this.width=0;this.height=0;this.ready=false;
    this.grain=this.makeGrain();
    this.orders=[[],[],[]];this.weights=new Map();this.summons=new Map();this.arrivals=new Map();this.departing=[];this.turns=[0,0,0];this.lastAngles=[null,null,null];this.runeHits=[];this.clock=0;
  }
  async initialize(){
    // Paper white at once: an alpha:false canvas shows black until its first frame.
    this.gl.clearColor(1,1,1,1);this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    const manifest=await (await fetch(new URL('./assets/ritual/skins.json?v=chains-2',import.meta.url))).json();
    this.skins=manifest;this.assets={};
    const gl=this.gl;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    const vs=shader(gl.VERTEX_SHADER,`#version 300 es
      precision highp float; in vec2 a_position; in vec2 a_uv; uniform mat3 u_view; uniform vec2 u_resolution; out vec2 v_uv;
      void main(){vec3 p=u_view*vec3(a_position,1.);gl_Position=vec4(p.x/u_resolution.x*2.-1.,1.-p.y/u_resolution.y*2.,0.,1.);v_uv=a_uv;}`);
    const fs=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float; in vec2 v_uv; uniform sampler2D u_texture; uniform float u_alpha; uniform bool u_skin; uniform vec4 u_crop; uniform vec4 u_eye; uniform vec3 u_life; uniform vec2 u_tile; out vec4 color;
      void main(){vec2 uv=v_uv;
      if(u_skin){
        // Scales always point toward the tail: the skin repeats forward and the
        // seam is a short crossfade at a measured repeat of the scale lattice, never a mirror.
        float b=u_tile.y,period=u_tile.x,tau=fract(uv.x/period)*period,w=uv.x<period?1.:clamp(tau/b,0.,1.);
        vec2 scale=vec2(u_crop.y-u_crop.x,u_crop.w-u_crop.z),gx=dFdx(uv)*scale,gy=dFdy(uv)*scale;float y=mix(u_crop.z,u_crop.w,uv.y);
        vec4 a=textureGrad(u_texture,vec2(u_crop.x+tau*scale.x,y),gx,gy),c=textureGrad(u_texture,vec2(u_crop.x+min(tau+period,.999)*scale.x,y),gx,gy);
        color=mix(c,a,w);
      }else{vec2 q=(uv-u_eye.xy)/u_eye.zw;float inside=1.-smoothstep(.72,1.,length(q));uv+=u_life.yz*u_eye.zw*.12*inside;color=texture(u_texture,uv);}
      if(!u_skin){vec2 q=(v_uv-u_eye.xy)/u_eye.zw;float inside=1.-smoothstep(.9,1.06,length(q));float cover=inside*(u_life.x>.96?1.:smoothstep(1.-u_life.x-.04,1.-u_life.x+.04,abs(q.y)));
        if(u_life.x<.001)cover=0.;
        vec4 lid=texture(u_texture,vec2(v_uv.x+u_eye.z*2.6,u_eye.y-u_eye.w*.9+q.y*u_eye.w*.7));color=mix(color,lid,cover);if(u_life.x>.96&&abs(q.y-.14*(1.-q.x*q.x))<.07&&abs(q.x)<.82)color=vec4(0.,0.,0.,1.);}
      color.rgb=vec3(dot(color.rgb,vec3(.299,.587,.114)));color.a*=u_alpha;}`);
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices.byteLength,gl.DYNAMIC_DRAW);
    for(const [name,size,offset] of [['a_position',2,0],['a_uv',2,8]]){const at=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,16,offset);}
    this.uniforms={};for(const key of ['u_view','u_resolution','u_alpha','u_skin','u_crop','u_eye','u_life','u_tile'])this.uniforms[key]=gl.getUniformLocation(this.program,key);
    const texture=image=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
    // The opening snake downloads alone and drawing starts as soon as it is in;
    // the other atlases then download together. Retain only each head's alpha.
    const first=SPECIES.find(s=>s.channel===1)||SPECIES[0],order=[first,...SPECIES.filter(s=>s!==first)];
    const load=creature=>loadImage(new URL(`./assets/ritual/${creature.id}.png?v=ritual-6`,import.meta.url)),opening=load(first);
    const images=[opening,...order.slice(1).map(creature=>opening.then(()=>load(creature)))];
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    for(const [k,creature] of order.entries()){
      const im=await images[k],mask=document.createElement('canvas');
      const maskWidth=Math.ceil(im.width*this.skins[creature.id].neck);mask.width=maskWidth;mask.height=im.height;
      const mc=mask.getContext('2d',{willReadFrequently:true});mc.drawImage(im,0,0);
      const rgba=mc.getImageData(0,0,maskWidth,im.height).data,alpha=new Uint8Array(maskWidth*im.height);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
      this.assets[creature.id]={width:im.width,height:im.height,maskWidth,alpha,texture:texture(im)};this.ready=true;
    }
  }
  makeGrain(){
    const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.fillStyle='#070707';x.fillRect(0,0,512,512);
    let seed=7219;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<18000;i++){const px=random()*512,py=random()*512,r=.25+random()*.65;x.fillStyle=i%4?'#272727':'#e9e9e9';x.beginPath();x.ellipse(px,py,r,r*.65,random()*3,0,TAU);x.fill();}
    return c;
  }
  resize(width,height,dpr){this.width=width;this.height=height;this.dpr=Math.min(2,dpr||1);for(const c of [this.canvas,this.inkCanvas]){c.width=Math.round(width*this.dpr);c.height=Math.round(height*this.dpr);}this.gl.viewport(0,0,this.canvas.width,this.canvas.height);this.gl.clearColor(1,1,1,1);this.gl.clear(this.gl.COLOR_BUFFER_BIT);this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.pattern=this.ctx.createPattern(this.grain,'repeat');}
  setCamera(view){
    this.currentView=view;const gl=this.gl,c=Math.cos(view.rotation)*view.scale,s=Math.sin(view.rotation)*view.scale;
    const m=this.matrix;m[0]=c;m[1]=s;m[2]=0;m[3]=-s;m[4]=c;m[5]=0;m[6]=view.tx;m[7]=view.ty;m[8]=1;
    gl.uniformMatrix3fv(this.uniforms.u_view,false,m);
  }
  useCreature(ring,path=0){
    const gl=this.gl,a=ring.skin,life=this.life?.find(l=>l.id===ring.uid);this.current=ring;
    gl.uniform4f(this.uniforms.u_crop,a.neck,a.end,a.top,a.bottom);gl.uniform2f(this.uniforms.u_tile,a.period||.85,a.blend||.15);gl.uniform4f(this.uniforms.u_eye,...a.eye);
    const e=creaturePoint(ring,(a.eye[0]-a.neck)/(a.bottom-a.top)*a.width/a.height*ring.thickness,path),rotation=this.currentView?.rotation||0,c=Math.cos(rotation),s=Math.sin(rotation),gx=life?.gazeX||0,gy=life?.gazeY||0;
    const tx=e.tx*c-e.ty*s,ty=e.tx*s+e.ty*c,nx=e.ty*c+e.tx*s,ny=e.ty*s-e.tx*c;
    gl.uniform3f(this.uniforms.u_life,life?.blink||0,-(gx*tx+gy*ty),-(gx*nx+gy*ny));
    gl.bindTexture(gl.TEXTURE_2D,this.assets[ring.id].texture);
  }
  body(ring,view,bend,alpha,scratch,ink,reduced,mini=false){
    if(ring.thickness<.01||ring.length<=0||alpha<=.001)return;
    const gl=this.gl,v=this.vertices,n=mini?96:this.segments,w=ring.thickness,path=sampleCreature(ring,bend,n,this.path);
    for(let j=0;j<=n;j++){
      const at=j*5,material=path[at+4],p={x:path[at],y:path[at+1],tx:path[at+2],ty:path[at+3]},angle=Math.atan2(p.y,p.x);
      const delta=Math.atan2(Math.sin(angle-scratch.angle),Math.cos(angle-scratch.angle));
      const neck=smooth(material/Math.max(1,ring.baseWidth));
      const local=Math.exp(-delta*delta/(2*.2*.2))*scratch.strength*neck;
      const tooth=.5+.5*Math.cos(material/(ring.baseWidth*.19)*TAU);
      const life=this.life?.find(l=>l.id===ring.uid),tension=life?.tension||0;
      const rise=reduced?0:(local*w*(.16+.2*tooth)+tension*w*.045*tooth*neck);
      const lean=reduced?0:local*scratch.direction*w*.12;
      const press=ring.index===2&&bend===0?ink.pressureAt(angle)*w*.22*neck:0;
      const tail=Math.max(ring.length,ring.fullLength||0)-material,taper=tail<ring.baseWidth*2.7?Math.max(.10,tail/(ring.baseWidth*2.7)):1;
      for(let side=0;side<2;side++){
        const amount=(side===0?-1:1)*w*.5*taper-(side===0?rise:0)-press;
        const k=(j*2+side)*4;v[k]=p.x+p.ty*amount+(side===0?p.tx*lean:0);v[k+1]=p.y-p.tx*amount+(side===0?p.ty*lean:0);v[k+2]=material/ring.tileLength;v[k+3]=side;
      }
    }
    this.setCamera(view);this.useCreature(ring,bend);gl.uniform1f(this.uniforms.u_alpha,alpha);gl.uniform1i(this.uniforms.u_skin,1);gl.bindTexture(gl.TEXTURE_2D,this.assets[ring.id].texture);gl.bufferSubData(gl.ARRAY_BUFFER,0,v.subarray(0,(n+1)*8));gl.drawArrays(gl.TRIANGLE_STRIP,0,(n+1)*2);

  }
  head(ring,alpha,path=0,mini=false){
    this.useCreature(ring,path);const atlas=ring.skin;
    const gl=this.gl,w=ring.thickness,v=this.headVertices,n=mini?24:64;
    for(let j=0;j<=n;j++){
      const u=j/n*atlas.neck,p=creaturePoint(ring,(j/n-1)*w*ring.headUnits,path);
      for(let side=0;side<2;side++){
        const y=(side-atlas.center)/(atlas.bottom-atlas.top)*w,k=(j*2+side)*4;
        v[k]=p.x+p.ty*y;v[k+1]=p.y-p.tx*y;v[k+2]=u;v[k+3]=side;
      }
    }
    gl.uniform1i(this.uniforms.u_skin,0);gl.uniform1f(this.uniforms.u_alpha,alpha);gl.bindTexture(gl.TEXTURE_2D,this.assets[ring.id].texture);gl.bufferSubData(gl.ARRAY_BUFFER,0,v.subarray(0,(n+1)*8));gl.drawArrays(gl.TRIANGLE_STRIP,0,(n+1)*2);
  }
  headHit(point,creatures,view,path=0){
    const p=unproject(point,view);
    for(const ring of creatures){
      const atlas=ring.skin,asset=this.assets[ring.id];if(!asset||ring.thickness<.01)continue;
      for(let j=0;j<=48;j++){
        const material=(j/48-1)*ring.thickness*ring.headUnits,a=creaturePoint(ring,material,path),dx=p.x-a.x,dy=p.y-a.y;
        const along=dx*a.tx+dy*a.ty;if(Math.abs(along)>ring.thickness*ring.headUnits/48)continue;
        const u=(material+along)/(ring.thickness*ring.headUnits)*atlas.neck+atlas.neck,v=(dx*a.ty-dy*a.tx)/ring.thickness*(atlas.bottom-atlas.top)+atlas.center;
        if(u<0||u>=atlas.neck||v<0||v>=1)continue;
        const at=Math.floor(v*asset.height)*asset.maskWidth+Math.floor(u*asset.width);
        if(asset.alpha[at]>110)return {channel:ring.channel,phraseId:ring.uid,uid:ring.uid,part:ring.part,s:ring.offset+material,angle:Math.atan2(p.y,p.x),ring,distance:0};
      }
    }return null;
  }
  hit(point){
    if(!this.ready||!this.scene||!this.scene.visible)return null;
    const {creatures,view,bend,focus,remaining}=this.scene;
    const selected=focus<0?creatures:creatures.filter(c=>c.channel===focus);
    return this.headHit(point,selected,focus<0?remaining:view,focus<0?0:bend)||hitCreature(point,selected,focus<0?remaining:view,focus<0?0:bend);
  }
  ink(ink,view,windowRadius,alpha=1){
    if(alpha<.001||windowRadius<=0)return;
    const ctx=this.ctx,c=Math.cos(view.rotation)*view.scale,s=Math.sin(view.rotation)*view.scale;
    ctx.save();ctx.transform(c,s,-s,c,view.tx,view.ty);ctx.globalAlpha=alpha;
    ctx.beginPath();ctx.arc(0,0,windowRadius,0,TAU);ctx.clip();
    const p=ink.points,n=ink.count;ctx.beginPath();ctx.moveTo((p[0]+p[(n-1)*2])/2,(p[1]+p[(n-1)*2+1])/2);
    for(let i=0;i<n;i++){const next=(i+1)%n;ctx.quadraticCurveTo(p[i*2],p[i*2+1],(p[i*2]+p[next*2])/2,(p[i*2+1]+p[next*2+1])/2);}ctx.closePath();ctx.fillStyle=this.pattern;ctx.fill();
    for(const d of ink.droplets){ctx.beginPath();ctx.ellipse(d.x,d.y,d.r,d.r*.82,Math.atan2(d.vy,d.vx),0,TAU);ctx.fill();}
    ctx.restore();
  }
  // A summoned snake flies straight in along the tangent, head first, and coils into its ring.
  summon(channel,uid,created){
    this.awaiting=false;
    this.weights.set(uid,{w:created?1:0,target:1});
    if(created)this.summons.set(channel,{start:this.clock,uid});else this.arrivals.set(uid,{start:this.clock,channel});
  }
  // Before it coils in, a called snake passes close by on the left: the huge head
  // rises from the bottom edge, stops for a breath, flies up and pulls its body
  // and tail after it. A camera on the straight line, turned so the line is vertical.
  pass(ring,gate,H,length,t){
    const {width,height}=this,scale=Math.min(width*(width<700?.42:.24),height*.34)/Math.max(1,ring.thickness),half=height/2/scale;
    const sin=Math.sin(gate),cos=Math.cos(gate),q0=length+2*half+4*H,F={x:ring.radius*cos+q0*sin,y:ring.radius*sin-q0*cos};
    const rotation=-Math.PI-gate,rc=Math.cos(rotation),rs=Math.sin(rotation),x=width*(width<700?.3:.2);
    const camera={scale,rotation,tx:x-scale*(F.x*rc-F.y*rs),ty:height/2-scale*(F.x*rs+F.y*rc)};
    const start=q0+half+1.5*H,stop=q0+half*.8,end=q0-half-length-1.5*H;
    const head=t<.42?start+(stop-start)*(1-(1-t/.42)**3):stop+(end-stop)*((t-.42)/.58)**2.2;
    return {camera,path:{kind:'arrive',gate,headLength:H,distance:H-head}};
  }
  // A new round: its first snakes stay hidden until they are summoned in.
  awaitSummons(){this.awaiting=true;this.weights.clear();this.orders=[[],[],[]];this.summons.clear();this.arrivals.clear();this.departing=[];}
  // A removed snake leaves forward along the tangent at its own head.
  release(uid){
    const c=this.scene?.creatures.find(c=>c.uid===uid);const w=this.weights.get(uid);if(w)w.target=0;
    if(!c)return;const camera=this.scene.focus===c.channel?this.scene.view:this.scene.remaining;
    const own={...c,offset:0,headAngle:c.headAngle-c.offset/Math.max(1,c.radius)};
    this.departing.push({creature:own,camera:{...camera},start:this.clock,gate:own.headAngle+own.thickness*own.headUnits/Math.max(1,own.radius)});
  }
  layoutChains(chains,dt){
    for(let i=0;i<3;i++){
      const live=chains[i]||[],ids=new Set(live.map(s=>s.uid)),next=[],had=this.orders[i].some(e=>!e.ghost);
      for(const e of this.orders[i]){
        const now=live.find(s=>s.uid===e.uid);
        if(now)next.push(now);else{const w=this.weights.get(e.uid);if(w&&w.w>.002){w.target=0;next.push({...e,ghost:true});}}
      }
      for(const s of live)if(!next.some(e=>e.uid===s.uid)){next.push(s);if(!this.weights.has(s.uid))this.weights.set(s.uid,this.awaiting?{w:0,target:0}:{w:had?0:1,target:1});}
      this.orders[i]=next.filter(e=>!e.ghost||ids.has(e.uid)||(this.weights.get(e.uid)?.w||0)>.002);
    }
    const k=1-Math.exp(-dt/.35),known=new Set(this.orders.flat().map(e=>e.uid)),weights={};
    for(const [uid,w] of this.weights){if(!known.has(uid)){this.weights.delete(uid);continue;}w.w+=(w.target-w.w)*k;if(Math.abs(w.target-w.w)<.001)w.w=w.target;weights[uid]=w.w;}
    return weights;
  }
  // The angle follows the snake now sounding: its share of the circle passes the reading point.
  naturalAngle(index,clock,weights){
    const spec=RINGS[index];if(!clock||!clock.segments)return spec.angle;
    const position=clock.phase*clock.segments,segment=Math.min(clock.segments-1,Math.floor(position)),frac=position-segment;
    const shares=chainShares(this.orders[index],weights),entry=shares.find(e=>e.uid===clock.uids?.[segment]);
    return spec.angle+TAU*(entry?entry.start+entry.share*frac:clock.phase);
  }
  // How far a flying chain has grown back to its full length (the pinch swallows material).
  stretchFor(path,ring){
    if(!path||typeof path!=='object')return 0;const H=ring.thickness*(ring.headUnits||1);
    if(path.kind==='depart')return smooth(path.distance/H);
    const final=path.final??TAU*ring.radius+H;return smooth((final-path.distance)/H);
  }
  // The inscription sits still inside the ring's visible arc, read left to right,
  // while the snake keeps moving with the record. One rune per beat.
  runes(c,view,{active=-1,audible=null,mini=false,avoid=[]}={}){
    this.runeHits=[];if(mini||!c||c.thickness<.5||!c.cells)return;
    const x=this.ctx,size=Math.max(22,Math.min(32,c.thickness*view.scale*.36)),inner=c.radius-c.thickness*.5-size*1.25/view.scale;
    // Centre the inscription where the ring passes nearest a calm spot of the screen.
    const mobile=this.width<700,target=mobile?{x:this.width/2,y:this.height*.9}:{x:this.width*.62,y:this.height*.4};
    const spacing=Math.min(mobile?(this.width-48)/CELLS:64,Math.max(40,size*2.3))/view.scale/Math.max(1,inner);
    const local={x:(target.x-view.tx)/view.scale,y:(target.y-view.ty)/view.scale},turn=view.rotation,centre=Math.atan2(local.y*Math.cos(turn)-local.x*Math.sin(turn),local.x*Math.cos(turn)+local.y*Math.sin(turn));
    // Slide the inscription along the arc until no rune lands on the line, the panels or the screen edge.
    // Inside the arc first, then outside it; otherwise the place with the fewest collisions.
    const outer=c.radius+c.thickness*.5+size*1.25/view.scale;
    const place=(a,radius)=>[...Array(CELLS).keys()].map(k=>{const angle=a+(k-(CELLS-1)/2)*spacing*inner/radius;return project({x:Math.cos(angle)*radius,y:Math.sin(angle)*radius},view);});
    const hits=points=>points.filter(q=>!(q.x>size&&q.x<this.width-size&&q.y>size&&q.y<this.height-size*1.6)||avoid.some(r=>q.x>r.x-size&&q.x<r.x+r.w+size&&q.y>r.y-size*1.7&&q.y<r.y+r.h+size)).length;
    let points=place(centre,inner),best=hits(points);
    search:for(const radius of [inner,outer])for(let step=0;step<=200&&best>0;step++)for(const sign of [1,-1]){
      const candidate=place(centre+sign*step*.015,radius),n=hits(candidate);if(n<best){best=n;points=candidate;if(!n)break search;}
    }
    x.save();x.fillStyle='#000';x.strokeStyle='#000';x.textAlign='center';x.textBaseline='middle';
    for(let k=0;k<CELLS;k++){
      const at=points[k];
      const cell=c.cells[k],pending=audible&&audible[k]!==cell;
      x.font=size+'px "Noto Sans Runic","Segoe UI Historic","Apple Symbols",Georgia,serif';
      if(k===active){x.beginPath();x.arc(at.x,at.y,size*.75,0,TAU);x.lineWidth=1.2;x.stroke();}
      x.lineWidth=1;if(pending)x.strokeText(runeFor(c.channel,cell),at.x,at.y);else x.fillText(runeFor(c.channel,cell),at.x,at.y);
      x.font=Math.round(size*.45)+'px Georgia,serif';x.fillText(c.channel===2?['','н','р','с'][Number(cell)]||'·':cell==='x'?'к':cell,at.x,at.y+size*1.05);
      this.runeHits.push({x:at.x,y:at.y,r:size*.85,uid:c.uid,index:k});
    }
    x.restore();
  }
  hitRune(point){for(const h of this.runeHits)if(Math.hypot(point.x-h.x,point.y-h.y)<h.r)return h;return null;}
  render({avoid=[],baseRadius,compression,chains=[[],[],[]],clocks=[],rates=[0,0,0],selectedUid='',audible=null,viewState,ink,scratch,life=[],finale=0,finalePose=null,reduced=false,dt=.016}){
    if(!this.ready)return;this.life=life;this.clock+=dt;
    const gl=this.gl,{width,height}=this,p=viewState.progress,weights=this.layoutChains(chains,reduced?1e3:dt);
    const rings=RINGS.map((spec,i)=>{const natural=this.naturalAngle(i,clocks[i],weights),ring={...ringMetrics(i,baseRadius,compression,0,finale),baseRadius,ratio:spec.ratio};ring.headAngle=natural;
      // An unwrapped angle for the live large view.
      if(this.lastAngles[i]!==null)this.turns[i]+=angleDelta(natural,this.lastAngles[i]);this.lastAngles[i]=natural;return ring;});
    const sel=viewState.selected,selectedRing=rings[sel],order=this.orders[sel],lead=Math.max(0,order.findIndex(e=>e.uid===(viewState.leadUid||selectedUid)&&!e.ghost));
    const shares=chainShares(order,weights);selectedRing.headAngle-=TAU*(shares[lead]?.start||0);
    const leadSkin=this.skins[order[lead]?.id]||this.skins[SPECIES[1].id];selectedRing.headUnits=leadSkin.neck/(leadSkin.bottom-leadSkin.top)*leadSkin.width/leadSkin.height;
    if(!viewState.closing&&p>0&&p<.40&&viewState.departAngle==null)viewState.departAngle=selectedRing.headAngle;
    if(viewState.closing)viewState.arriveGate=selectedRing.headAngle+(rates[sel]||0)*p*2.8;
    let layout=ritualPresentation(width,height,baseRadius,selectedRing,viewState);
    if(finalePose)layout=collapsePresentation(layout,finalePose,finale);
    const {view,overview,remaining,mini}=layout;let bend=layout.path;
    if(p===1&&!finalePose){
      if(!viewState.live){viewState.turnAnchor=this.turns[sel];viewState.angleAnchor=viewState.focusAngle;viewState.live=true;}
      selectedRing.headAngle=viewState.angleAnchor+(this.turns[sel]-viewState.turnAnchor);
    }else selectedRing.headAngle=layout.angle;
    viewState.displayAngle=selectedRing.headAngle;
    const all=rings.flatMap(r=>chainCreatures(r,this.orders[r.index],r.index===sel?lead:0,this.skins,weights)),creatures=all.filter(c=>!c.ghost&&c.length>.5);
    const focusOn=p>0,stretch=focusOn&&bend?this.stretchFor(bend,selectedRing):0;
    const chosen=stretch>0?chainCreatures(selectedRing,order,lead,this.skins,weights,stretch).filter(c=>!c.ghost&&c.length>.5):creatures.filter(c=>c.channel===sel);
    let others=creatures.filter(c=>!focusOn||c.channel!==sel);if(!focusOn)bend=0;
    if(bend&&chosen[0])bend={...bend,headLength:chosen[0].thickness*chosen[0].headUnits};
    // Summon flights: on the overview camera, like the return from the large view.
    const flights=[];
    for(const [channel,summon] of this.summons){
      const age=this.clock-summon.start,t=reduced?1:(age-PASS_SECONDS)/SUMMON_SECONDS;
      if(t>=1||!rings[channel].thickness||(focusOn&&channel===sel)||finalePose){this.summons.delete(channel);continue;}
      const ring=rings[channel],group=others.filter(c=>c.channel===channel);if(!group.length)continue;
      const H=group[0].thickness*group[0].headUnits;
      if(t<0){
        const pass=this.pass(ring,ring.headAngle,H,Math.max(ring.length,ring.fullLength||0),age/PASS_SECONDS);
        flights.push({group:chainCreatures(ring,this.orders[channel],0,this.skins,weights,1).filter(c=>!c.ghost&&c.length>.5),...pass});others=others.filter(c=>c.channel!==channel);continue;
      }
      const gate=ring.headAngle+(rates[channel]||0)*Math.max(0,.84-t)*SUMMON_SECONDS;
      const camera=focusOn?remaining:overview,clear=Math.hypot(width,height)/camera.scale+ring.thickness*4;
      const path=t<.84?{kind:'arrive',gate,headLength:H,distance:-clear+smooth(t/.84)*(clear+TAU*ring.radius+H)}:0;
      flights.push({group:path?chainCreatures(ring,this.orders[channel],0,this.skins,weights,this.stretchFor(path,ring)).filter(c=>!c.ghost&&c.length>.5):group,camera,path});others=others.filter(c=>c.channel!==channel);
    }
    // A snake joining a ring that already sounds flies in head first and coils into the gap opening for it.
    const joining=[];
    for(const [uid,a] of this.arrivals){
      const age=this.clock-a.start,t=reduced?1:(age-PASS_SECONDS)/ARRIVE_SECONDS,c=creatures.find(c=>c.uid===uid);
      if(t>=1||!c||finalePose){this.arrivals.delete(uid);continue;}
      const inFocus=focusOn&&c.channel===sel;if(inFocus&&!layout.visible)continue;
      const camera=inFocus?view:remaining,r=Math.max(1,c.radius),H=c.thickness*c.headUnits,own={...c,offset:0,headAngle:c.headAngle-c.offset/r};
      if(t<0){
        own.length=Math.max(c.length,c.fullLength||0);
        joining.push({creature:own,...this.pass(rings[c.channel],own.headAngle,H,own.length,age/PASS_SECONDS)});others=others.filter(o=>o.uid!==uid);continue;
      }
      const landing=own.headAngle+(rates[c.channel]||0)*(1-t)*ARRIVE_SECONDS-c.length/r,clear=Math.hypot(width,height)/camera.scale+c.thickness*4;
      const final=c.length+H,distance=-clear+smooth(t)*(clear+final),grow=smooth((final-distance)/H);own.length=c.length+Math.max(0,c.fullLength-c.length)*grow;
      joining.push({creature:own,camera,path:{kind:'arrive',gate:landing,headLength:H,distance,final}});
      others=others.filter(o=>o.uid!==uid);
    }
    const chosenDrawn=chosen.filter(c=>!joining.some(j=>j.creature.uid===c.uid));
    gl.disable(gl.SCISSOR_TEST);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);gl.uniform2f(this.uniforms.u_resolution,width,height);this.ctx.clearRect(0,0,width,height);
    const draw=(group,camera,path,small=false)=>{group=group.filter(c=>this.assets[c.id]);for(const c of group)this.body(c,camera,path,1,scratch,ink,reduced,small);this.setCamera(camera);for(const c of group)this.head(c,1,path,small);};
    if(focusOn&&layout.visible)draw(chosenDrawn,view,bend);
    draw(others,remaining,0,p>.54);
    for(const f of flights)draw(f.group,f.camera,f.path);
    for(const j of joining)draw([j.creature],j.camera,j.path);
    this.departing=this.departing.filter(d=>{
      const t=reduced?1:(this.clock-d.start)/DEPART_SECONDS;if(t>=1)return false;const c={...d.creature},H=c.thickness*c.headUnits;c.length+=Math.max(0,c.fullLength-c.length)*smooth(t*8);
      draw([c],d.camera,{kind:'depart',gate:d.gate,headLength:H,distance:smooth(t)*(c.length+H+Math.hypot(width,height)/d.camera.scale+c.thickness*4)});return true;
    });
    const windowRadius=Math.max(0,rings[2].radius-rings[2].thickness*.65);this.ink(ink,remaining,windowRadius,1);
    if(layout.mobile&&p>=.54){
      // The mobile miniature includes the selected ring, without a second audio source.
      const miniRing={...selectedRing,headAngle:rings[sel].headAngle+TAU*(shares[lead]?.start||0)};
      if(viewState.live||p<1)miniRing.headAngle=this.naturalAngle(sel,clocks[sel],weights);
      draw(chainCreatures(miniRing,order,0,this.skins,weights).filter(c=>!c.ghost&&c.length>.5),remaining,0,true);
    }
    this.runeHits=[];
    const marked=chosen.find(c=>c.uid===selectedUid)||chosen[0];
    if(p===1&&!finalePose&&marked){
      const c=marked,clock=clocks[sel];let active=-1;
      if(clock?.segments){const position=clock.phase*clock.segments,segment=Math.min(clock.segments-1,Math.floor(position));if(clock.uids?.[segment]===c.uid)active=Math.min(CELLS-1,Math.floor((position-segment)*CELLS));}
      this.runes(c,view,{active,audible:audible?.[c.uid]||null,avoid});
    }
    const eyes={};for(const c of creatures){const camera=focusOn&&c.channel===sel?view:remaining;eyes[c.uid]=project(eyePoint(c,focusOn&&c.channel===sel?bend:0),camera);}
    this.scene={rings,creatures,eyes,view,bend,focus:focusOn?sel:-1,overview,remaining,windowRadius,mini,miniActive:layout.miniActive,visible:layout.visible,stage:layout.stage,mobile:layout.mobile,lead,flying:flights.length>0||joining.length>0||this.departing.length>0};return this.scene;
  }
}

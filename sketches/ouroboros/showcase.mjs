// Showcase: the overview with every ring full (four snakes each), turning
// clockwise with no interface. The abyss breathes to a pulse drawn from the
// snakes' own phrases, so it moves as it does on the site while music plays.
// ?manual  — no clock of its own: call showcase.step(dt) per frame (for recording).
// ?size=.42 — outer ring radius as a share of the shorter screen side.
import {TAU,ringMetrics} from './body-geometry.mjs?v=chains-6';
import {EngravingRenderer} from './engraving-renderer.mjs?v=chains-12';
import {Chains,SPECIES,CELLS,MAX_SNAKES} from './chain-model.mjs?v=chains-2';
import {BPM} from './folk-score.mjs?v=ritual-10';
import {InkMass} from './ink-physics.mjs?v=chains-2';
import {CreatureLife} from './creature-state.mjs?v=chains-2';
import {ViewState} from './view-state.mjs?v=chains-2';

const params=new URLSearchParams(location.search),manual=params.has('manual'),size=Number(params.get('size'))||.42;
const canvas=document.getElementById('canvas'),inkCanvas=document.getElementById('ink-canvas');
const renderer=new EngravingRenderer(canvas,inkCanvas),ink=new InkMass(),life=new CreatureLife(),view=new ViewState();
// The fullest set: each ring holds MAX_SNAKES, its two species taking turns.
const chains=new Chains([]);
for(let ring=0;ring<3;ring++){const kinds=SPECIES.filter(s=>s.channel===ring);for(let k=0;k<MAX_SNAKES;k++)chains.summon(kinds[k%kinds.length].id);}
const beat=60/BPM,ringSeconds=chains.rings.map(r=>r.length*CELLS*beat);
let width=0,height=0,baseRadius=100,time=0,eyes={};
const waveform=new Float32Array(1024),features={low:0,high:0,centroid:0,melody:0,drums:0,voice:0,waveform};
function resize(){
  width=innerWidth;height=innerHeight;baseRadius=Math.min(width,height)*size;
  renderer.resize(width,height,Number(params.get('dpr'))||devicePixelRatio||1);ink.resize(baseRadius);
}
// The cell each ring is sounding now, from its own clock.
function sounding(t){
  return chains.rings.map((ring,i)=>{const phase=t/ringSeconds[i]%1,position=phase*ring.length,k=Math.floor(position),cell=Math.floor((position-k)*CELLS);return {snake:ring[k],cell,frac:(position-k)*CELLS-cell};});
}
function listen(t,now){
  const [bass,pipe,drums]=now,hit=(c,amount)=>amount*Math.exp(-c.frac*5);
  const bassCell=bass.snake.cells[bass.cell],drumCell=drums.snake.cells[drums.cell],pipeCell=pipe.snake.cells[pipe.cell];
  features.low=bassCell==='·'||bassCell==='-'?features.low*.9:hit(bass,.75);
  features.drums=hit(drums,{'1':.8,'2':.5,'3':.32}[drumCell]||0);
  features.melody=pipeCell==='·'?.12:.38+.06*Math.sin(TAU*t/beat/2);
  features.centroid=.2+.12*Number(pipeCell==='x'||pipeCell==='·'||pipeCell==='-'?1:pipeCell)/8;
  features.high=.12+.25*features.drums;
  // The recitative from the abyss: three beats of speech every sixteen.
  const bar=t/beat%16;features.voice=bar<3?(.35+.35*Math.abs(Math.sin(t*11)))*Math.sin(Math.PI*bar/3):0;
  for(let i=0;i<waveform.length;i++)waveform[i]=Math.sin(i*.07+t*9)*.5+Math.sin(i*.19-t*5)*.3;
}
function step(dt){
  time+=dt;const now=sounding(time);listen(time,now);
  const inner=ringMetrics(2,baseRadius,1);ink.update(dt,features,Math.max(0,inner.radius-inner.thickness*.65),true,false);
  // A slow point the snakes keep their eyes on, circling the abyss.
  const pointer={x:width/2+Math.cos(time*.21)*baseRadius*.7,y:height*.51+Math.sin(time*.17)*baseRadius*.5};
  const clocks=chains.rings.map((ring,i)=>({phase:time/ringSeconds[i]%1,segments:ring.length,uids:ring.map(s=>s.uid),seconds:ringSeconds[i]}));
  const states=life.update(time,dt,{snakes:chains.all.map(s=>s.uid),active:new Set(now.map(n=>n.snake.uid)),playing:true,pointer,eyes});
  const scene=renderer.render({dt,life:states,baseRadius,compression:1,chains:chains.rings,clocks,rates:ringSeconds.map(s=>TAU/s),viewState:view,ink,scratch:{angle:0,strength:0,direction:0}});
  if(scene)eyes=scene.eyes;
}
addEventListener('resize',resize);resize();
const ready=renderer.initialize().then(async()=>{await document.fonts?.ready;return {seconds:ringSeconds[0]};});
window.showcase={ready,step,loopSeconds:ringSeconds[0]};
if(!manual)ready.then(()=>{let last=performance.now();const frame=t=>{step(Math.min(.05,(t-last)/1000));last=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);});

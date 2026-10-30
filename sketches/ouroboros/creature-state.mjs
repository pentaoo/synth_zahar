import {CREATURES,phraseAt} from './ritual-model.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Blink, gaze and tension per snake. Snakes come and go with the chains,
// so states are keyed by uid; the six fixed phrases remain the default.
export class CreatureLife {
  constructor(){this.map=new Map();this.serial=0;this.states=[];this.ensure(CREATURES.map(c=>c.id));}
  ensure(uids){
    this.states=uids.map(uid=>{let s=this.map.get(uid);if(!s){const i=this.serial++;s={id:uid,blink:0,gazeX:0,gazeY:0,tension:0,nextBlink:1.8+i*.71,blinkAt:-10,seed:717+i*389,active:false};this.map.set(uid,s);}return s;});
    for(const uid of this.map.keys())if(!uids.includes(uid))this.map.delete(uid);
    return this.states;
  }
  update(time,dt,{phase=0,playing=false,pointer={x:0,y:0},eyes={},selected='',contact='',spells,reduced=false,snakes=null,active=null}={}){
    if(snakes)this.ensure(snakes);
    for(let i=0;i<this.states.length;i++){
      const s=this.states[i];
      s.active=playing&&(active?active.has(s.id):CREATURES[i]?.part===phraseAt(phase));s.selected=s.id===selected;
      if(!reduced&&time>=s.nextBlink){s.blinkAt=time;s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;s.nextBlink=time+3.8+s.seed/4294967296*4.5;}
      const age=time-s.blinkAt;s.blink=reduced?0:age<0?0:age<.07?Math.sin(age/.07*Math.PI/2)**2:age<.13?1:age<.24?Math.cos((age-.13)/.11*Math.PI/2)**2:0;
      const eye=eyes[s.id]||pointer,dx=pointer.x-eye.x,dy=pointer.y-eye.y,d=Math.max(90,Math.hypot(dx,dy));
      const inertia=1-Math.exp(-dt/.15);s.gazeX+=(clamp(dx/d,-1,1)-s.gazeX)*inertia;s.gazeY+=(clamp(dy/d,-1,1)-s.gazeY)*inertia;
      const fx=spells?.values(s.id)||{vault:0,rage:0,split:0};s.effects=fx;
      const tension=(contact===s.id?.7:0)+(s.active?.12:0)+fx.rage*.5;
      s.tension+=(tension-s.tension)*(1-Math.exp(-dt/.09));if(reduced)s.tension=0;
    }return this.states;
  }
}

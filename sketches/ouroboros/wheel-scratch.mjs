import {HandMotion,SCRATCH_INPUT} from './scratch-motion.mjs';

// Recent Chrome reports momentum; older browsers use a conservative tail heuristic.
// A fresh reversal always takes control immediately.
export class WheelScratch {
  constructor({grab,motion,release,changed=()=>{},schedule=(fn,ms)=>setTimeout(fn,ms),unschedule=id=>clearTimeout(id)}){
    Object.assign(this,{grab,motion,release,changed,schedule,unschedule});
    this.hand=new HandMotion();this.active=false;this.timer=null;this.ticket=0;
    this.lastTime=-Infinity;this.lastDelta=0;this.peak=0;this.peakTime=0;this.falling=0;this.tail=false;
    this.angle=0;this.blockUntil=-Infinity;this.velocity=0;this.flickVelocity=0;this.flickTime=-Infinity;
  }
  move({deltaY,deltaMode=0,pageHeight=800,timeStamp,inside=false,angle=0,momentum}){
    if(!Number.isFinite(deltaY)||deltaY===0||!Number.isFinite(timeStamp))return false;
    const pixels=deltaY*(deltaMode===1?16:deltaMode===2?pageHeight:1);
    if(!Number.isFinite(pixels))return false;
    const delta=Math.max(-240,Math.min(240,pixels)),size=Math.abs(delta),previous=Math.abs(this.lastDelta);
    const gap=timeStamp-this.lastTime,opposite=this.lastDelta!==0&&Math.sign(delta)!==Math.sign(this.lastDelta);
    const burst=size>previous*1.4+.35,explicit=typeof momentum==='boolean';
    if(momentum===true){this.finish(timeStamp);this.tail=true;this.lastTime=timeStamp;this.lastDelta=delta;return false;}
    const fresh=opposite||burst||gap>150||explicit;
    if(timeStamp<this.blockUntil&&!explicit&&!opposite&&!burst){this.lastTime=timeStamp;this.lastDelta=delta;return false;}
    if(fresh){this.tail=false;this.falling=0;this.peak=size;this.peakTime=timeStamp;}
    else {
      if(size>this.peak){this.peak=size;this.peakTime=timeStamp;}
      this.falling=size<previous*.97?this.falling+1:0;
      if(!explicit&&this.falling>=4&&this.peak>=5&&size<this.peak*.6&&timeStamp-this.peakTime>=50)this.tail=true;
    }
    this.lastTime=timeStamp;this.lastDelta=delta;
    if(this.tail){this.finish(timeStamp);return false;}
    if(!this.active){
      if(!inside)return false;
      this.active=true;this.angle=angle;this.hand.reset();this.flickVelocity=0;this.flickTime=timeStamp;this.grab();
    }
    const velocity=this.hand.push(-delta*SCRATCH_INPUT.wheelSecondsPerPixel,timeStamp);
    if(velocity===null)return false;
    const remembered=this.flickVelocity*Math.exp(-Math.max(0,timeStamp-this.flickTime)/45);
    this.flickVelocity=Math.sign(remembered)===Math.sign(velocity)&&Math.abs(remembered)>Math.abs(velocity)?remembered:velocity;
    this.flickTime=timeStamp;this.velocity=velocity;this.motion(velocity,this.angle);
    if(this.timer!==null)this.unschedule(this.timer);
    const ticket=++this.ticket;
    this.timer=this.schedule(()=>{if(ticket===this.ticket)this.finish(timeStamp+SCRATCH_INPUT.idleMs);},SCRATCH_INPUT.idleMs);
    this.changed(this);return true;
  }
  finish(time){
    if(!this.active)return;
    const age=Math.max(0,time-this.flickTime);
    // Only the hand's recent motion seeds the short throw. Native momentum
    // deltas never drive the record or extend an already running coast.
    const coastVelocity=age>140?0:this.flickVelocity*Math.exp(-Math.max(0,age-SCRATCH_INPUT.idleMs)/35);
    this.end({coastVelocity});
  }
  cancel(){this.end();}
  end(options){
    if(this.timer!==null)this.unschedule(this.timer);
    this.timer=null;this.ticket++;
    if(!this.active)return;
    this.active=false;this.velocity=0;this.flickVelocity=0;this.hand.reset();this.release(options);this.changed(this);
  }
  suspend(time){this.cancel();this.blockUntil=time+220;this.tail=true;}
  resume(time){this.blockUntil=time+140;}
  reset(){
    this.cancel();this.lastTime=-Infinity;this.lastDelta=0;this.peak=0;this.falling=0;this.tail=false;this.blockUntil=-Infinity;
  }
}

export const SCRATCH_INPUT=Object.freeze({
  wheelSecondsPerPixel:.0045,mouseSecondsPerRadian:.26,
  defaultIntervalMs:16,idleMs:80,maximumMotion:12,visualDecayMs:70
});

// Source seconds per real second: sensitivity is independent of loop length.
export class HandMotion {
  constructor(){this.lastTime=null;}
  reset(){this.lastTime=null;}
  push(seconds,time){
    if(!Number.isFinite(seconds)||!Number.isFinite(time))return null;
    const interval=this.lastTime===null?SCRATCH_INPUT.defaultIntervalMs:Math.max(4,Math.min(60,time-this.lastTime));
    this.lastTime=time;
    const raw=seconds/(interval/1000),limit=SCRATCH_INPUT.maximumMotion;
    return limit*Math.tanh(raw/limit);
  }
}
export function onScratchBody(distance,radius){
  return Number.isFinite(distance)&&radius>0&&distance>=radius*.73&&distance<=radius*1.16;
}
export class ScratchResponse {
  constructor(){this.angle=0;this.strength=0;this.direction=1;this.time=0;}
  excite(velocity,angle,time){
    if(!Number.isFinite(velocity)||!Number.isFinite(angle)||!Number.isFinite(time))return;
    this.strength=1-Math.exp(-Math.abs(velocity)*.6);
    this.direction=Math.sign(velocity)||this.direction;this.angle=angle;this.time=time;
  }
  strengthAt(time){return this.strength*Math.exp(-Math.max(0,time-this.time)/SCRATCH_INPUT.visualDecayMs);}
  clear(){this.strength=0;}
}

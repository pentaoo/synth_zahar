export const MIN_SCALE=.35;
export const MAX_SCALE=1;

// Chromium/Firefox send incremental ctrl+wheel deltas; Safari sends a scale
// relative to gesturestart. Keep the two paths from applying the same pinch twice.
export class PinchScale {
  constructor({changed=()=>{},started=()=>{},ended=()=>{},boundary=()=>{}}={}) {
    Object.assign(this,{changed,started,ended,boundary});
    this.scale=1;this.source=null;this.anchor=1;
  }
  set(value) {
    if(!Number.isFinite(value)||value<=0)return false;
    if(this.scale===MIN_SCALE&&value<MIN_SCALE)this.boundary(value);
    const scale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,value));
    if(scale===this.scale)return false;
    this.scale=scale;this.changed(scale,1/scale);return true;
  }
  wheel(deltaY,deltaMode=0,pageHeight=800) {
    if(this.source==='safari'||this.source==='touch'||!Number.isFinite(deltaY)||deltaY===0)return false;
    const pixels=deltaY*(deltaMode===1?16:deltaMode===2?pageHeight:1);
    if(!Number.isFinite(pixels))return false;
    if(this.source!=='wheel'){this.source='wheel';this.started();}
    this.set(this.scale*Math.exp(-Math.max(-80,Math.min(80,pixels))*.01));
    return true;
  }
  touchStart(){this.source='touch';this.started();}
  touchChange(ratio){if(this.source!=='touch'||!Number.isFinite(ratio)||ratio<=0)return false;return this.set(this.scale*ratio);}
  safariStart() {if(this.source==='touch')return false;this.source='safari';this.anchor=this.scale;this.started();return true;}
  safariChange(relativeScale) {
    if(this.source!=='safari'||!Number.isFinite(relativeScale)||relativeScale<=0)return false;
    this.set(this.anchor*relativeScale);return true;
  }
  end() {if(this.source===null)return;this.source=null;this.ended();}
}

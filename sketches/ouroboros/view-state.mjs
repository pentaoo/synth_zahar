// Opening and closing are both forward flights. A close requested while
// the ring is still opening waits for a point where the snakes are out of
// sight (or finishes the arrival first), so nothing ever flies tail first.
export class ViewState {
  constructor(){this.progress=0;this.target=0;this.selected=0;this.pending=null;this.rotation=0;this.focusAngle=-Math.PI/2;this.live=false;this.closing=false;this.closeAfter=null;this.departAngle=null;}
  open(index,rotation=0,reduced=false){
    if(index<0||index>2)return;
    if(reduced){this.selected=index;this.rotation=rotation;this.progress=1;this.target=1;this.pending=null;this.closing=false;this.closeAfter=null;return;}
    if(this.progress>0&&(this.selected!==index||this.closing||this.closeAfter!==null)){
      if(!this.closing&&this.closeAfter===null)this.close();
      this.pending={index,rotation};return;
    }
    if(this.progress===0){this.focusAngle=-Math.PI/2;this.live=false;this.departAngle=null;}
    this.selected=index;this.rotation=rotation;this.pending=null;this.target=1;
  }
  close(reduced=false,angle=this.displayAngle??this.focusAngle){
    this.pending=null;
    if(reduced){this.progress=0;this.target=0;this.closing=false;this.closeAfter=null;this.departAngle=null;return;}
    if(this.progress===0){this.target=0;this.closeAfter=null;return;}
    if(this.closing)return;
    if(this.progress<1){
      if(this.progress<.40)this.closeAfter=.40;
      else if(this.progress<.54)this.beginClose(.5,angle);
      else this.closeAfter=1;
      return;
    }
    this.beginClose(1,angle);
  }
  beginClose(at,angle){
    if(at===1){this.focusAngle=angle;this.departAngle=angle;}
    this.closing=true;this.closeAfter=null;this.progress=at;this.target=0;this.live=false;this.arriveGate=null;
  }
  update(dt,reduced=false){
    if(reduced){this.progress=this.target;if(this.closeAfter!==null){this.progress=0;this.target=0;this.closeAfter=null;}}
    else{const step=Math.min(.06,dt)/2.8;this.progress+=Math.max(-step,Math.min(step,this.target-this.progress));}
    if(this.closeAfter!==null&&this.progress>=this.closeAfter)this.beginClose(this.closeAfter===1?1:.5,this.displayAngle??this.focusAngle);
    if(this.progress===0){
      this.closing=false;this.departAngle=null;this.arriveGate=null;
      if(this.pending){const next=this.pending;this.pending=null;this.selected=next.index;this.rotation=next.rotation;this.focusAngle=-Math.PI/2;this.live=false;this.target=1;}
    }
    return this.progress;
  }
  get settled(){return this.progress===this.target&&!this.pending&&this.closeAfter===null;}
}
export class Finale {
  constructor(){this.reset();}
  reset(){this.state='ready';this.progress=0;this.paused=false;this.pose=null;}
  begin(){if(this.state!=='ready')return false;this.state='closing';this.progress=0;this.paused=false;return true;}
  update(dt,reduced=false){if(this.state==='closing'&&!this.paused){this.progress=Math.min(1,this.progress+(reduced?1:dt/1.05));if(this.progress===1)this.state='ended';}return this.progress;}
  togglePause(){if(this.state==='closing')this.paused=!this.paused;}
}

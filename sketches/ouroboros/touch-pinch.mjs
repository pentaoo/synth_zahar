export class TouchPinch {
  constructor(){this.points=new Map();this.distance=0;this.active=false;}
  down(id,x,y){this.points.set(id,{x,y});if(this.points.size===2){this.distance=this.measure();this.active=true;return true;}return false;}
  measure(){const [a,b]=[...this.points.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}
  move(id,x,y){if(!this.points.has(id))return null;this.points.set(id,{x,y});if(!this.active)return null;const next=this.measure(),ratio=this.distance>2?next/this.distance:1;this.distance=next;return ratio;}
  up(id){this.points.delete(id);if(this.points.size<2&&this.active){this.active=false;this.distance=0;return true;}return false;}
  clear(){this.points.clear();this.active=false;this.distance=0;}
}

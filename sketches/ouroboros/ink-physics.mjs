const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class InkMass {
  constructor(count=64){
    this.count=count;this.radii=new Float32Array(count);this.velocity=new Float32Array(count);this.pressure=new Float32Array(count);this.points=new Float32Array(count*2);
    this.base=1;this.x=0;this.y=0;this.vx=0;this.vy=0;this.held=false;this.fingerX=0;this.fingerY=0;this.droplets=[];this.tilt=.4;this.size=0;this.voice=0;this.voicePhase=0;
  }
  resize(base){const radius=Math.max(5,base*.033),ratio=radius/this.base;for(let i=0;i<this.count;i++){this.radii[i]=this.size?this.radii[i]*ratio:radius;this.velocity[i]*=ratio;}this.base=radius;this.size=base;}
  touch(x,y){this.held=true;this.fingerX=x;this.fingerY=y;}
  release(){this.held=false;}
  reset(){this.radii.fill(this.base);this.velocity.fill(0);this.pressure.fill(0);this.droplets.length=0;this.x=0;this.y=0;this.vx=0;this.vy=0;this.held=false;}
  update(dt,features,windowRadius,playing=true,reduced=false){
    dt=Math.min(.035,Math.max(0,dt));const n=this.count,limit=Math.max(.5,windowRadius-1.5);
    const bass=playing?features.low||0:0,melody=playing?features.melody||0:0,drums=playing?features.drums||0:0,high=playing?features.high||0:0;
    const targetX=this.held?this.fingerX*limit*.26:0,targetY=this.held?this.fingerY*limit*.26:0;
    this.vx+=(targetX-this.x)*50*dt;this.vy+=(targetY-this.y)*50*dt;this.vx*=Math.exp(-dt*12);this.vy*=Math.exp(-dt*12);this.x+=this.vx*dt;this.y+=this.vy*dt;
    if(playing)this.tilt+=(.4+(features.centroid||0)*2.8-this.tilt)*Math.min(1,dt*3);
    // The recitative speaks from the abyss: the ink swells and ripples with the voice.
    const voice=playing?features.voice||0:0;this.voice+=(voice-this.voice)*Math.min(1,dt*(voice>this.voice?30:8));this.voicePhase+=dt*7;
    const mass=this.base*(1+Math.min(2.5,bass*1.8+drums*1.8))*(1+this.voice*.8);
    const fingerAngle=Math.atan2(this.fingerY,this.fingerX),fingerStrength=this.held?Math.min(1,Math.hypot(this.fingerX,this.fingerY)):0;
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
      const pull=Math.exp((Math.cos(a-fingerAngle)-1)*4)*fingerStrength*mass*.7;
      const irregular=1+.025*Math.sin(a*3+.8)+.018*Math.cos(a*5+1.1);
      const wave=features.waveform?.[(i*7)%features.waveform.length]||0;
      const ripple=reduced?0:this.voice*.16*Math.sin(a*7+this.voicePhase)*mass;
      const target=mass*irregular*(1+melody*.34*Math.cos(2*(a-this.tilt)))+pull+ripple+(reduced?0:wave*high*1.8);
      const laplacian=this.radii[(i+n-1)%n]+this.radii[(i+1)%n]-2*this.radii[i];
      this.velocity[i]+=((target-this.radii[i])*75+laplacian*130)*dt;
      this.velocity[i]*=Math.exp(-dt*10);this.radii[i]=Math.max(.2,this.radii[i]+this.velocity[i]*dt);
      const px=this.x+c*this.radii[i],py=this.y+s*this.radii[i],distance=Math.hypot(px,py),excess=Math.max(0,distance-limit);
      this.pressure[i]*=Math.exp(-dt*8);
      if(excess>0){
        this.pressure[i]=Math.max(this.pressure[i],Math.min(1,excess/Math.max(1,this.base)));
        if(!reduced&&playing&&this.velocity[i]>20&&excess>1&&this.droplets.length<7){
          this.droplets.push({x:px*limit/distance,y:py*limit/distance,vx:-c*this.velocity[i]*.35,vy:-s*this.velocity[i]*.35,r:this.base*.16,age:0});
        }
        const projection=this.x*c+this.y*s,allowed=-projection+Math.sqrt(Math.max(0,projection*projection+limit*limit-this.x*this.x-this.y*this.y));
        this.pressure[i]=Math.max(this.pressure[i],clamp((target-allowed)/this.base,0,1));
        this.radii[i]=Math.max(.2,allowed);this.velocity[i]=-Math.abs(this.velocity[i])*.28;
      }
      this.points[i*2]=this.x+c*this.radii[i];this.points[i*2+1]=this.y+s*this.radii[i];
    }
    for(let i=this.droplets.length-1;i>=0;i--){
      const d=this.droplets[i];d.age+=dt;d.vx+=(-d.x*14-d.vx*2.8)*dt;d.vy+=(-d.y*14-d.vy*2.8)*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;
      d.r=Math.min(d.r,limit*.3);const distance=Math.hypot(d.x,d.y);if(distance>limit-d.r){const factor=(limit-d.r)/Math.max(1,distance);d.x*=factor;d.y*=factor;d.vx*=-.35;d.vy*=-.35;}
      if(d.age>.16&&Math.hypot(d.x-this.x,d.y-this.y)<mass*.8||d.age>2.2)this.droplets.splice(i,1);
    }
  }
  pressureAt(angle){const i=((Math.round(angle/(2*Math.PI)*this.count)%this.count)+this.count)%this.count;return this.pressure[i];}
}

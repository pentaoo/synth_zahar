/* Read the existing output analyser. Drawing never connects or changes audio. */
(() => {
 'use strict';
 function draw(canvas,signal){
  const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const dpr=Math.min(window.devicePixelRatio||1,2),width=rect.width,height=rect.height;
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);
  const {samples,spectrum,sampleRate=44100,displayPeak=0}=signal||{},bars=Math.min(64,Math.floor(width/8));
  c.fillStyle='#94a47c';
  for(let i=0;i<bars;i++){
   const low=35*Math.pow(16000/35,i/bars),high=35*Math.pow(16000/35,(i+1)/bars);
   const a=Math.floor(low/(sampleRate/2)*(spectrum?.length||0)),b=Math.ceil(high/(sampleRate/2)*(spectrum?.length||0));
   let energy=0;for(let bin=a;bin<=b;bin++)energy=Math.max(energy,(spectrum?.[bin]||0)/255);
   const h=Math.max(2,energy*height*.82);c.globalAlpha=.22;c.fillRect(i*width/bars,height-h,Math.max(2,width/bars-3),h);
  }
  const count=Math.min(Math.floor((samples?.length||2048)/2),Math.round(sampleRate*.024));
  let start=samples?samples.length-count:0;
  if(samples)for(let i=Math.max(0,samples.length-count*2);i<samples.length-count;i++)if(samples[i]<=0&&samples[i+1]>0){start=i;break;}
  const gain=Math.min(48,.85/Math.max(.001,displayPeak));
  c.globalAlpha=.85;c.strokeStyle='#526f4b';c.lineWidth=1.8;c.lineJoin='round';c.beginPath();
  for(let i=0;i<count;i++){const x=i/(count-1)*width,y=height*.5-(samples?.[start+i]||0)*gain*height*.4;if(i)c.lineTo(x,y);else c.moveTo(x,y);}
  c.stroke();c.globalAlpha=1;
 }
 window.OutputScope={draw};
})();

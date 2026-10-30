// One ring = one loop of N snake-phrases, 8 beats each. Every ring is
// rendered separately, so rings of different length loop their own chain.
// The A2/A3 drone (a continuous low tone at 110 and 220 Hz) lives in the
// bagpipe ring. The bass takes the key degrees of the bagpipe phrases.
import {BPM} from './folk-score.mjs?v=ritual-10';
import {CELLS,PIPE,BASS,ROOTS,cellNotes,bassNotes} from './chain-model.mjs?v=chains-1';
export const SEGMENT_BEATS=CELLS,MASTER_BEATS=16;
export const beatSamples=sampleRate=>Math.round(60/BPM*sampleRate);
const midi=n=>440*2**((n-69)/12),TAU=Math.PI*2;
function oscillator(phase,wave,harmonics=9){
  if(wave==='sine')return Math.sin(phase);
  let value=0;for(let h=1;h<=harmonics;h++){
    if((wave==='square'||wave==='triangle')&&h%2===0)continue;
    value+=Math.sin(phase*h)*(wave==='triangle'?((h%4===1?1:-1)/(h*h)):1/h);
  }return value*.65;
}
// Silent master stems keep the record clock, surface noise and legacy tests.
export function masterStems(sampleRate){const length=beatSamples(sampleRate)*MASTER_BEATS;return [0,1,2].map(()=>new Float32Array(length));}

export function renderRing(sampleRate,channel,cells,{pipe=[],wave='sawtooth'}={}){
  const beatLength=beatSamples(sampleRate),beat=beatLength/sampleRate,segments=cells.length;
  const length=beatLength*SEGMENT_BEATS*segments,pcm=new Float32Array(length),seconds=length/sampleRate;
  if(!segments)return {pcm,segments,length,beatSamples:beatLength};
  let seed=8297+channel*131;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  const add=(index,value)=>{pcm[((index%length)+length)%length]+=value;};
  if(channel===PIPE){
    // Whole cycles per loop, so the drone never clicks at the seam.
    const low=Math.round(midi(45)*seconds)/seconds;
    for(let n=0;n<length;n++){
      const t=n/sampleRate,drift=.012*Math.sin(TAU*t/seconds);
      pcm[n]=(oscillator(TAU*low*t+drift,wave,5)*.1+oscillator(TAU*low*2*t,wave,3)*.04)*(1+.025*Math.sin(TAU*t/seconds*3));
    }
  }
  cells.forEach((phrase,k)=>{
    const start=k*SEGMENT_BEATS*beat;
    if(channel===PIPE)for(const [at,pitch,span,velocity] of cellNotes(phrase,ROOTS[PIPE])){
      const onset=start+at*beat,count=Math.floor((span*beat+.12)*sampleRate),f=midi(pitch),grace=.032;
      let phase=0,lp=0,noiseLP=0;
      // Chanter partials through two fixed formants, measured once per pitch.
      const partials=freq=>{const out=[];for(let h=1;h<=Math.min(14,Math.floor(sampleRate/freq/2));h++){
        const hz=freq*h,formant=.24+Math.exp(-(((hz-1050)/450)**2))+.5*Math.exp(-(((hz-2300)/580)**2));
        const amplitude=wave==='sine'?(h===1?1:0):wave==='triangle'?(h%2?1/h**2:0):wave==='square'?(h%2?1/h:0):(.72+.28*(h%2))/h;
        if(amplitude)out.push(h,amplitude*formant);}return out;};
      const graceFreq=midi(pitch+(at===0?2:-2)),main=partials(f),ornament=partials(graceFreq);
      for(let j=0;j<count;j++){
        const t=j/sampleRate,isGrace=t<grace,freq=isGrace?graceFreq:f,list=isGrace?ornament:main;
        phase+=TAU*freq/sampleRate*(1+.0007*Math.sin((onset+t)*3.1));
        let raw=0;for(let m=0;m<list.length;m+=2)raw+=Math.sin(phase*list[m])*list[m+1];
        noiseLP+=.15*(random()-noiseLP);lp+=.42*(raw-lp);
        const env=Math.min(1,t/.012)*Math.min(1,Math.max(0,(span*beat+.09-t)/.1));
        add(Math.floor(onset*sampleRate)+j,(lp*.16+noiseLP*.013)*env*velocity*(1+.018*Math.sin((onset+t)*7.2)));
      }
    }else if(channel===BASS)for(const [at,pitch,span,velocity] of bassNotes(phrase,pipe.length?pipe[k%pipe.length]:null)){
      const onset=start+at*beat,count=Math.floor((span*beat+.06)*sampleRate),f=midi(pitch);
      for(let j=0;j<count;j++){
        const t=j/sampleRate,env=Math.min(1,t/.012)*(.35+.65*Math.exp(-t*3.2))*Math.min(1,Math.max(0,(span*beat+.06-t)/.06));
        add(Math.floor(onset*sampleRate)+j,(oscillator(TAU*f*t,wave,4)*.2+Math.sin(TAU*f*.5*t)*.08)*velocity*env);
      }
    }else phrase.forEach((cell,at)=>{
      if(!/^[123]$/.test(cell))return;
      const kind=Number(cell)-1,onset=start+at*beat,velocity=(at%4===0?.82:at%2===0?.6:.42)*(kind===2?.8:1);
      const count=Math.floor((kind===0?.55:kind===1?.36:.13)*sampleRate);let phase=0,noiseLP=0;
      for(let j=0;j<count;j++){
        const t=j/sampleRate,n=random();noiseLP+=.12*(n-noiseLP);let v;
        if(kind===0){phase+=TAU*(52+95*Math.exp(-t*32))/sampleRate;v=Math.sin(phase)*Math.exp(-t*9)*.53+n*Math.exp(-t*150)*.07;}
        else if(kind===1)v=(Math.sin(TAU*173*t)*.19+Math.sin(TAU*267*t)*.09+noiseLP*.21)*Math.exp(-t*14);
        else v=(n-noiseLP)*Math.exp(-t*42)*.085;
        add(Math.floor(onset*sampleRate)+j,v*velocity);
      }
    });
  });
  return {pcm,segments,length,beatSamples:beatLength};
}

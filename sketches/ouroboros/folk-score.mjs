// Original performance draft, not a transcription of either listening reference.
import {clamp} from './score.mjs';
import {CREATURES,PHRASE_BEATS} from './ritual-model.mjs';
export {clamp,wrap} from './score.mjs';
export const BPM=78,BEATS=PHRASE_BEATS.reduce((a,b)=>a+b,0),DEFAULT_WAVES=['sawtooth','sawtooth'];
export const MATERIAL=Object.freeze({title:'Камень слышит имя',mode:'A mixolydian',bpm:BPM,phraseBeats:PHRASE_BEATS});
// Beat, MIDI pitch, duration in beats, velocity. Each phrase owns its events.
export function createPhrases(lengths=PHRASE_BEATS){
  if(!Array.isArray(lengths)||lengths.length!==2||lengths.some(v=>!Number.isFinite(v)||v<=0)||lengths[0]+lengths[1]>128)throw new RangeError('Invalid phrase lengths');
  return CREATURES.map(c=>({...c,beats:lengths[c.part],offset:c.part?lengths[0]:0,notes:c.channel===0?
  (c.part===0?[[0,45,8,.62],[0,57,8,.18],[2,52,.45,.18],[6,45,.6,.22]]:[[0,45,8,.57],[0,57,8,.23],[1.5,57,.35,.18],[5.5,52,.45,.23],[6.5,45,.8,.24]]):c.channel===1?
  (c.part===0?[[0,69,1.35,.7],[1.5,71,.4,.6],[2,73,.85,.72],[3,74,.7,.65],[4,73,1.35,.72],[5.5,71,.42,.58],[6,69,1.5,.68]]:
    [[0,76,.8,.66],[1,74,.82,.72],[2,73,1.3,.7],[3.5,71,.4,.58],[4,69,1.1,.68],[5.5,67,.4,.61],[6,69,1.65,.72]]):
  (c.part===0?[[0,0,.5,.8],[1.5,2,.2,.28],[2,1,.4,.5],[3,2,.2,.32],[4,0,.5,.72],[5,2,.2,.28],[6,1,.4,.58],[7.5,2,.2,.3]]:
    [[0,0,.5,.82],[1,2,.2,.32],[2,1,.4,.6],[3.5,2,.2,.35],[4,0,.5,.8],[5.5,1,.3,.38],[6,1,.4,.63],[7,2,.2,.32],[7.5,2,.2,.24]])})).map(p=>({...p,notes:p.notes.map(([at,n,d,v])=>[at*p.beats/8,n,d*p.beats/8,v])}));
}
export const PHRASES=createPhrases();
const midi=n=>440*2**((n-69)/12),TAU=Math.PI*2;
function oscillator(phase,wave,harmonics=9){
  if(wave==='sine')return Math.sin(phase);
  let value=0;for(let h=1;h<=harmonics;h++){
    if(wave==='square'&&h%2===0)continue;if(wave==='triangle'&&h%2===0)continue;
    value+=Math.sin(phase*h)*(wave==='triangle'?((h%4===1?1:-1)/(h*h)):1/h);
  }return value*.65;
}
export function renderScore(sampleRate,waves=DEFAULT_WAVES,lengths=PHRASE_BEATS){
  const phrases=createPhrases(lengths),beats=lengths.reduce((a,b)=>a+b,0);
  const seconds=beats*60/BPM,length=Math.round(seconds*sampleRate),beat=60/BPM;
  const phraseStems=CREATURES.map(()=>new Float32Array(length));let seed=8297;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  for(const phrase of phrases){
    const pcm=phraseStems[CREATURES.findIndex(c=>c.id===phrase.id)],offset=phrase.offset*beat;
    if(phrase.channel===0){
      // Continuous drone; complementary handoff belongs to the A/B source branches.
      for(let n=0;n<length;n++){
        const t=n/sampleRate,b=t/beat,signed=b<lengths[0]?Math.min(b,lengths[0]-b):-Math.min(b-lengths[0],beats-b);
        const blend=.5+.5*Math.tanh(signed*30),gate=phrase.part?1-blend:blend;
        const fundamental=Math.round(midi(phrase.notes[0][1])*seconds)/seconds,drift=.012*Math.sin(TAU*t/seconds);
        const low=oscillator(TAU*fundamental*t+drift,waves[0],5)*.15*(phrase.notes[0][3]/.62)+oscillator(TAU*fundamental*2*t,waves[0],3)*.035*(phrase.notes[1][3]/.18);
        pcm[n]=low*gate*(1+.025*Math.sin(TAU*t/seconds*3));
      }
      // A quiet bass answer distinguishes A/B without interrupting the drone.
      for(const [at,pitch,duration,velocity]of phrase.notes.slice(2)){
        const onset=offset+at*beat,span=duration*beat;
        for(let j=0;j<(span+.04)*sampleRate;j++){
          const t=j/sampleRate,env=Math.min(1,t/.014)*Math.exp(-t*5)*Math.min(1,Math.max(0,(span+.04-t)/.04));
          pcm[(Math.floor(onset*sampleRate)+j)%length]+=oscillator(TAU*midi(pitch)*t,waves[0],4)*.16*velocity*env;
        }
      }
    }else for(const [at,pitch,duration,velocity] of phrase.notes){
      const onset=offset+at*beat,span=duration*beat;
      if(phrase.channel===1){
        const count=Math.floor((span+.12)*sampleRate),f=midi(pitch),grace=.032;
        let phase=0,lp=0,noiseLP=0;
        for(let j=0;j<count;j++){
          const t=j/sampleRate,freq=t<grace?midi(pitch+(at===0?2:-2)):f;
          phase+=TAU*freq/sampleRate*(1+.0007*Math.sin((onset+t)*3.1));
          let raw=0;for(let h=1;h<=Math.min(14,Math.floor(sampleRate/freq/2));h++){
            const hz=freq*h,formant=.24+1.0*Math.exp(-(((hz-1050)/450)**2))+.5*Math.exp(-(((hz-2300)/580)**2));
            const wave=waves[1]||'sawtooth',amplitude=wave==='sine'?(h===1?1:0):wave==='triangle'?(h%2?1/h**2:0):wave==='square'?(h%2?1/h:0):(.72+.28*(h%2))/h;
            raw+=Math.sin(phase*h)*amplitude*formant;
          }
          noiseLP+=.15*(random()-noiseLP);lp+=.42*(raw-lp);
          const env=Math.min(1,t/.012)*Math.min(1,Math.max(0,(span+.09-t)/.1));
          const index=Math.floor(onset*sampleRate+j)%length;
          pcm[index]+=(lp*.16+noiseLP*.013)*env*velocity*(1+.018*Math.sin((onset+t)*7.2));
        }
      }else{
        const count=Math.floor((pitch===0?.55:pitch===1?.36:.13)*sampleRate);let phase=0,noiseLP=0;
        for(let j=0;j<count;j++){
          const t=j/sampleRate,n=random();noiseLP+=.12*(n-noiseLP);let v;
          if(pitch===0){phase+=TAU*(52+95*Math.exp(-t*32))/sampleRate;v=Math.sin(phase)*Math.exp(-t*9)*.53+n*Math.exp(-t*150)*.07;}
          else if(pitch===1)v=(Math.sin(TAU*173*t)*.19+Math.sin(TAU*267*t)*.09+noiseLP*.21)*Math.exp(-t*14);
          else v=(n-noiseLP)*Math.exp(-t*42)*.085;
          pcm[Math.floor(onset*sampleRate+j)%length]+=v*velocity;
        }
      }
    }
  }
  const stems=[0,1,2].map(channel=>{const pcm=new Float32Array(length);for(let n=0;n<length;n++)pcm[n]=phraseStems[channel*2][n]+phraseStems[channel*2+1][n];return pcm;});
  return {stems,phraseStems,sampleRate,length,seconds,bpm:BPM,beats,phrases};
}

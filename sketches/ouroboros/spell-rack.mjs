// Every ring (and the voice, and the ink) owns a real parallel rack,
// including its own reverb tail. Each spell is one branch of the rack.
export const SPELL_KEYS=Object.freeze(['vault','rage','split','echo','fog','ice','tremble']);
export const silentSpells=()=>Object.fromEntries(SPELL_KEYS.map(k=>[k,0]));
const LEVEL={vault:.8,rage:.32,split:.43,echo:.55,fog:.9,ice:.5,tremble:1};
export function createSpellRack(c,destination,impulse,{beat=60/78}={}){
  const input=c.createGain(),dry=c.createGain(),output=c.createGain(),shaker=c.createGain();
  input.connect(dry).connect(output).connect(shaker).connect(destination);
  // Свод: a long dark hall.
  const vault=c.createGain(),convolver=c.createConvolver(),tone=c.createBiquadFilter();
  convolver.buffer=impulse;tone.type='lowpass';tone.frequency.value=2100;vault.gain.value=0;
  input.connect(convolver).connect(tone).connect(vault).connect(output);
  // Ярость: filtered, broken saturation.
  const rage=c.createGain(),drive=c.createWaveShaper(),highpass=c.createBiquadFilter(),lowpass=c.createBiquadFilter();
  const curve=new Float32Array(2048);for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(x*19)*.8+Math.sin(x*31)*.15;}
  drive.curve=curve;drive.oversample='2x';highpass.type='highpass';highpass.frequency.value=210;lowpass.type='lowpass';lowpass.frequency.value=3400;rage.gain.value=0;
  input.connect(highpass).connect(drive).connect(lowpass).connect(rage).connect(output);
  // Расщепление: two drifting short delays.
  const split=c.createGain(),delays=[],oscillators=[];split.gain.value=0;
  for(let i=0;i<2;i++){
    const delay=c.createDelay(.1);delay.delayTime.value=.019+i*.008;input.connect(delay).connect(split);delays.push(delay);
    if(c.createOscillator){const osc=c.createOscillator(),depth=c.createGain();osc.frequency.value=.37+i*.21;depth.gain.value=.003;osc.connect(depth).connect(delay.delayTime);osc.start();oscillators.push(osc);}
  }split.connect(output);
  // Эхо: a dotted-eighth echo that darkens on each repeat.
  const echo=c.createGain(),echoDelay=c.createDelay(2),echoBack=c.createGain(),echoTone=c.createBiquadFilter();
  echoDelay.delayTime.value=beat*.75;echoBack.gain.value=.52;echoTone.type='lowpass';echoTone.frequency.value=2600;echo.gain.value=0;
  input.connect(echoDelay).connect(echoTone).connect(echoBack).connect(echoDelay);echoTone.connect(echo).connect(output);
  // Туман: the dry sound sinks under a closing low-pass.
  const fog=c.createGain(),fogFilter=c.createBiquadFilter();fogFilter.type='lowpass';fogFilter.frequency.value=520;fogFilter.Q.value=1.4;fog.gain.value=0;
  input.connect(fogFilter).connect(fog).connect(output);
  // Лёд: a thin high band ringing through a tuned comb.
  const ice=c.createGain(),iceBand=c.createBiquadFilter(),comb=c.createDelay(.05),combBack=c.createGain();
  iceBand.type='highpass';iceBand.frequency.value=1300;comb.delayTime.value=1/440;combBack.gain.value=.86;ice.gain.value=0;
  input.connect(iceBand).connect(comb).connect(combBack).connect(comb);comb.connect(ice).connect(output);
  // Дрожь: a pulsing tremolo on the whole branch.
  const tremble=c.createGain();tremble.gain.value=0;let lfo=null;
  if(c.createOscillator){lfo=c.createOscillator();lfo.frequency.value=4/beat/2;lfo.connect(tremble).connect(shaker.gain);lfo.start();oscillators.push(lfo);}
  const previous=Object.fromEntries(SPELL_KEYS.map(k=>[k,-1]));
  return {input,dry,output,shaker,vault,rage,split,echo,fog,ice,tremble,convolver,delays,oscillators,echoDelay,
    apply(values){
      const now=c.currentTime,v=k=>values[k]||0;
      for(const key of SPELL_KEYS)if(Math.abs(v(key)-previous[key])>.002){this[key].gain.setTargetAtTime(v(key)*LEVEL[key]*(key==='tremble'?.45:1),now,.018);previous[key]=v(key);}
      dry.gain.setTargetAtTime(Math.max(.05,1-v('rage')*.42-v('split')*.18-v('fog')*.85-v('ice')*.35),now,.018);
      shaker.gain.setTargetAtTime(1-v('tremble')*.45,now,.018);
    },
    dispose(){for(const osc of oscillators)osc.stop();input.disconnect();output.disconnect();shaker.disconnect();}
  };
}

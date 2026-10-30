// Every phrase owns a real parallel rack, including its independent reverb tail.
export function createSpellRack(c,destination,impulse){
  const input=c.createGain(),dry=c.createGain(),output=c.createGain();
  input.connect(dry).connect(output).connect(destination);
  const vault=c.createGain(),convolver=c.createConvolver(),tone=c.createBiquadFilter();
  convolver.buffer=impulse;tone.type='lowpass';tone.frequency.value=2100;vault.gain.value=0;
  input.connect(convolver).connect(tone).connect(vault).connect(output);
  const rage=c.createGain(),drive=c.createWaveShaper(),highpass=c.createBiquadFilter(),lowpass=c.createBiquadFilter();
  const curve=new Float32Array(2048);for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(x*19)*.8+Math.sin(x*31)*.15;}
  drive.curve=curve;drive.oversample='2x';highpass.type='highpass';highpass.frequency.value=210;lowpass.type='lowpass';lowpass.frequency.value=3400;rage.gain.value=0;
  input.connect(highpass).connect(drive).connect(lowpass).connect(rage).connect(output);
  const split=c.createGain(),delays=[],oscillators=[];split.gain.value=0;
  for(let i=0;i<2;i++){
    const delay=c.createDelay(.1);delay.delayTime.value=.019+i*.008;input.connect(delay).connect(split);delays.push(delay);
    if(c.createOscillator){const osc=c.createOscillator(),depth=c.createGain();osc.frequency.value=.37+i*.21;depth.gain.value=.003;osc.connect(depth).connect(delay.delayTime);osc.start();oscillators.push(osc);}
  }split.connect(output);
  let previous={vault:-1,rage:-1,split:-1};
  return {input,dry,output,vault,rage,split,convolver,delays,oscillators,
    apply(values){const now=c.currentTime;for(const key of ['vault','rage','split'])if(Math.abs(values[key]-previous[key])>.002){this[key].gain.setTargetAtTime(values[key]*({vault:.8,rage:.32,split:.43}[key]),now,.018);previous[key]=values[key];}
      dry.gain.setTargetAtTime(1-values.rage*.42-values.split*.18,now,.018);},
    dispose(){for(const osc of oscillators)osc.stop();input.disconnect();output.disconnect();}
  };
}

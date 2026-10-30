// Three independent, locally synthesized stems. No recordings or downloads.
export const BPM = 88;
export const BEATS = 16;
export const PARTS = ['Исток', 'Пульс', 'Жар', 'Возврат'];
export const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
export const DEFAULT_WAVES = ['triangle', 'sine'];
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const wrap = (value, length) => ((value % length) + length) % length;
export const angleDelta = (next, previous) => Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
const frequency = note => 440 * 2 ** ((note - 69) / 12);

// An original four-bar call and response. Voicings leave the upper melody room;
// short bass answers follow harmonic roots rather than doubling every piano note.
export const HARMONY = [
  {name:'Dm9', root:38, chord:[53,60,64], melody:[69,76,74,65,69]},
  {name:'B♭maj7', root:34, chord:[53,57,62], melody:[69,74,72,70,65]},
  {name:'Gm9', root:31, chord:[53,57,62], melody:[69,74,70,67,65]},
  {name:'Am7', root:33, chord:[55,60,64], melody:[67,72,71,69]}
];

function wave(phase, type) {
  const sine = Math.sin(phase);
  if (type === 'sine') return sine;
  if (type === 'triangle') return (sine - Math.sin(phase * 3) / 9 + Math.sin(phase * 5) / 25) / 1.15;
  if (type === 'square') return (sine + Math.sin(phase * 3) / 3 + Math.sin(phase * 5) / 5 + Math.sin(phase * 7) / 7) / 1.55;
  return (sine - Math.sin(phase * 2) / 2 + Math.sin(phase * 3) / 3 - Math.sin(phase * 4) / 4 + Math.sin(phase * 5) / 5) / 1.5;
}

export function renderScore(sampleRate, waves = DEFAULT_WAVES) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Неподдерживаемая частота звука');
  waves = [0,1].map(i => WAVES.includes(waves[i]) ? waves[i] : DEFAULT_WAVES[i]);
  const beat = 60 / BPM, tau = Math.PI * 2, length = Math.round(BEATS * beat * sampleRate);
  const stems = [new Float32Array(length), new Float32Array(length), new Float32Array(length)];
  let seed = 74191;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 2147483648 - 1; };
  // Add tails modulo the loop so the last note rings naturally into the first bar.
  function add(channel, at, duration, voice) {
    const start = Math.round(at * sampleRate), count = Math.ceil(duration * sampleRate);
    for(let n=0;n<count;n++) stems[channel][wrap(start+n,length)] += voice(n/sampleRate,n);
  }
  function piano(at, note, hold, velocity, chord=false) {
    const f=frequency(note), partials=[1,.46,.30,.14,.10,.065,.045,.03,.02,.015];
    // Inharmonic, differently damped strings and a brief hammer excite a piano
    // body. The selected wave colors the excitation, not the instrument's envelope.
    const modes=partials.map((amplitude,i)=>{
      const harmonic=i+1,frequency=f*harmonic*Math.sqrt(1+.00012*harmonic*harmonic);
      return {amplitude,frequency,decay:1.5+harmonic*.8};
    }).filter(mode=>mode.frequency<sampleRate*.43);
    add(1,at,hold+.42,(t)=>{
      const attack=1-Math.exp(-t*1100), damper=Math.exp(-Math.max(0,t-hold)*25);
      let strings=0;
      for(const mode of modes) strings+=Math.sin(tau*mode.frequency*t)*mode.amplitude*Math.exp(-t*mode.decay);
      const unison=Math.sin(tau*f*1.0007*t)*Math.exp(-t*2.5)*.11;
      const excitation=wave(tau*f*t,waves[1])*Math.exp(-t*6)*.13;
      const hammer=random()*Math.exp(-t*250)*.06;
      return (strings+unison+excitation+hammer)*attack*damper*velocity*(chord?.105:.205);
    });
  }
  function bass(at,note,hold,velocity) {
    const f=frequency(note);
    add(0,at,hold+.18,t=>{
      const attack=1-Math.exp(-t*260),release=Math.exp(-Math.max(0,t-hold)*40);
      const body=.65*wave(tau*f*t,waves[0])+.23*Math.sin(tau*f*2*t)+.08*Math.sin(tau*f*3*t);
      return body*attack*release*Math.exp(-t*1.1)*velocity*.30;
    });
  }
  function drum(at,kind,velocity) {
    const duration=kind==='kick'?.29:kind==='snare'?.17:.065;
    let last=0,low=0;
    add(2,at,duration,t=>{
      const noise=random();low+=.28*(noise-low);
      const high=noise-last;last=noise;
      const sound=kind==='kick'
        ? Math.sin(tau*(49*t+1.25*(1-Math.exp(-t*45))))*Math.exp(-t*17)+noise*Math.exp(-t*360)*.10
        : kind==='snare'
          ? (noise*.72+low*.28)*Math.exp(-t*37)*.70+Math.sin(tau*184*t)*Math.exp(-t*32)*.34
          : high*Math.exp(-t*105)*.25;
      return sound*velocity*Math.min(1,t/.0015);
    });
  }

  for(let bar=0;bar<4;bar++){
    const start=bar*4*beat, harmony=HARMONY[bar];
    // Tiny fixed offsets and voicing spreads make the same phrase repeatable.
    harmony.chord.forEach((note,i)=>piano(start+.008+i*.005,note,.29,bar===2?.75:.66,true));
    const positions=[.0,.75,1.5,2.5,3.25],levels=[.9,.74,.82,.65,.58];
    harmony.melody.forEach((note,i)=>piano(start+positions[i]*beat+[.004,.012,.006,.017,.009][i],note,[.24,.18,.28,.23,.17][i],levels[i]*(bar===2?1.06:1)));
    bass(start+.002,harmony.root,.62*beat,.95);
    bass(start+1.75*beat+.009,harmony.root+12,.30*beat,.66);
    bass(start+2.5*beat+.004,harmony.root,.50*beat,.83);
    if(bar===1||bar===2)bass(start+3.5*beat+.008,harmony.root+7,.22*beat,.54);

    drum(start,'kick',bar===2?.50:.43);
    if(bar>0)drum(start+2*beat-.006,'kick',bar===2?.43:.35);
    if(bar===1||bar===2)drum(start+2.75*beat+.005,'kick',.27);
    for(const b of [1,3])drum(start+b*beat+.012,'snare',bar===2?.40:.34);
    if(bar===1||bar===2)drum(start+2.75*beat+.022,'snare',.075);
    const hats=bar===0?[0,1,2,3]:[0,.5,1,1.5,2,2.5,3,3.5];
    for(const b of hats)drum(start+b*beat+(b%1?.026:.003),'hat',b%1?.20:.26);
    if(bar===2)drum(start+3.75*beat+.014,'hat',.12);
  }
  // Subtle saturation and fine quantization color the notes themselves. No
  // permanent noise bed, wow/flutter or automatic rhythmic cuts cover attacks.
  for(const stem of stems)for(let n=0;n<length;n++){
    const soft=Math.tanh(stem[n]*1.35)/1.35;
    stem[n]=soft*.96+Math.round(soft*4096)/4096*.04;
  }
  return {stems,length,sampleRate,bpm:BPM,beats:BEATS};
}


(() => {
  'use strict';
  const STORAGE_KEY = 'landscape-mechanics-v1';
  let savedState = null;
  try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); savedState = stored?.privateContent || stored; } catch {}
  const root=document.getElementById('landscape-lab-01');
  const q=s=>root.querySelector(s), all=s=>[...root.querySelectorAll(s)];
  const canvas=q('[data-canvas]'), stage=q('[data-stage]'), ctx=canvas.getContext('2d');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const PITCH_MIN=48, PITCH_MAX=72, PITCH_SPAN=PITCH_MAX-PITCH_MIN;
  const modes={
    major:{name:'Мажор',steps:[0,2,4,5,7,9,11]},minor:{name:'Минор',steps:[0,2,3,5,7,8,10]},
    dorian:{name:'Дорийский',steps:[0,2,3,5,7,9,10]},phrygian:{name:'Фригийский',steps:[0,1,3,5,7,8,10]},
    lydian:{name:'Лидийский',steps:[0,2,4,6,7,9,11]},mixolydian:{name:'Миксолидийский',steps:[0,2,4,5,7,9,10]},
    locrian:{name:'Локрийский',steps:[0,1,3,5,6,8,10]},majorPent:{name:'Мажорная пентатоника',steps:[0,2,4,7,9]},
    minorPent:{name:'Минорная пентатоника',steps:[0,3,5,7,10]},chromatic:{name:'Хроматический',steps:[0,1,2,3,4,5,6,7,8,9,10,11]},free:{name:'Свободный',steps:null}
  };
  const pitchNames=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','B','H'];
  const worlds={
    autumn:{name:'Осень',notes:[48,50,52,55,57,60,62,64,67,69,72],bg:'#edf0e4',hill:'#becaaa',color:'#536b43',waves:['triangle','sine'],types:[{id:'drop',name:'Капля',channel:0,voice:'Синт 1'},{id:'leaf',name:'Лист',channel:1,voice:'Синт 2'},{id:'raven',name:'Ворона',channel:2,voice:'Барабаны'},{id:'fog',name:'Туман',channel:1,voice:'Синт 2 · непрерывная нота',sustained:true}]},
    space:{name:'Космос',notes:[48,51,53,55,58,60,63,65,67,70,72],bg:'#e9eaf2',hill:'#c0bed4',color:'#66658c',waves:['sine','sawtooth'],types:[{id:'comet',name:'Комета',channel:0,voice:'Синт 1'},{id:'star',name:'Звезда',channel:1,voice:'Синт 2'},{id:'asteroid',name:'Астероид',channel:2,voice:'Барабаны'},{id:'aurora',name:'Сияние',channel:1,voice:'Синт 2 · непрерывная нота',sustained:true}]}
  };
  const defaultScenes={autumn:[{id:1,type:'drop',x:.2,y:.76,interval:2,muted:false},{id:2,type:'leaf',x:.5,y:.42,interval:4,muted:false},{id:3,type:'raven',x:.8,y:.23,interval:1,muted:false}],space:[{id:4,type:'comet',x:.1,y:.6,interval:2,muted:false},{id:5,type:'star',x:.6,y:.76,interval:4,muted:false},{id:6,type:'asteroid',x:.4,y:.25,interval:1,muted:false}]};
  let scenes=JSON.parse(JSON.stringify(defaultScenes)), worldKey='autumn', selectedId=1, tool='drop', bpm=80, nextId=7;
  let waveforms={autumn:[...worlds.autumn.waves],space:[...worlds.space.waves]};
  let scaleSettings={autumn:{tonic:0,mode:'majorPent'},space:{tonic:0,mode:'minorPent'}}, showAudio=false;
  let phraseLength=8, nextPhraseBeat=0, playingStep=null, playingStepAt=null, phraseEvents=[], activatedHeld=new Set();
  let running=false, elapsed=0, beat=0, lastTime=0, audioAnchor=0, wallAnchor=0, particles=[], ripples=[], drag=null, ghost=null, lastPersisted=null;
  let geom={left:52,right:650,top:40,bottom:345}, w=700,h=390;
  const FALL_TIME=.8, MAX_SOURCES=16, history=[], sourceButtons=new Map(), stats={hits:[],peak:0};
  const scene=()=>scenes[worldKey], world=()=>worlds[worldKey], selected=()=>scene().find(e=>e.id===selectedId), typeFor=id=>world().types.find(t=>t.id===id);
  const scale=()=>scaleSettings[worldKey];
  function allowedNotes(key=worldKey){const settings=scaleSettings[key],steps=modes[settings.mode].steps,notes=[];for(let note=PITCH_MIN;note<=PITCH_MAX;note++)if(!steps||steps.includes(((note-settings.tonic)%12+12)%12))notes.push(note);return notes;}
  function noteFor(x,key=worldKey){const raw=PITCH_MIN+clamp(x,0,1)*PITCH_SPAN;if(scaleSettings[key].mode==='free')return raw;return allowedNotes(key).reduce((nearest,note)=>Math.abs(note-raw)<Math.abs(nearest-raw)?note:nearest);}
  const snapX=(x,key=worldKey)=>(noteFor(x,key)-PITCH_MIN)/PITCH_SPAN;
  function stepX(x,direction){if(scale().mode==='free')return clamp(x+direction/(PITCH_SPAN*4),0,1);const notes=allowedNotes(),index=notes.indexOf(noteFor(x));return (notes[clamp(index+direction,0,notes.length-1)]-PITCH_MIN)/PITCH_SPAN;}
  function noteName(value){const note=Math.round(value),cents=Math.round((value-note)*100);return pitchNames[((note%12)+12)%12]+(Math.floor(note/12)-1)+(cents?' '+(cents>0?'+':'−')+Math.abs(cents)+' ц':'');}
  const frequencyFor=note=>440*Math.pow(2,(note-69)/12);
  const legacySteps=interval=>Array.from({length:32},(_,i)=>i).filter(i=>i%Math.max(1,interval)===0);
  for(const [key,arr] of Object.entries(scenes))for(const e of arr){e.x=(worlds[key].notes[Math.round(e.x*10)]-PITCH_MIN)/PITCH_SPAN;e.steps=legacySteps(e.interval);}
  const allPhraseSteps=()=>Array.from({length:32},(_,i)=>i);
  const sourceSteps=e=>e.steps.filter(step=>step<phraseLength);
  const heldOnStep=(e,step)=>step!==null&&sourceSteps(e).includes(step);
  const patternLabel=e=>typeFor(e.type)?.sustained&&sourceSteps(e).length===phraseLength?'вся фраза':sourceSteps(e).length?'доли '+sourceSteps(e).map(step=>step+1).join(', '):'пауза';
  const position=e=>({x:geom.left+e.x*(geom.right-geom.left),y:geom.bottom-e.y*(geom.bottom-geom.top)});
  const status=value=>{q('[data-status]').textContent=value;};

  const SOURCE_DEFAULTS = { gain: 1, pan: 0, octave: 0, detune: 0, duration: .28, attack: .01, decay: .18, sustain: .35, release: .25, brightness: 5000, channel: 'auto' };
  const clone = value => JSON.parse(JSON.stringify(value));
  const MIX_DEFAULTS = { master: .36, threshold: -18, ratio: 4,
    voices: [{gain: .85, pan: 0, detune: 0}, {gain: .75, pan: 0, detune: 7}],
    drums: {gain: .8, pan: 0, decay: .18, tone: .7, noise: .3},
    effects: {
      synth: {brightness: 6000, drive: .08, delayMix: .1, delayTime: .25, feedback: .2, reverbMix: .16, room: 1.6},
      drum: {brightness: 8000, drive: .04, delayMix: .08, delayTime: .125, feedback: .12, reverbMix: .08, room: 1.1}
    }
  };
  let soundSettings = {autumn: clone(MIX_DEFAULTS), space: clone(MIX_DEFAULTS)};
  const mix = () => soundSettings[worldKey];
  const sourceChannel = e => typeFor(e.type).sustained ? 1 : e.sound.channel === 'auto' ? typeFor(e.type).channel : Number(e.sound.channel);
  const getPath = (obj, path) => path.split('.').reduce((value, key) => value[key], obj);
  function setPath(obj, path, value) { const keys = path.split('.'), key = keys.pop(); keys.reduce((value, k) => value[k], obj)[key] = value; }
  function cleanSourceSettings(value = {}, type) {
    if (!value || typeof value !== 'object') value = {};
    const settings = {...SOURCE_DEFAULTS};
    for (const input of all('[data-source-param]')) {
      const key = input.dataset.sourceParam;
      if (input.type === 'range' && Number.isFinite(value[key])) settings[key] = clamp(value[key], Number(input.min), Number(input.max));
    }
    if ([-2,-1,0,1,2].includes(value.octave)) settings.octave = value.octave;
    if (['auto','0','1','2'].includes(value.channel)) settings.channel = value.channel;
    if (!value.sustain && value.sustain !== 0 && ['fog','aurora'].includes(type)) settings.sustain = .6;
    return settings;
  }
  function cleanMix(value) {
    const config = clone(MIX_DEFAULTS);
    for (const input of all('[data-sound-param]')) {
      const key = input.dataset.soundParam;
      let candidate; try {candidate = getPath(value, key);} catch {continue;}
      if (Number.isFinite(candidate)) setPath(config, key, clamp(candidate, Number(input.min), Number(input.max)));
    }
    return config;
  }
  for (const sources of Object.values(scenes)) for (const e of sources) e.sound = cleanSourceSettings({}, e.type);
  const typeColor = type => ({drop:'#789fba',leaf:'#a7a36a',raven:'#677b66',fog:'#96b8a5',comet:'#9892c5',star:'#c3ac73',asteroid:'#8596aa',aurora:'#a19cc8'}[type] || world().color);
  let inspectorTab = 'source';
  function openInspector(tab) {
    inspectorTab = tab;
    all('[data-inspector-tab]').forEach(button => { const active = button.dataset.inspectorTab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    q('#source-panel').hidden = tab !== 'source'; q('#sound-panel').hidden = tab !== 'sound';
  }
  function formatParameter(key, value) {
    if (key.endsWith('pan')) return Math.abs(value) < .01 ? 'Центр' : (value < 0 ? 'L ' : 'R ') + Math.round(Math.abs(value) * 100) + '%';
    if (key.endsWith('brightness')) return value >= 1000 ? (value / 1000).toFixed(1) + ' кГц' : value + ' Гц';
    if (key.endsWith('detune')) return (value > 0 ? '+' : '') + value + ' ц';
    if (key.endsWith('threshold')) return value + ' дБ';
    if (key.endsWith('ratio')) return value + ':1';
    if (/duration|attack|decay|release|delayTime|room/.test(key)) return value < 1 ? Math.round(value * 1000) + ' мс' : value.toFixed(1) + ' с';
    if (key.endsWith('tone')) return value.toFixed(2) + '×';
    return Math.round(value * 100) + '%';
  }
  function syncParameters() {
    for (const input of all('[data-source-param]')) {
      const e = selected(), key = input.dataset.sourceParam;
      const value = e ? e.sound[key] : SOURCE_DEFAULTS[key];
      input.value = value;
      const output = q('[data-output="source:' + key + '"]'); if (output) output.textContent = formatParameter(key, value);
      input.disabled = !e || (typeFor(e.type).sustained && ['channel','duration'].includes(key));
    }
    for (const input of all('[data-sound-param]')) {
      const key = input.dataset.soundParam, value = getPath(mix(), key); input.value = value;
      q('[data-output="sound:' + key + '"]').textContent = formatParameter(key, value);
    }
  }
  class Sound {
    constructor() {
      this.context = null;
      this.active = new Set();
      this.voices = new Map();
      this.held = new Map();
      this.peak = 0;
    }
    async init() {
      if (this.context) { await this.context.resume(); this.configure(); return; }
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioClass) throw new Error('Этот браузер не поддерживает Web Audio');
      this.context = new AudioClass({ latencyHint: 'interactive' });
      const c = this.context;
      this.master = c.createGain();
      this.compressor = c.createDynamicsCompressor();
      this.compressor.knee.value = 12;
      this.compressor.attack.value = .005;
      this.compressor.release.value = .18;
      this.meter = c.createAnalyser();
      this.meter.fftSize = 8192;
      this.meter.minDecibels = -80;
      this.meter.maxDecibels = -15;
      this.meter.smoothingTimeConstant = .65;
      this.samples = new Float32Array(this.meter.fftSize);
      this.spectrum = new Uint8Array(this.meter.frequencyBinCount);
      this.master.connect(this.compressor).connect(this.meter).connect(c.destination);
      this.buses = {};
      for (const bus of ['synth', 'drum']) {
        const input = c.createGain(), filter = c.createBiquadFilter(), drive = c.createWaveShaper();
        filter.type = 'lowpass'; filter.Q.value = .5; drive.oversample = '2x';
        const delay = c.createDelay(1), feedback = c.createGain(), delayWet = c.createGain();
        const convolver = c.createConvolver(), reverbWet = c.createGain(), output = c.createGain();
        input.connect(filter).connect(drive);
        drive.connect(output);
        drive.connect(delay); delay.connect(feedback).connect(delay);
        delay.connect(delayWet).connect(output);
        // Reverb receives the complete dry + echo signal; wet returns to master.
        output.connect(this.master); output.connect(convolver).connect(reverbWet).connect(this.master);
        this.buses[bus] = { input, filter, drive, delay, feedback, delayWet, convolver, reverbWet, output, room: null, driveValue: null };
      }
      this.channels = [];
      this.channelPans = [];
      for (let i = 0; i < 3; i++) {
        const gain = c.createGain(), pan = c.createStereoPanner();
        gain.connect(pan).connect(this.buses[i < 2 ? 'synth' : 'drum'].input);
        this.channels.push(gain); this.channelPans.push(pan);
      }
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      this.configure();
      await c.resume();
    }
    impulse(seconds) {
      const c = this.context, length = Math.ceil(c.sampleRate * seconds), buffer = c.createBuffer(2, length, c.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8);
      }
      return buffer;
    }
    configure() {
      if (!this.context) return;
      const now = this.context.currentTime, config = mix();
      this.master.gain.setTargetAtTime(config.master, now, .02);
      this.compressor.threshold.setTargetAtTime(config.threshold, now, .02);
      this.compressor.ratio.setTargetAtTime(config.ratio, now, .02);
      for (let i = 0; i < 3; i++) {
        const channel = i < 2 ? config.voices[i] : config.drums;
        this.channels[i].gain.setTargetAtTime(channel.gain, now, .02);
        this.channelPans[i].pan.setTargetAtTime(channel.pan, now, .02);
      }
      for (const bus of ['synth', 'drum']) {
        const nodes = this.buses[bus], fx = config.effects[bus];
        nodes.filter.frequency.setTargetAtTime(fx.brightness, now, .025);
        nodes.delay.delayTime.setTargetAtTime(fx.delayTime, now, .025);
        nodes.feedback.gain.setTargetAtTime(fx.feedback, now, .025);
        nodes.delayWet.gain.setTargetAtTime(fx.delayMix, now, .02);
        nodes.reverbWet.gain.setTargetAtTime(fx.reverbMix, now, .02);
        if (nodes.driveValue !== fx.drive) {
          const curve = new Float32Array(2048), amount = 1 + fx.drive * 10;
          for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
          nodes.drive.curve = fx.drive === 0 ? null : curve;
          nodes.driveValue = fx.drive;
        }
        if (nodes.room !== fx.room) { nodes.convolver.buffer = this.impulse(fx.room); nodes.room = fx.room; }
      }
      this.syncHeld();
    }
    route(p) { return sourceChannel(p); }
    envelope(gate, now, peak, settings, held, duration) {
      const attackEnd = now + settings.attack, decayEnd = attackEnd + settings.decay;
      gate.gain.setValueAtTime(0, now);
      gate.gain.linearRampToValueAtTime(peak, attackEnd);
      gate.gain.linearRampToValueAtTime(peak * settings.sustain, decayEnd);
      if (held) return Infinity;
      const releaseStart = decayEnd + duration, end = releaseStart + settings.release;
      gate.gain.setValueAtTime(peak * settings.sustain, releaseStart);
      gate.gain.linearRampToValueAtTime(0, end);
      return end;
    }
    hit(p, when, preview = false) {
      if (!this.context || this.context.state !== 'running') return;
      const kind = typeFor(p.type);
      if (!kind) return;
      if (kind.sustained && !preview) { this.hold(p, when); return; }
      this.createVoice(p, when, false, preview);
    }
    createVoice(p, when, held, preview = false) {
      const c = this.context, settings = p.sound, channel = this.route(p), config = mix();
      const oscillator = c.createOscillator(), gate = c.createGain(), filter = c.createBiquadFilter(), pan = c.createStereoPanner();
      const note = p.note + settings.octave * 12, frequency = frequencyFor(note);
      const detune = settings.detune + (channel < 2 ? config.voices[channel].detune : 0);
      const amplitude = (.035 + p.y * p.y * .28) * settings.gain;
      oscillator.type = channel === 2 ? 'sine' : waveforms[worldKey][channel];
      oscillator.frequency.value = channel === 2 ? frequency * config.drums.tone : frequency;
      oscillator.detune.value = detune;
      filter.type = 'lowpass'; filter.Q.value = .45; filter.frequency.value = settings.brightness;
      pan.pan.value = settings.pan;
      const envelopeSettings = channel === 2 ? { ...settings, attack: Math.min(settings.attack, .03), decay: config.drums.decay, sustain: 0, release: .03 } : settings;
      const end = this.envelope(gate, when, amplitude, envelopeSettings, held, channel === 2 ? 0 : settings.duration);
      if (channel === 2) oscillator.frequency.exponentialRampToValueAtTime(Math.max(15, frequency * config.drums.tone * .24), when + config.drums.decay);
      oscillator.connect(gate).connect(filter).connect(pan).connect(this.channels[channel]);
      oscillator.start(when);
      if (!held) oscillator.stop(end + .015);
      this.active.add(oscillator);
      const voice = { id: p.id, note: note + detune / 100, channel, start: when, end, group: p.group, sustained: held, gate, filter, pan, preview };
      this.voices.set(oscillator, voice);
      if (held) this.held.set(p.id, { oscillator, gate, filter, pan, channel, start:when, releaseAt:null, signature:this.heldSignature(p) });
      oscillator.onended = () => {
        this.active.delete(oscillator); this.voices.delete(oscillator);
        if (this.held.get(p.id)?.oscillator === oscillator) this.held.delete(p.id);
        for (const node of [oscillator, gate, filter, pan]) node.disconnect();
      };
      if (channel === 2 && config.drums.noise > 0) {
        const noise = c.createBufferSource(), noiseFilter = c.createBiquadFilter(), noiseGain = c.createGain(), noisePan = c.createStereoPanner();
        noise.buffer = this.noise; noiseFilter.type = 'bandpass'; noiseFilter.frequency.value = Math.min(12000, frequency * 6 * config.drums.tone);
        noisePan.pan.value = settings.pan;
        noiseGain.gain.setValueAtTime(amplitude * config.drums.noise, when);
        noiseGain.gain.exponentialRampToValueAtTime(.0001, when + config.drums.decay);
        noise.connect(noiseFilter).connect(noiseGain).connect(noisePan).connect(this.channels[2]);
        noise.start(when); noise.stop(when + config.drums.decay + .01); this.active.add(noise);
        this.voices.set(noise, { id: p.id, note, channel: 2, start: when, end: when + config.drums.decay, noise: true, group: p.group });
        noise.onended = () => { this.active.delete(noise); this.voices.delete(noise); for (const node of [noise, noiseFilter, noiseGain, noisePan]) node.disconnect(); };
      }
    }
    heldSignature(e) {
      return JSON.stringify([e.x,e.y,e.sound,waveforms[worldKey][1],mix().voices[1].detune]);
    }
    hold(p, when) {
      const held=this.held.get(p.id);
      if ((!held || (held.releaseAt!==null&&held.releaseAt<=when)) && this.context?.state==='running') {
        if(held)try {held.oscillator.stop(Math.max(this.context.currentTime,held.releaseAt)+.02);} catch {}
        this.createVoice(p,when,true);
      }
    }
    holdGain(parameter,when) {
      if (typeof parameter.cancelAndHoldAtTime==='function') parameter.cancelAndHoldAtTime(when);
      else {parameter.cancelScheduledValues(when);parameter.setValueAtTime(parameter.value,when);}
    }
    release(id,when=this.context?.currentTime) {
      const held=this.held.get(id);
      if (!held) return;
      const now=this.context.currentTime;
      this.holdGain(held.gate.gain,when);
      held.gate.gain.linearRampToValueAtTime(0,when+.008);
      held.releaseAt=when;
      this.voices.get(held.oscillator).end=when;
      // Future gates can be edited until their beat. Stop the oscillator once
      // the playhead reaches that beat, so cancelling a future rest is safe.
      if (when<=now) {
        try {held.oscillator.stop(now+.02);} catch {}
        this.voices.delete(held.oscillator);this.held.delete(id);
      }
    }
    stopSource(id) {
      this.release(id);
      for (const [node,voice] of this.voices) if (voice.id===id) {try {node.stop();} catch {} this.active.delete(node);this.voices.delete(node);}
    }
    cancelHeldSchedules() {
      if (!this.context) return;
      const now=this.context.currentTime;
      for (const [id,held] of this.held) {
        if (held.start>now) {this.stopSource(id);continue;}
        if (held.releaseAt!==null&&held.releaseAt>now) {
          this.holdGain(held.gate.gain,now);
          held.releaseAt=null;held.signature=null;this.voices.get(held.oscillator).end=Infinity;
        }
      }
    }
    scheduleHeldStep(step,when) {
      if (this.context?.state!=='running') return;
      for (const e of scene()) if (typeFor(e.type).sustained) {
        if (!e.muted&&heldOnStep(e,step)) this.hold({...e,note:noteFor(e.x)},when);
        else this.release(e.id,when);
      }
    }
    syncHeld() {
      const now=this.context?.currentTime||0;
      for (const [id,held] of this.held) {
        const e=scene().find(e=>e.id===id);
        if (!running||!e||e.muted||!typeFor(e.type).sustained||(held.start<=now&&!heldOnStep(e,playingStep))) this.release(id);
      }
      if (!running||this.context?.state!=='running') return;
      for (const e of scene()) if (!e.muted&&typeFor(e.type).sustained&&((activatedHeld.has(e.id)&&heldOnStep(e,playingStep))||this.held.get(e.id)?.start>now)) {
        this.hold({...e,note:noteFor(e.x)},now+.005);
        const held=this.held.get(e.id),signature=this.heldSignature(e);
        if (held.signature===signature) continue;
        const settings=e.sound,detune=settings.detune+mix().voices[1].detune,at=Math.max(now,held.start);
        held.oscillator.type=waveforms[worldKey][1];
        held.oscillator.frequency.setTargetAtTime(frequencyFor(noteFor(e.x)+settings.octave*12),at,.025);
        held.oscillator.detune.setTargetAtTime(detune,at,.025);
        if(held.start>now){held.gate.gain.cancelScheduledValues(at);this.envelope(held.gate,at,(.035+e.y*e.y*.28)*settings.gain,settings,true,0);}
        else {this.holdGain(held.gate.gain,now);held.gate.gain.setTargetAtTime((.035+e.y*e.y*.28)*settings.gain*settings.sustain,now,.025);}
        held.filter.frequency.setTargetAtTime(settings.brightness,at,.025);
        held.pan.pan.setTargetAtTime(settings.pan,at,.025);
        this.voices.get(held.oscillator).note=noteFor(e.x)+settings.octave*12+detune/100;
        held.signature=signature;
        if(held.releaseAt!==null&&held.releaseAt>now)this.release(e.id,held.releaseAt);
      }
    }
    stop() {
      for (const node of this.active) { try { node.stop(); } catch {} }
      this.active.clear(); this.voices.clear(); this.held.clear();
      this.samples?.fill(0); this.spectrum?.fill(0); this.peak = 0;
    }
    readPeak() {
      if (!this.meter) return 0;
      this.meter.getFloatTimeDomainData(this.samples);
      if (showAudio) this.meter.getByteFrequencyData(this.spectrum);
      let peak = 0; for (const sample of this.samples) peak = Math.max(peak, Math.abs(sample));
      this.peak = peak; return peak;
    }
    sounding() { return this.context?.state === 'running' ? [...this.voices.values()].filter(v => !v.noise && v.start <= this.context.currentTime && v.end > this.context.currentTime) : []; }
    energyAt(note) {
      if (!this.meter) return 0;
      const bin = frequencyFor(note) * this.meter.fftSize / this.context.sampleRate, index = Math.floor(bin), fraction = bin - index;
      return ((this.spectrum[index] || 0) * (1 - fraction) + (this.spectrum[index + 1] || 0) * fraction) / 255;
    }
  }
  const sound=new Sound();
  function serial() {
    return {version:5, worldKey, bpm, phraseLength, selectedId, tool, nextId, showAudio,
      scaleSettings:clone(scaleSettings), scenes:clone(scenes), waveforms:clone(waveforms), soundSettings:clone(soundSettings)};
  }
  function persist() {
    const snapshot = serial(); lastPersisted = JSON.stringify(snapshot);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({privateContent:snapshot})); } catch { q('.save-status').textContent = 'Без сохранения'; }
    if (window.openai?.setWidgetState) window.openai.setWidgetState({privateContent:snapshot}).catch(() => {});
  }
  function restore(saved){
    if(!saved||![1,2,3,4,5].includes(saved.version)||!worlds[saved.worldKey])return;
    for(const key of Object.keys(worlds)){const settings=saved.scaleSettings?.[key];scaleSettings[key]=saved.version>=2&&Number.isInteger(settings?.tonic)&&settings.tonic>=0&&settings.tonic<12&&Object.hasOwn(modes,settings.mode)?{tonic:settings.tonic,mode:settings.mode}:{tonic:0,mode:key==='autumn'?'majorPent':'minorPent'};}
    const clean={};let maxId=0;
    for(const key of Object.keys(worlds)){if(!Array.isArray(saved.scenes?.[key]))return;clean[key]=saved.scenes[key].slice(0,MAX_SOURCES).filter(e=>Number.isInteger(e.id)&&worlds[key].types.some(t=>t.id===e.type)&&Number.isFinite(e.x)&&Number.isFinite(e.y)).map(e=>{maxId=Math.max(maxId,e.id);const x=saved.version===1?(worlds[key].notes[Math.round(clamp(e.x,0,1)*10)]-PITCH_MIN)/PITCH_SPAN:e.x;const sustained=worlds[key].types.find(t=>t.id===e.type).sustained;const steps=sustained&&saved.version<5?allPhraseSteps():saved.version>=3?Array.isArray(e.steps)?[...new Set(e.steps.filter(step=>Number.isInteger(step)&&step>=0&&step<32))].sort((a,b)=>a-b):[0]:legacySteps([.5,1,2,4].includes(e.interval)?e.interval:2);return {id:e.id,type:e.type,x:snapX(x,key),y:clamp(e.y,.08,.92),muted:!!e.muted,steps,sound:cleanSourceSettings(e.sound,e.type)};});}
    for (const key of Object.keys(worlds)) soundSettings[key] = cleanMix(saved.soundSettings?.[key]);
    showAudio=saved.version>=2&&!!saved.showAudio;phraseLength=saved.version>=3?clamp(Math.round(Number(saved.phraseLength)||8),1,32):8;
    scenes=clean;worldKey=saved.worldKey;bpm=clamp(Number(saved.bpm)||80,45,160);nextId=Math.max(maxId+1,Number(saved.nextId)||0);selectedId=scene().some(e=>e.id===saved.selectedId)?saved.selectedId:scene()[0]?.id||null;tool=world().types.some(t=>t.id===saved.tool)?saved.tool:world().types[0].id;
    for(const key of Object.keys(worlds)){const arr=saved.waveforms?.[key];if(Array.isArray(arr)&&arr.length===2&&arr.every(v=>['sine','triangle','sawtooth','square'].includes(v)))waveforms[key]=arr;}
  }
  restore(window.openai?.widgetState?.privateContent || savedState);
  function remember(){history.push(serial());if(history.length>20)history.shift();q('[data-action="undo"]').disabled=false;}
  function commit(){sound.cancelHeldSchedules();for(const event of phraseEvents)event.heldScheduled=false;sound.configure();sync();persist();}
  function anchorClock(){audioAnchor=(sound.context?.currentTime||0)-elapsed;wallAnchor=performance.now()/1000-elapsed;}
  function resetTransport(){sound.stop();elapsed=0;beat=0;nextPhraseBeat=0;playingStep=null;playingStepAt=null;phraseEvents=[];particles=[];ripples=[];activatedHeld.clear();anchorClock();lastTime=performance.now();syncPlayhead();}
  function addSource(type,x,y,template=null){if(scene().length>=MAX_SOURCES){status('На сцене уже 16 источников');return;}remember();const e={id:nextId++,type,x:snapX(x),y:clamp(y,.08,.92),steps:template?[...template.steps]:typeFor(type).sustained?allPhraseSteps():[0],muted:template?.muted||false,sound:cleanSourceSettings(template?.sound,type)};scene().push(e);selectedId=e.id;openInspector('source');commit();status(typeFor(type).sustained?'Непрерывная нота: выбери справа доли, на которых она звучит':'Источник размещён. Отметь справа доли, на которых он звучит');}
  function removeSource(){if(!selected())return;remember();sound.stopSource(selectedId);activatedHeld.delete(selectedId);scenes[worldKey]=scene().filter(e=>e.id!==selectedId);particles=particles.filter(p=>p.id!==selectedId);selectedId=scene()[0]?.id||null;commit();}
  function setWorld(key){if(key===worldKey)return;worldKey=key;tool=world().types[0].id;selectedId=scene()[0]?.id||null;ghost=null;resetTransport();commit();status('Пейзаж сменился; фраза предыдущей сцены сохранена');}
  function setScale(property,value){remember();scale()[property]=value;scene().forEach(e=>e.x=snapX(e.x));ghost=null;commit();status(scale().mode==='free'?'Свободное размещение: высота звука меняется плавно':'Источники привязаны к нотам выбранного лада');}
  function coordinates(event){const rect=canvas.getBoundingClientRect();return {x:clamp((event.clientX-rect.left-geom.left)/(geom.right-geom.left),0,1),y:clamp((geom.bottom-(event.clientY-rect.top))/(geom.bottom-geom.top),.08,.92)};}
  function inField(event){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;return x>=geom.left&&x<=geom.right&&y>=geom.top&&y<=geom.bottom;}
  function syncPitchEditor(){const e=selected();if(!e)return;const input=q('[data-control="pitch"]'),notes=allowedNotes(),free=scale().mode==='free';input.min=0;input.max=free?PITCH_SPAN*100:notes.length-1;input.step=1;input.value=free?Math.round(e.x*PITCH_SPAN*100):notes.indexOf(noteFor(e.x));input.setAttribute('aria-valuetext',noteName(noteFor(e.x)));q('[data-value="pitch"]').textContent=noteName(noteFor(e.x));}
  function toggleStep(step){const e=selected();if(!e)return;remember();e.steps=e.steps.includes(step)?e.steps.filter(value=>value!==step):[...e.steps,step].sort((a,b)=>a-b);if(typeFor(e.type).sustained&&playingStep!==null&&heldOnStep(e,playingStep))activatedHeld.add(e.id);commit();}
  function syncPattern(){
    const e=selected(),held=!!(e&&typeFor(e.type).sustained),group=q('[data-steps]');group.hidden=false;
    if(group.children.length!==phraseLength){group.replaceChildren(...Array.from({length:phraseLength},(_,step)=>{const button=document.createElement('button');button.type='button';button.textContent=step+1;button.dataset.step=step;button.addEventListener('click',()=>toggleStep(step));return button;}));}
    for(const button of group.children){const step=Number(button.dataset.step);button.setAttribute('aria-pressed',String(!!e&&e.steps.includes(step)));button.setAttribute('aria-label','Доля '+(step+1)+(e?' для '+typeFor(e.type).name+' '+e.id:''));}
    q('[data-pattern-label]').textContent=held?'Непрерывно на долях':'Звучит на долях';
    const count=e?sourceSteps(e).length:0;
    q('[data-period]').textContent=!e?'':!count?'Нет отмеченных долей · предмет молчит':held?(count===phraseLength?'Вся фраза':patternLabel(e))+' · '+(count*60/bpm).toFixed(1)+' с за круг. Соседние доли звучат без прерывания.':patternLabel(e)+' · повтор по кругу';
  }
  function syncTimeline(){
    const timeline=q('[data-timeline]'),e=selected();
    if(timeline.children.length!==phraseLength){timeline.replaceChildren(...Array.from({length:phraseLength},(_,step)=>{const cell=document.createElement('li'),number=document.createElement('span'),count=document.createElement('small');cell.dataset.timelineStep=step;number.textContent=step+1;cell.append(number,count);return cell;}));}
    for(const cell of timeline.children){const step=Number(cell.dataset.timelineStep),items=scene().filter(source=>!source.muted&&sourceSteps(source).includes(step)),held=items.filter(source=>typeFor(source.type).sustained).length,hits=items.length-held;cell.querySelector('small').textContent=items.length?hits+(held?' + фон':''):'пауза';cell.dataset.selected=String(!!e&&!e.muted&&sourceSteps(e).includes(step));cell.setAttribute('aria-label','Доля '+(step+1)+': '+(items.length?'источников '+items.length+(held?', длинных нот '+held:''):'пауза'));}
    q('[data-phrase-label]').textContent='Фраза · '+phraseLength+' долей · ↻';syncPlayhead();
  }
  function syncPlayhead(){
    q('[data-playhead]').textContent=playingStep===null?'Начало фразы':(running?'Звучит':'Пауза')+' · '+(playingStep+1)+' / '+phraseLength;
    all('[data-timeline-step]').forEach(cell=>{const current=Number(cell.dataset.timelineStep)===playingStep;cell.dataset.playing=String(current);if(current)cell.setAttribute('aria-current','step');else cell.removeAttribute('aria-current');});
    all('[data-step]').forEach(button=>button.dataset.playing=String(Number(button.dataset.step)===playingStep));
  }
  function syncSources(){
    for(const [id,button] of sourceButtons){if(!scene().some(e=>e.id===id)){button.remove();sourceButtons.delete(id);}}
    for(const e of scene()){
      let button=sourceButtons.get(e.id);
      if(!button){button=document.createElement('button');button.type='button';button.className='ll-source';button.dataset.sourceId=String(e.id);button.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();button.focus({preventScroll:true});selectedId=e.id;openInspector('source');drag={id:e.id,pointer:event.pointerId,recorded:false};try{button.setPointerCapture(event.pointerId);}catch{}sync();});button.addEventListener('click',()=>{selectedId=e.id;openInspector('source');sync();persist();});button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace'].includes(event.key))return;event.preventDefault();selectedId=e.id;const current=selected();if(!current)return;if(event.key==='Delete'||event.key==='Backspace'){removeSource();return;}remember();if(event.key==='ArrowLeft')current.x=stepX(current.x,-1);if(event.key==='ArrowRight')current.x=stepX(current.x,1);if(event.key==='ArrowUp')current.y=clamp(current.y+.05,.08,.92);if(event.key==='ArrowDown')current.y=clamp(current.y-.05,.08,.92);commit();});sourceButtons.set(e.id,button);q('[data-sources]').appendChild(button);}
      const p=position(e);button.style.left=p.x+'px';button.style.top=p.y+'px';button.setAttribute('aria-pressed',String(e.id===selectedId));button.setAttribute('aria-label',typeFor(e.type).name+' '+e.id+', '+noteName(noteFor(e.x))+', громкость '+Math.round(e.y*100)+'%, '+patternLabel(e)+(e.muted?', приглушён':''));
    }
  }
  function sync(){
    q('[data-control="world"]').value=worldKey;q('[data-control="tempo"]').value=bpm;q('[data-control="phrase-length"]').value=phraseLength;
    q('[data-control="tonic"]').value=scale().tonic;q('[data-control="tonic"]').disabled=scale().mode==='free';q('[data-control="mode"]').value=scale().mode;q('[data-control="visualize"]').checked=showAudio;
    root.dataset.world=worldKey;root.classList.toggle('is-playing',running);q('[data-empty]').hidden=scene().length>0;q('[data-audio-status]').textContent=running?'Звучит':sound.context?'Пауза':'Готов к игре';root.classList.toggle('ll-audio-on',showAudio);q('[data-live-notes]').hidden=!showAudio;
    q('[data-grid-summary]').textContent=(scale().mode==='free'?'Плавная частота · без привязки':allowedNotes().length+' разрешённых позиций')+' · C3–C5';
    canvas.setAttribute('aria-label','Пейзаж: X задаёт высоту звука от C3 до C5, Y задаёт громкость. Кольца источников разделены на '+phraseLength+' долей фразы; доли предмета выделены. '+(scale().mode==='free'?'Свободное размещение.':'Привязка к '+modes[scale().mode].name+', тоника '+pitchNames[scale().tonic]+'.')+(showAudio?' Показаны звучащие ноты, частотный спектр и форма реального звука.':''));
    q('[data-action="play"]').textContent=running?'Пауза':'Играть';q('[data-action="play"]').setAttribute('aria-pressed',String(running));
    const palette=q('[data-palette]');
    if(palette.dataset.world!==worldKey){
      palette.dataset.world=worldKey;
      palette.replaceChildren(...world().types.map(t=>{
        const b=document.createElement('button');b.type='button';b.dataset.type=t.id;
        const icon=document.createElement('canvas');icon.width=96;icon.height=96;icon.setAttribute('aria-hidden','true');
        const info=document.createElement('span');info.className='tool-info';
        const name=document.createElement('span');name.className='tool-name';name.textContent=t.name;
        const channel=document.createElement('small');channel.textContent=t.sustained?'Непрерывная нота':t.voice;
        info.append(name,channel);b.append(icon,info);
        b.addEventListener('click',()=>{tool=t.id;sync();persist();status(t.name+': нанеси на свободное место холста');});
        drawToolIcon(icon,t.id);return b;
      }));
    }
    all('[data-type]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.type===tool));drawToolIcon(button.querySelector('canvas'),button.dataset.type);});
    q('[data-brush-name]').textContent=typeFor(tool).name;
    const sourceSelect=q('[data-control="source"]');sourceSelect.replaceChildren(...scene().map(e=>{const option=document.createElement('option');option.value=e.id;option.textContent=typeFor(e.type).name+' '+e.id;return option;}));sourceSelect.disabled=!scene().length;sourceSelect.value=selectedId||'';q('[data-action="audition"]').disabled=!selected();drawToolIcon(q('[data-selected-icon]'),selected()?.type||tool);
    const e=selected();q('[data-editor-fields]').disabled=!e;q('[data-selection]').textContent=e?['Синт 1','Синт 2','Барабаны'][sourceChannel(e)]+' · '+(e.muted?'приглушён':typeFor(e.type).sustained?'непрерывно':'активен'):'Выбери предмет внизу';
    if(e){syncPitchEditor();q('[data-control="volume"]').value=Math.round(e.y*100);q('[data-value="volume"]').textContent=Math.round(e.y*100)+'%';q('[data-action="mute"]').textContent=e.muted?'Вернуть звук':'Приглушить';q('[data-action="mute"]').setAttribute('aria-pressed',String(e.muted));}
    syncPattern();syncTimeline();q('[data-control="wave1"]').value=waveforms[worldKey][0];q('[data-control="wave2"]').value=waveforms[worldKey][1];syncParameters();resize();
  }
  function resize(){
    const rect=stage.getBoundingClientRect();w=rect.width;h=rect.height;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    geom={left:w<500?48:76,right:w-38,top:40,bottom:h-62};
    const axisY=q('.figma-axis-y'),axisX=q('.figma-axis-x');
    axisY.style.left=(geom.left-81.0036*.16/2)+'px';axisY.style.top=geom.top+'px';axisY.style.transform='scale(.16,'+((geom.bottom-geom.top)/734.5)+')';
    axisX.style.left=geom.right+'px';axisX.style.top=(geom.bottom-81.0036*.16/2)+'px';axisX.style.transform='scale('+((geom.right-geom.left)/1356.5)+',.16)';
    q('[data-timeline]').style.gridTemplateColumns='repeat('+phraseLength+',minmax(26px,1fr))';
    syncSources();paint();
  }
  function drawToolIcon(target,type){
    const icon=target.getContext('2d');icon.clearRect(0,0,target.width,target.height);
    icon.save();icon.translate(target.width/2,target.height/2);const size=target.width*.22;
    icon.fillStyle=typeColor(type);icon.strokeStyle=typeColor(type);icon.lineWidth=target.width*.035;icon.lineCap='round';
    icon.beginPath();
    if(type==='drop'||type==='comet'){icon.moveTo(0,-size);icon.bezierCurveTo(size*1.3,size*.3,size*.75,size*1.1,0,size*1.1);icon.bezierCurveTo(-size*.75,size*1.1,-size*1.3,size*.3,0,-size);icon.fill();if(type==='comet'){icon.globalAlpha=.5;icon.beginPath();icon.moveTo(-size*.3,-size*.4);icon.lineTo(-size*1.3,-size*1.7);icon.stroke();}}
    else if(type==='leaf'){icon.rotate(.5);icon.ellipse(0,0,size*.68,size*1.25,0,0,Math.PI*2);icon.fill();icon.strokeStyle='#fff9';icon.lineWidth=target.width*.018;icon.beginPath();icon.moveTo(0,size);icon.lineTo(0,-size*.75);icon.stroke();}
    else if(type==='raven'){icon.moveTo(-size*1.45,-size*.4);icon.quadraticCurveTo(-size*.4,-size*.8,0,size*.25);icon.quadraticCurveTo(size*.4,-size*.8,size*1.45,-size*.4);icon.stroke();}
    else if(type==='fog'||type==='aurora'){for(let i=0;i<3;i++){icon.globalAlpha=1-i*.2;icon.beginPath();icon.moveTo(-size*1.2,-size*.6+i*size*.6);icon.quadraticCurveTo(0,-size*1.1+i*size*.6,size*1.2,-size*.6+i*size*.6);icon.stroke();}}
    else if(type==='star'){for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?size*.35:size*1.2;icon.lineTo(Math.cos(a)*r,Math.sin(a)*r);}icon.closePath();icon.fill();}
    else {for(let i=0;i<7;i++){const a=i/7*Math.PI*2,r=size*(i%2?.8:1.1);icon.lineTo(Math.cos(a)*r,Math.sin(a)*r);}icon.closePath();icon.fill();}
    icon.restore();
  }
  function mark(type,x,y,size,color,rotation=0){ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();if(type==='fog'||type==='aurora'){ctx.ellipse(0,-size*.35,size*1.4,size*.3,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(size*.25,size*.4,size*1.1,size*.3,0,0,Math.PI*2);ctx.fill();}else if(type==='drop'||type==='comet'){ctx.moveTo(0,-size);ctx.bezierCurveTo(size,size*.1,size*.65,size,-0,size);ctx.bezierCurveTo(-size*.65,size,-size,size*.1,0,-size);ctx.fill();if(type==='comet'){ctx.globalAlpha=.4;ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(-size*.6,-size*3);ctx.stroke();}}else if(type==='leaf'){ctx.ellipse(0,0,size*.65,size,rotation+.7,0,Math.PI*2);ctx.fill();}else if(type==='raven'){ctx.moveTo(-size*1.4,-size*.5);ctx.lineTo(-size*.6,0);ctx.lineTo(0,-size*.4);ctx.lineTo(size*.6,0);ctx.lineTo(size*1.4,-size*.5);ctx.stroke();}else if(type==='star'){for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?size*.3:size;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();}else{for(let i=0;i<7;i++){const a=i/7*Math.PI*2,r=size*(i%2?.8:1);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();}ctx.restore();}
  function paintGrid(theme){
    const notes=allowedNotes(),width=geom.right-geom.left,step=width/PITCH_SPAN,free=scale().mode==='free',voices=showAudio?sound.sounding():[];
    ctx.save();ctx.beginPath();ctx.rect(geom.left,geom.top,width,geom.bottom-geom.top);ctx.clip();
    for(const note of notes){const x=geom.left+(note-PITCH_MIN)/PITCH_SPAN*width;ctx.fillStyle=theme.color;ctx.globalAlpha=free?.006:.012;ctx.fillRect(x-step*.3,geom.top,step*.6,geom.bottom-geom.top);ctx.strokeStyle=theme.color;ctx.globalAlpha=free?.03:.08;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,geom.top);ctx.lineTo(x,geom.bottom);ctx.stroke();}
    if(showAudio)for(const voice of voices){const x=geom.left+(voice.note-PITCH_MIN)/PITCH_SPAN*width;ctx.fillStyle=theme.color;ctx.globalAlpha=voice.channel===2?.07:.15;ctx.fillRect(x-Math.max(2,step*.25),geom.top,Math.max(4,step*.5),geom.bottom-geom.top);}
    ctx.restore();ctx.fillStyle=theme.color;ctx.strokeStyle=theme.color;ctx.font='11px -apple-system,BlinkMacSystemFont,sans-serif';ctx.textAlign='center';
    for(const note of notes){const x=geom.left+(note-PITCH_MIN)/PITCH_SPAN*width;ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(x,geom.bottom);ctx.lineTo(x,geom.bottom+5);ctx.stroke();}ctx.globalAlpha=1;
    const selectedNote=selected()?noteFor(selected().x):null,active=voices.filter(v=>v.channel<2).map(v=>v.note),candidates=[...notes];
    for(const note of active)if(!candidates.some(n=>Math.abs(n-note)<.001))candidates.push(note);
    candidates.sort((a,b)=>{const priority=n=>Math.abs(n-selectedNote)<.001?0:active.some(v=>Math.abs(v-n)<.001)?1:n%12===0?2:3;return priority(a)-priority(b)||a-b;});
    const labels=[];for(const note of candidates){const text=noteName(note),tw=ctx.measureText(text).width,x=clamp(geom.left+(note-PITCH_MIN)/PITCH_SPAN*width,geom.left+tw/2,geom.right-tw/2),left=x-tw/2,right=x+tw/2;if(labels.some(label=>left<label.right+7&&right>label.left-7))continue;labels.push({left,right});ctx.globalAlpha=active.some(v=>Math.abs(v-note)<.001)?1:.65;ctx.fillText(text,x,geom.bottom+19);}ctx.globalAlpha=1;
  }
  function paintAudio(theme){
    if(!showAudio)return;const width=geom.right-geom.left;
    ctx.save();ctx.strokeStyle=theme.color;ctx.fillStyle=theme.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(geom.left,geom.bottom);
    for(let pixel=0;pixel<=width;pixel+=3){const energy=sound.energyAt(PITCH_MIN+pixel/width*PITCH_SPAN);ctx.lineTo(geom.left+pixel,geom.bottom-energy*58);}ctx.lineTo(geom.right,geom.bottom);ctx.globalAlpha=.65;ctx.stroke();ctx.lineTo(geom.left,geom.bottom);ctx.closePath();ctx.globalAlpha=.08;ctx.fill();ctx.globalAlpha=1;
    // The waveform lives inside the painting; toggling it never resizes the field.
    const center=geom.top+(geom.bottom-geom.top)*.6,samples=sound.samples;let start=0;
    if(samples){start=samples.length-1024;for(let i=samples.length-2048;i<samples.length-1024;i++)if(samples[i]<=0&&samples[i+1]>0){start=i;break;}}
    ctx.beginPath();for(let pixel=0;pixel<=width;pixel+=2){const value=samples?.[start+Math.floor(pixel/width*1023)]||0,x=geom.left+pixel,y=center-clamp(value*4,-1,1)*Math.min(60,(geom.bottom-geom.top)*.15);if(pixel===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    ctx.globalAlpha=.22;ctx.lineWidth=1;ctx.stroke();ctx.restore();
    const voices=sound.sounding(),notes=[...new Set(voices.filter(v=>v.channel<2).sort((a,b)=>a.note-b.note).map(v=>noteName(v.note)))],percussion=voices.some(v=>v.channel===2),text='Сейчас: '+([...notes,...(percussion?['перкуссия']:[])].join(', ')||'тишина');if(q('[data-live-notes]').textContent!==text)q('[data-live-notes]').textContent=text;
  }
  function phraseClock(){
    if(playingStep===null||playingStepAt===null)return {step:null,fraction:0};
    const duration=phraseEvents.length?phraseEvents[0].at-playingStepAt:60/bpm;
    return {step:playingStep,fraction:clamp((elapsed-playingStepAt)/Math.max(.001,duration),0,1)};
  }
  function ringSegments(source){
    const clock=phraseClock(),steps=sourceSteps(source);
    return Array.from({length:phraseLength},(_,step)=>({step,active:steps.includes(step),fill:clock.step===null?0:step<clock.step?1:step===clock.step?clock.fraction:0}));
  }
  function paintSourceRing(source,p,theme,isSelected){
    const segments=ringSegments(source),angle=2*Math.PI/phraseLength,gap=phraseLength===1?0:Math.min(.11,angle*.28),opacity=source.muted?.35:1;
    ctx.save();ctx.strokeStyle=typeColor(source.type);ctx.lineCap='butt';
    for(const segment of segments){
      const from=-Math.PI/2+segment.step*angle+gap/2,to=from+angle-gap,fill=reducedMotion.matches?Math.floor(segment.fill):segment.fill;
      ctx.lineWidth=segment.active?(isSelected?3.5:3):1.5;ctx.globalAlpha=opacity*(segment.active?.42:.16);
      ctx.beginPath();ctx.arc(p.x,p.y,25,from,to);ctx.stroke();
      if(fill>0){ctx.lineWidth=segment.active?(isSelected?4:3.5):2;ctx.globalAlpha=opacity*(segment.active?.95:.36);ctx.beginPath();ctx.arc(p.x,p.y,25,from,from+(to-from)*fill);ctx.stroke();}
    }
    ctx.restore();
  }
  function paint(){
    if(!w)return;const theme=world();ctx.clearRect(0,0,w,h);const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,theme.bg);sky.addColorStop(1,worldKey==='autumn'?'#e4ead7':'#ddddec');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    ctx.fillStyle=theme.hill;ctx.globalAlpha=.2;ctx.beginPath();ctx.moveTo(geom.left,geom.bottom);for(let x=geom.left;x<=geom.right;x+=8)ctx.lineTo(x,geom.bottom-22-Math.sin(x/100)*16-Math.cos(x/65)*8);ctx.lineTo(geom.right,geom.bottom);ctx.closePath();ctx.fill();ctx.globalAlpha=1;
    if(worldKey==='space'){ctx.fillStyle=theme.color;ctx.globalAlpha=.18;for(let i=0;i<24;i++){const x=geom.left+((i*73)%Math.max(1,Math.round(geom.right-geom.left))),y=geom.top+((i*47)%Math.max(1,Math.round(geom.bottom-geom.top-35)));ctx.fillRect(x,y,2,2);}ctx.globalAlpha=1;}
    paintGrid(theme);paintAudio(theme);
    
    ctx.fillStyle=theme.color;ctx.font='11px -apple-system,BlinkMacSystemFont,sans-serif';ctx.textAlign='left';ctx.save();ctx.translate(22,(geom.top+geom.bottom)/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.globalAlpha=.5;ctx.fillText('ГРОМКОСТЬ',0,0);ctx.restore();ctx.globalAlpha=.55;ctx.fillText('низкие',geom.left,geom.bottom+38);ctx.textAlign='right';ctx.fillText('высокие · X',geom.right,geom.bottom+38);ctx.globalAlpha=1;
    const e=selected();if(e){const p=position(e);ctx.strokeStyle=theme.color;ctx.globalAlpha=.25;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(geom.left,p.y);ctx.lineTo(p.x,p.y);ctx.lineTo(p.x,geom.bottom);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}
    for(const source of scene()){
      const p=position(source),selected=source.id===selectedId,held=!!typeFor(source.type).sustained;
      if(held&&running&&activatedHeld.has(source.id)&&heldOnStep(source,playingStep)&&!source.muted){ctx.fillStyle=theme.color;ctx.globalAlpha=.1;ctx.fillRect(p.x-7,p.y,14,geom.bottom-p.y);ctx.globalAlpha=.5;ctx.beginPath();ctx.ellipse(p.x,geom.bottom,18,4,0,0,Math.PI*2);ctx.fill();}
      ctx.save();ctx.fillStyle='#fff';ctx.globalAlpha=source.muted?.1:selected?.62:.32;ctx.beginPath();ctx.arc(p.x,p.y,21,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.globalAlpha=1;paintSourceRing(source,p,theme,selected);
      ctx.globalAlpha=source.muted?.35:.9;mark(source.type,p.x,p.y,10,typeColor(source.type));ctx.globalAlpha=1;
    }
    for(const p of particles){const progress=clamp((elapsed-p.start)/FALL_TIME,0,1),origin=position(p);let x=origin.x;const y=origin.y+(geom.bottom-origin.y)*progress;if(p.type==='leaf')x+=Math.sin(progress*Math.PI*3)*12*Math.sin(progress*Math.PI);if(p.type==='raven')x+=Math.sin(progress*Math.PI)*35;if(p.type==='comet')x-=Math.sin(progress*Math.PI)*22;ctx.globalAlpha=p.muted?.2:.95;mark(p.type,x,y,8,typeColor(p.type),p.type==='leaf'?progress*3:0);ctx.globalAlpha=1;}
    for(const r of ripples){const phase=(elapsed-r.start)/.4,p=position(r);ctx.globalAlpha=(1-phase)*.55;ctx.strokeStyle=theme.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,geom.bottom,6+phase*24,2+phase*8,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    if(ghost&&!drag){const p=position(ghost);ctx.globalAlpha=.4;mark(tool,p.x,p.y,10,typeColor(tool));ctx.strokeStyle=typeColor(tool);ctx.lineWidth=1;ctx.setLineDash([2,4]);ctx.beginPath();ctx.arc(p.x,p.y,25,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}
  }
  function frame(now){
    lastTime=now;
    if(running){
      const clock=sound.context?.state==='running'?sound.context.currentTime-audioAnchor:now/1000-wallAnchor,dt=Math.max(0,clock-elapsed);elapsed=Math.max(elapsed,clock);beat+=dt*bpm/60;
      while(beat+1e-7>=nextPhraseBeat){
        const step=nextPhraseBeat%phraseLength,start=elapsed-(beat-nextPhraseBeat)/(bpm/60);phraseEvents.push({step,at:start+FALL_TIME,heldScheduled:false});
        for(const e of scene()){
          const held=!!typeFor(e.type).sustained,active=heldOnStep(e,step),previous=(step+phraseLength-1)%phraseLength;
          const enters=held?active&&(!heldOnStep(e,previous)||!activatedHeld.has(e.id))&&!particles.some(p=>p.id===e.id&&!p.done):active;
          if(enters)particles.push({...e,note:noteFor(e.x),start,step,group:nextPhraseBeat,done:false,scheduled:false});
        }
        nextPhraseBeat++;
      }
      const audioNow=sound.context?.currentTime||0;
      for(const event of phraseEvents)if(!event.heldScheduled&&event.at-elapsed<=.05){
        sound.scheduleHeldStep(event.step,Math.max(audioNow+.003,audioAnchor+event.at));event.heldScheduled=true;
      }
      for(const p of particles){
        const source=scene().find(e=>e.id===p.id),due=p.start+FALL_TIME;
        if(!p.done&&!p.scheduled&&source&&!source.muted&&due-elapsed<=.05){p.audioAt=Math.max(audioNow+.003,audioAnchor+due);if(!typeFor(p.type).sustained)sound.hit({...p,sound:source.sound},p.audioAt);p.scheduled=true;}
        if(!p.done&&elapsed+1e-7>=due){p.done=true;if(source&&!source.muted&&heldOnStep(source,p.step)){stats.hits.push({id:p.id,type:p.type,note:p.note,volume:p.y,at:due,audioAt:p.audioAt,step:p.step,group:p.group,sustained:!!typeFor(p.type).sustained,channel:typeFor(p.type).voice});if(stats.hits.length>96)stats.hits.shift();ripples.push({x:p.x,y:0,start:elapsed});}}
      }
      while(phraseEvents.length&&elapsed+1e-7>=phraseEvents[0].at){const event=phraseEvents.shift();playingStep=event.step;playingStepAt=event.at;for(const e of scene())if(typeFor(e.type).sustained&&heldOnStep(e,event.step))activatedHeld.add(e.id);sound.syncHeld();syncPlayhead();}
      particles=particles.filter(p=>elapsed-p.start<FALL_TIME+.03);ripples=ripples.filter(r=>elapsed-r.start<.4);
    }
    if(running||(sound.context&&sound.active.size)||(showAudio&&sound.context)){
      stats.peak=Math.max(stats.peak,sound.readPeak());
      const meter=q('.output-indicator');meter.dataset.level=sound.peak.toFixed(4);meter.setAttribute('aria-label','Уровень выхода '+Math.round(sound.peak*100)+'%');
      [...meter.children].forEach((bar,i)=>{bar.style.height=(3+Math.min(1,sound.peak*8)*(i===2?9:i%2?6:3))+'px';});
      paint();
    }
    requestAnimationFrame(frame);
  }
  canvas.addEventListener('pointermove',event=>{ghost=inField(event)?coordinates(event):null;if(ghost)ghost.x=snapX(ghost.x);if(!running)paint();});canvas.addEventListener('pointerleave',()=>{ghost=null;if(!running)paint();});
  canvas.addEventListener('click',event=>{if(!inField(event))return;const p=coordinates(event);addSource(tool,p.x,p.y);});
  canvas.tabIndex=0;
  canvas.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const p=ghost||{x:.5,y:.5};addSource(tool,p.x,p.y);}});
  window.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointer)return;const e=scene().find(e=>e.id===drag.id);if(!e)return;const p=coordinates(event);if(!drag.recorded){if(Math.abs(e.x-p.x)<.005&&Math.abs(e.y-p.y)<.01)return;remember();drag.recorded=true;}e.x=snapX(p.x);e.y=p.y;sound.syncHeld();syncSources();syncPitchEditor();q('[data-control="volume"]').value=Math.round(e.y*100);q('[data-value="volume"]').textContent=Math.round(e.y*100)+'%';paint();});
  window.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointer){drag=null;commit();}});window.addEventListener('pointercancel',()=>{if(drag){drag=null;commit();}});
  q('[data-control="source"]').addEventListener('change',event=>{selectedId=Number(event.target.value);commit();});
  for(const key of ['pitch','volume']){const input=q('[data-control="'+key+'"]');input.addEventListener('pointerdown',()=>remember());input.addEventListener('keydown',()=>remember());input.addEventListener('input',()=>{const e=selected();if(!e)return;if(key==='pitch')e.x=scale().mode==='free'?Number(input.value)/(PITCH_SPAN*100):(allowedNotes()[Number(input.value)]-PITCH_MIN)/PITCH_SPAN;else e.y=Number(input.value)/100;commit();});}
  q('[data-action="mute"]').addEventListener('click',()=>{const e=selected();if(!e)return;remember();e.muted=!e.muted;if(e.muted){sound.stopSource(e.id);particles.filter(p=>p.id===e.id&&!p.done).forEach(p=>p.scheduled=false);}commit();});q('[data-action="duplicate"]').addEventListener('click',()=>{const e=selected();if(e)addSource(e.type,stepX(e.x,1),e.y,e);});q('[data-action="delete"]').addEventListener('click',removeSource);
  q('[data-action="clear"]').addEventListener('click',()=>{remember();scenes[worldKey]=[];particles=[];ripples=[];activatedHeld.clear();sound.stop();selectedId=null;commit();status('Сцена очищена. Отменить вернёт источники');});
  q('[data-action="undo"]').addEventListener('click',()=>{const previous=history.pop();if(!previous)return;restore(previous);resetTransport();q('[data-action="undo"]').disabled=!history.length;commit();status('Последнее изменение отменено · фраза с начала');});
  q('[data-action="restart"]').addEventListener('click',()=>{resetTransport();sync();status('Фраза с первой доли');});
  q('[data-control="world"]').addEventListener('change',event=>setWorld(event.target.value));for(const action of ['previous-world','next-world'])q('[data-action="'+action+'"]').addEventListener('click',()=>setWorld(worldKey==='autumn'?'space':'autumn'));
  q('[data-control="tonic"]').addEventListener('change',event=>setScale('tonic',Number(event.target.value)));q('[data-control="mode"]').addEventListener('change',event=>setScale('mode',event.target.value));
  q('[data-control="visualize"]').addEventListener('change',event=>{showAudio=event.target.checked;sound.readPeak();commit();});
  q('[data-control="tempo"]').addEventListener('change',event=>{bpm=clamp(Math.round(Number(event.target.value)||80),45,160);commit();});
  q('[data-control="phrase-length"]').addEventListener('change',event=>{const length=clamp(Math.round(Number(event.target.value)||8),1,32);if(length!==phraseLength){remember();phraseLength=length;resetTransport();commit();status('Длина фразы: '+phraseLength+' долей. Отметки за её пределами сохранены');}else event.target.value=phraseLength;});
  q('[data-action="example"]').addEventListener('click',()=>{
    remember();phraseLength=8;scaleSettings[worldKey]={tonic:0,mode:'major'};tool=world().types[0].id;
    const notes=[60,64,67,62,67,71],heights=[.8,.65,.5,.72,.32,.58];
    scenes[worldKey]=notes.map((note,index)=>({id:nextId++,type:tool,x:(note-PITCH_MIN)/PITCH_SPAN,y:heights[index],steps:index<3?[0,2,4,6]:[1,3,5,7],muted:false,sound:cleanSourceSettings({},tool)}));
    scene().push({id:nextId++,type:world().types[3].id,x:0,y:.24,steps:allPhraseSteps(),muted:false,sound:cleanSourceSettings({},world().types[3].id)},{id:nextId++,type:world().types[2].id,x:5/PITCH_SPAN,y:.16,steps:[0,2,4,6],muted:false,sound:cleanSourceSettings({},world().types[2].id)});selectedId=scene()[0].id;
    resetTransport();commit();status('C–G: две группы по три ноты, длинная нота и перкуссия. Отменить вернёт твою фразу');
  });
  for(let i=0;i<2;i++)q('[data-control="wave'+(i+1)+'"]').addEventListener('change',event=>{remember();waveforms[worldKey][i]=event.target.value;commit();});
  for (const button of all('[data-inspector-tab]')) {
    button.addEventListener('click', () => openInspector(button.dataset.inspectorTab));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); const tab = ['Home','ArrowLeft'].includes(event.key) ? 'source' : 'sound'; openInspector(tab); q('[data-inspector-tab="'+tab+'"]').focus();
    });
  }
  for (const input of all('[data-source-param], [data-sound-param]')) {
    const sourceInput = !!input.dataset.sourceParam, key = input.dataset.sourceParam || input.dataset.soundParam;
    input.addEventListener('pointerdown', () => remember());
    input.addEventListener('keydown', event => { if (event.key.startsWith('Arrow')) remember(); });
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (input.tagName === 'SELECT') remember();
      const value = input.tagName === 'SELECT' ? key === 'octave' ? Number(input.value) : input.value : Number(input.value);
      if (sourceInput) { if (!selected()) return; selected().sound[key] = value; } else setPath(mix(), key, value);
      commit();
    });
  }
  q('[data-action="audition"]').addEventListener('click', async () => {
    const button=q('[data-action="audition"]');button.disabled=true;
    try { await sound.init();const e=selected();if(e){if(running&&typeFor(e.type).sustained&&sound.held.has(e.id))sound.syncHeld();else sound.hit({...e,note:noteFor(e.x)},sound.context.currentTime+.01,true);status('Прослушивание: '+typeFor(e.type).name);}} catch(error){status(error.message);} finally {button.disabled=!selected();}
  });
  q('[data-action="place-center"]').addEventListener('click',()=>addSource(tool,.5,.5));
  q('[data-action="fullscreen"]').addEventListener('click',async()=>{
    try { if(document.fullscreenElement)await document.exitFullscreen();else if(root.requestFullscreen)await root.requestFullscreen();else status('Окно инструмента уже занимает весь экран страницы'); } catch {status('Полноэкранный режим недоступен в этом браузере');}
  });
  window.addEventListener('keydown',event=>{
    if(event.isComposing || event.target.closest('input,select,textarea,button,[contenteditable]'))return;
    if(event.code==='Space'){event.preventDefault();q('[data-action="play"]').click();}
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();q('[data-action="undo"]').click();}
    if(event.key==='Escape'){ghost=null;paint();}
  });
  function pause(){running=false;sound.stop();for(const event of phraseEvents)event.heldScheduled=false;particles.filter(p=>!p.done).forEach(p=>p.scheduled=false);sync();}
  q('[data-action="play"]').addEventListener('click',async()=>{const button=q('[data-action="play"]');button.disabled=true;try{if(running){pause();status('Пауза: позиция во фразе сохранена');}else{try{await sound.init();}catch(error){status(error.message);return;}status('Фраза по кругу · предметы одной доли касаются земли вместе');anchorClock();running=true;sound.syncHeld();sync();}}finally{button.disabled=false;}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){pause();status('Пауза');}});
  window.addEventListener('openai:set_globals',event=>{const saved=event.detail?.globals?.widgetState?.privateContent;if(!saved||JSON.stringify(saved)===lastPersisted)return;running=false;restore(saved);lastPersisted=null;resetTransport();sync();});
  root.__landscapeLab={state:()=>({...serial(),running,elapsed,beat,playingStep,nextPhraseBeat,phraseClock:phraseClock(),rings:scene().map(source=>({id:source.id,segments:ringSegments(source)})),pitch:{min:PITCH_MIN,max:PITCH_MAX,allowed:allowedNotes(),free:scale().mode==='free'},particles:particles.map(p=>({id:p.id,x:p.x,y:p.y,note:p.note,start:p.start,step:p.step,group:p.group})),hits:[...stats.hits],activeNotes:sound.sounding().map(v=>({...v,name:v.channel===2?'перкуссия':noteName(v.note)})),audioState:sound.context?.state||'off',audioPeak:stats.peak,visualization:{enabled:showAudio,wavePeak:sound.peak,spectrumPeak:sound.spectrum?Math.max(...sound.spectrum):0}}),geometry:()=>({...geom,w,h}),audioSettings:()=>clone(mix())};
  reducedMotion.addEventListener('change',paint);openInspector('source');sync();new ResizeObserver(resize).observe(stage);resize();requestAnimationFrame(frame);
})();

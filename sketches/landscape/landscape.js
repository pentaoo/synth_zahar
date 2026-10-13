
(() => {
  'use strict';
  const STORAGE_KEY = 'landscape-mechanics-v1';
  const layoutFiles = window.LandscapeFiles;
  const compositionTools = window.CompositionTools;
  const instruments = window.LandscapeInstruments;
  const score=window.PerformanceScore;
  let performancePatch=clonePerformancePatch(score.patchDefaults),performanceUI=null,liveUI=null,liveEditorOpen=false;
  function clonePerformancePatch(value){return JSON.parse(JSON.stringify(value));}
  let paletteCategory = 'waves', paletteLayer = null, toolInstrument = 'default';
  const selectionTools = window.SelectionTools;
  let selectedSourceIds=new Set([1]),selectedPhraseKeys=new Set(),phraseSelectionCleared=false,compositionSourceFilter='all',marquee=null,ignoreSurfaceClickUntil=0;
  let layoutName = '';
  const MAX_FIELDS = 16;
  let fields = [], activeFieldId = 1, queuedFieldId = null, sequenceEnabled = true, fieldCycle = 0, renderedFields = null;
  let selectedFieldId = 1, fieldDrag = null, ignoreFieldClickUntil = 0;
  let layers = [], selectedLayerId = 1, currentLayerId = 1, compositionTempo = 96, cycleBeats = 32, renderedLayers = null, audioHost = null, pendingPersistence = false;
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
  let scaleSettings={autumn:{tonic:0,mode:'majorPent'},space:{tonic:0,mode:'minorPent'}}, showAudio=true;
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

  const SOURCE_DEFAULTS = { gain: 1, pan: 0, octave: 0, detune: 0, duration: .28, attack: .01, decay: .18, sustain: .35, release: .25, brightness: 5000, channel: 'auto', instrument: 'default', wave: 'auto', noise: 0, fm: 0, harmonicity: 2, sub: 0, vibrato: 0, motion: 0, lfoRate: 3, pulse: 0, drive: 0 };
  const clone = value => JSON.parse(JSON.stringify(value));
  const MIX_DEFAULTS = { master: .36, threshold: -18, ratio: 4, swing: 0,
    voices: [{gain: .85, pan: 0, detune: 0}, {gain: .75, pan: 0, detune: 7}],
    drums: {gain: .8, pan: 0, decay: .18, tone: .7, noise: .3},
    effects: {
      synth: {brightness: 6000, drive: .08, delayMix: .1, delayTime: .25, feedback: .2, reverbMix: .16, room: 1.6},
      drum: {brightness: 8000, drive: .04, delayMix: .08, delayTime: .125, feedback: .12, reverbMix: .08, room: 1.1}
    }
  };
  let soundSettings = {autumn: clone(MIX_DEFAULTS), space: clone(MIX_DEFAULTS)};
  const mix = () => soundSettings[worldKey];
  const sourceChannel = e => typeFor(e.type).sustained ? 1 : e.sound.channel === 'auto' ? (instruments.get(e.sound.instrument)?.channel ?? typeFor(e.type).channel) : Number(e.sound.channel);
  const sourceName = e => {const preset=instruments.get(e.sound.instrument),name=preset?.name||typeFor(e.type).name,wave=instruments.waveNames[e.sound.wave];return preset?.category==='waves'&&wave&&wave!==name?name+' → '+wave:name;};
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
    if (value.instrument === 'default' || instruments.get(value.instrument)) settings.instrument = value.instrument;
    if (['auto','sine','triangle','sawtooth','square','noise'].includes(value.wave)) settings.wave = value.wave;
    if(value.noise===undefined&&['raven','asteroid'].includes(type))settings.noise=1;
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
  let inspectorTab = 'source', editorView = 'field';
  function openInspector(tab) {
    if(inspectorTab!==tab)q('.inspector-scroll').scrollTop=0;
    inspectorTab = tab;
    all('[data-inspector-tab]').forEach(button => { const active = button.dataset.inspectorTab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    for(const name of ['source','sound','layouts'])q('#'+name+'-panel').hidden=tab!==name;
  }
  function formatParameter(key, value) {
    if(key==='wave')return {auto:'По синту',sine:'Синус',triangle:'Треугольник',sawtooth:'Пила',square:'Квадрат',noise:'Белый шум'}[value]||value;
    if(key==='channel')return {auto:'По предмету',0:'Синт 1',1:'Синт 2',2:'Барабаны'}[value]||value;
    if(key==='octave')return (value>=0?'+':'')+value;
    if (key.endsWith('pan')) return Math.abs(value) < .01 ? 'Центр' : (value < 0 ? 'L ' : 'R ') + Math.round(Math.abs(value) * 100) + '%';
    if (key.endsWith('brightness')) return value >= 1000 ? (value / 1000).toFixed(1) + ' кГц' : value + ' Гц';
    if (key.endsWith('detune')) return (value > 0 ? '+' : '') + value + ' ц';
    if (key.endsWith('threshold')) return value + ' дБ';
    if (key.endsWith('ratio')) return value + ':1';
    if (/duration|attack|decay|release|delayTime|room/.test(key)) return value < 1 ? Math.round(value * 1000) + ' мс' : value.toFixed(1) + ' с';
    if (key==='harmonicity')return value.toFixed(2)+'×';
    if (key==='fm')return value.toFixed(2);
    if (key==='lfoRate')return value.toFixed(1)+' Гц';
    if (key==='vibrato')return Math.round(value)+' ц';
    if (key.endsWith('tone')) return value.toFixed(2) + '×';
    return Math.round(value * 100) + '%';
  }
  function syncParameters() {
    const entries=editingSources(),targets=editingFields();
    const instrumentSelect=q('[data-control="instrument"]');
    controlState(instrumentSelect,entries.length?entries.map(entry=>entry.source.sound?.instrument || 'default'):['default']);
    instrumentSelect.disabled=!entries.length;
    for(const input of all('[data-source-param]')){
      const key=input.dataset.sourceParam,values=entries.length?entries.map(entry=>entry.source.sound?.[key]??SOURCE_DEFAULTS[key]):[SOURCE_DEFAULTS[key]];
      controlState(input,values,q('[data-output="source:'+key+'"]'),value=>formatParameter(key,value));
      input.disabled=!entries.length||entries.some(entry=>typeFor(entry.source.type).sustained&&['channel','duration'].includes(key))||(key==='wave'&&entries.some(entry=>sourceChannel(entry.source)===2));
    }
    for(const input of all('[data-sound-param]')){
      const key=input.dataset.soundParam,values=targets.map(target=>{try{return getPath(target.snapshot.soundSettings.autumn,key)??getPath(MIX_DEFAULTS,key);}catch{return getPath(MIX_DEFAULTS,key);}});
      controlState(input,values,q('[data-output="sound:'+key+'"]'),value=>formatParameter(key,value));
    }
  }
  class Sound {
    constructor() {
      this.context = null;
      this.active = new Set();
      this.voices = new Map();
      this.held = new Map();
      this.peak = 0;
      this.displayPeak = 0;
      this.layerGain = 1; this.muted = false; this.previewSuppressed = false;
    }
    async init(shared = null) {
      if (this.context) { this.configure(); await this.context.resume(); return; }
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioClass) throw new Error('Этот браузер не поддерживает Web Audio');
      this.context = shared?.context || new AudioClass({ latencyHint: 'interactive' });
      const c = this.context;
      this.master = c.createGain();
      this.compressor = shared?.compressor || c.createDynamicsCompressor();
      this.compressor.knee.value = 12;
      this.compressor.attack.value = .005;
      this.compressor.release.value = .18;
      this.meter = shared?.meter || c.createAnalyser();
      this.meter.fftSize = 16384;
      this.meter.minDecibels = -72;
      this.meter.maxDecibels = -24;
      this.meter.smoothingTimeConstant = .2;
      this.samples = shared?.samples || new Float32Array(this.meter.fftSize);
      this.spectrum = shared?.spectrum || new Uint8Array(this.meter.frequencyBinCount);
      this.master.connect(this.compressor);
      if(!shared)this.compressor.connect(this.meter).connect(c.destination);
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
    configure(when = this.context?.currentTime, updateOutput = true) {
      if (!this.context) return;
      const now = when, base=mix(),patch=typeof performancePatch==='undefined'?null:performancePatch;
      const config=patch?{...base,master:patch.master,effects:{...base.effects,synth:{...base.effects.synth,drive:patch.drive,delayMix:patch.echo,reverbMix:patch.space}}}:base;
      this.master.gain.setTargetAtTime(this.muted||this.previewSuppressed?0:config.master*this.layerGain, now, .02);
      if(updateOutput){this.compressor.threshold.setTargetAtTime(config.threshold, now, .02);this.compressor.ratio.setTargetAtTime(config.ratio, now, .02);}
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
      this.syncLiveVoices();
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
      if (this.muted || !this.context || this.context.state !== 'running') return;
      const kind = typeFor(p.type);
      if (!kind) return;
      if (kind.sustained && !preview) { this.hold(p, when); return; }
      this.createVoice(p, when, false, preview);
    }
    createVoice(p, when, held, preview = false) {
      const c = this.context, settings = p.sound, channel = this.route(p), config = mix();
      const preset = instruments.get(settings.instrument);
      if ((typeof performancePatch!=='undefined'&&channel<2)||preset?.category==='waves'||settings.wave==='noise'||(channel<2&&settings.wave==='auto'&&waveforms[worldKey][channel]==='noise')||(!preset&&channel<2)) { this.createSynthVoice(p,when,held,preview); return; }
      if (channel === 2 && preset?.category === 'drums') { this.createDrum(p, when, preset, preview); return; }
      const oscillator = c.createOscillator(), gate = c.createGain(), filter = c.createBiquadFilter(), pan = c.createStereoPanner();
      const note = p.note + settings.octave * 12, frequency = frequencyFor(note);
      const detune = settings.detune + (channel < 2 ? config.voices[channel].detune : 0);
      const amplitude = (.035 + p.y * p.y * .28) * settings.gain;
      oscillator.type = channel === 2 ? 'sine' : settings.wave && settings.wave !== 'auto' ? settings.wave : waveforms[worldKey][channel];
      oscillator.frequency.value = channel === 2 ? frequency * config.drums.tone : frequency;
      oscillator.detune.value = detune;
      filter.type = 'lowpass'; filter.Q.value = .45; filter.frequency.value = settings.brightness;
      pan.pan.value = settings.pan;
      const envelopeSettings = channel === 2 ? { ...settings, attack: Math.min(settings.attack, .03), decay: config.drums.decay, sustain: 0, release: .03 } : settings;
      const end = this.envelope(gate, when, amplitude, envelopeSettings, held, channel === 2 ? 0 : settings.duration);
      if (channel === 2) oscillator.frequency.exponentialRampToValueAtTime(Math.max(15, frequency * config.drums.tone * .24), when + config.drums.decay);
      oscillator.connect(gate).connect(filter).connect(pan).connect(this.channels[channel]);
      const extras = [], partials = [];
      if (channel < 2 && preset && preset.category !== 'drums') {
        const recipe = preset.partials.length ? preset.partials : [{ratio:1,level:1}];
        const total = recipe.reduce((sum,part)=>sum+part.level,0);
        oscillator.disconnect();
        for (const [index,part] of recipe.entries()) {
          const node = index === 0 ? oscillator : c.createOscillator(), level = c.createGain();
          node.type = part.wave || oscillator.type;
          node.frequency.setValueAtTime(frequency * part.ratio * (part.scoop || 1),when);
          if (part.scoop) node.frequency.exponentialRampToValueAtTime(frequency * part.ratio,when + .09);
          node.detune.value = detune + (part.detune || 0);
          level.gain.setValueAtTime(part.level / total,when);
          if (part.decay && !held) level.gain.exponentialRampToValueAtTime(.0001,when + part.decay);
          node.connect(level).connect(gate);extras.push(level);partials.push({node,ratio:part.ratio,detune:part.detune || 0,wave:part.wave});
          if (index) {
            node.start(when);if(!held)node.stop(end + .015);
            this.active.add(node);this.voices.set(node,{id:p.id,note,channel,start:when,end,group:p.group,noise:true,gate});
            node.onended=()=>{this.active.delete(node);this.voices.delete(node);node.disconnect();};
          }
        }
        if (preset.fm) {
          const modulator=c.createOscillator(), depth=c.createGain();
          modulator.frequency.value=frequency * preset.fm.ratio;
          depth.gain.setValueAtTime(frequency * preset.fm.index,when);
          depth.gain.exponentialRampToValueAtTime(.001,when + preset.fm.decay);
          modulator.connect(depth).connect(oscillator.frequency);modulator.start(when);modulator.stop(end + .015);
          this.active.add(modulator);this.voices.set(modulator,{id:p.id,note,channel,start:when,end,noise:true});
          modulator.onended=()=>{this.active.delete(modulator);this.voices.delete(modulator);modulator.disconnect();depth.disconnect();};
        }
      }
      oscillator.start(when);
      if (!held) oscillator.stop(end + .015);
      this.active.add(oscillator);
      const voice = { id: p.id, note: note + detune / 100, channel, start: when, end, group: p.group, sustained: held, gate, filter, pan, preview };
      this.voices.set(oscillator, voice);
      if (held) this.held.set(p.id, { oscillator, partials, gate, filter, pan, channel, start:when, releaseAt:null, signature:this.heldSignature(p) });
      oscillator.onended = () => {
        this.active.delete(oscillator); this.voices.delete(oscillator);
        if (this.held.get(p.id)?.oscillator === oscillator) this.held.delete(p.id);
        for (const node of [oscillator, gate, filter, pan, ...extras]) node.disconnect();
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
    voiceSettings(settings,channel) {
      if(typeof performancePatch==='undefined'||channel>1)return settings;
      const patch=performancePatch.voices[channel];
      return {...settings,...patch,attack:clamp(settings.attack*patch.attack/.01,.002,1),release:clamp(settings.release*patch.release/.25,.03,2)};
    }
    createSynthVoice(p, when, held, preview) {
      const c=this.context,channel=this.route(p),settings=this.voiceSettings(p.sound,channel);
      const oscillator=c.createOscillator(),second=c.createOscillator(),noise=c.createBufferSource(),sub=c.createOscillator(),fm=c.createOscillator(),lfo=c.createOscillator();
      const gate=c.createGain(),toneGain=c.createGain(),noiseGain=c.createGain(),filter=c.createBiquadFilter(),pan=c.createStereoPanner(),subGain=c.createGain(),fmGain=c.createGain(),vibratoGain=c.createGain(),motionGain=c.createGain(),pulseGain=c.createGain(),pulseAmp=c.createGain(),drive=c.createWaveShaper();
      filter.type='lowpass';filter.Q.value=.45;
      noise.buffer=this.noise;noise.loop=true;
      oscillator.connect(toneGain);second.connect(toneGain);toneGain.connect(gate);
      noise.connect(noiseGain).connect(gate);sub.type='sine';sub.connect(subGain).connect(gate);
      fm.type='sine';fm.connect(fmGain);fmGain.connect(oscillator.frequency);fmGain.connect(second.frequency);
      lfo.type='sine';lfo.connect(vibratoGain);vibratoGain.connect(oscillator.detune);vibratoGain.connect(second.detune);vibratoGain.connect(sub.detune);
      lfo.connect(motionGain).connect(filter.frequency);lfo.connect(pulseGain).connect(pulseAmp.gain);
      drive.oversample='2x';gate.connect(filter).connect(drive).connect(pulseAmp).connect(pan).connect(this.channels[channel]);
      const end=this.envelope(gate,when,(.035+p.y*p.y*.28)*settings.gain,settings,held,settings.duration);
      const partials=[{node:oscillator,ratio:1,detune:0},{node:second,ratio:1,detune:0},{node:noise,noise:true}];
      const voice={id:p.id,note:p.note+settings.octave*12,channel,start:when,end,group:p.group,sustained:held,gate,filter,pan,preview,basic:true,partials,toneGain,noiseGain,sub,subGain,fm,fmGain,lfo,vibratoGain,motionGain,pulseGain,pulseAmp,drive,driveValue:null,settings:clone(settings)};
      this.updateSynthVoice(voice,p,when,true);
      for(const [index,node] of [oscillator,second,noise,sub,fm,lfo].entries()) {
        node.start(when);if(!held)node.stop(end+.015);this.active.add(node);
        this.voices.set(node,index?{...voice,primary:false,noise:true}:Object.assign(voice,{primary:true}));
        node.onended=()=>{this.active.delete(node);this.voices.delete(node);node.disconnect();
          if(node===oscillator){if(this.held.get(p.id)?.oscillator===node)this.held.delete(p.id);for(const output of [gate,toneGain,noiseGain,filter,pan,subGain,fmGain,vibratoGain,motionGain,pulseGain,pulseAmp,drive])output.disconnect();}
        };
      }
      if(held)this.held.set(p.id,{oscillator,partials:[...partials,{node:sub,noise:true},{node:fm,noise:true},{node:lfo,noise:true}],gate,filter,pan,channel,start:when,releaseAt:null,signature:this.heldSignature(p),basic:true});
    }
    updateSynthVoice(voice,p,at,initial=false) {
      const channel=voice.channel,settings=this.voiceSettings(p.sound,channel);
      const set=(parameter,value,timeConstant=.025)=>initial?parameter.setValueAtTime(value,at):parameter.setTargetAtTime(value,at,timeConstant);
      const wave=settings.wave&&settings.wave!=='auto'?settings.wave:waveforms[worldKey][Math.min(channel,1)];
      const amount=wave==='noise'?1:(settings.noise||0),frequency=frequencyFor(noteFor(p.x)+settings.octave*12);
      const spread=settings.detune+(channel<2?mix().voices[channel].detune:0);
      for(const [index,part] of voice.partials.filter(part=>!part.noise).entries()) {
        part.node.type=wave==='noise'?'sine':wave;
        set(part.node.frequency,frequency);
        set(part.node.detune,(index?1:-1)*spread);
      }
      const subAmount=settings.sub||0,balance=1+subAmount*.65;
      set(voice.toneGain.gain,(1-amount)*.5/balance,.02);set(voice.noiseGain.gain,amount/balance,.02);
      set(voice.sub.frequency,frequency/2);set(voice.subGain.gain,subAmount*.65/balance,.02);
      set(voice.fm.frequency,frequency*(settings.harmonicity??2));set(voice.fmGain.gain,frequency*(settings.fm||0));
      set(voice.lfo.frequency,settings.lfoRate??3);set(voice.vibratoGain.gain,settings.vibrato||0);
      set(voice.motionGain.gain,settings.brightness*(settings.motion||0)*.8);
      set(voice.pulseAmp.gain,1-(settings.pulse||0)/2);set(voice.pulseGain.gain,(settings.pulse||0)/2);
      if(voice.driveValue!==(settings.drive||0)){
        const amount=settings.drive||0,curve=new Float32Array(1024),strength=1+amount*14;
        for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=Math.tanh(x*strength)/Math.tanh(strength);}
        voice.drive.curve=amount?curve:null;voice.driveValue=amount;
      }
      set(voice.filter.frequency,settings.brightness);set(voice.pan.pan,settings.pan);
      voice.note=noteFor(p.x)+settings.octave*12;voice.noise=wave==='noise';
    }
    syncLiveVoices() {
      if(!this.context)return;const now=this.context.currentTime;
      for(const voice of this.voices.values())if(voice.primary&&voice.basic) {
        const source=scene().find(item=>item.id===voice.id);if(!source||voice.preview)continue;
        const at=Math.max(now,voice.start);this.updateSynthVoice(voice,source,at);
        // New attacks use the new ADSR. A running hold also follows its sustain level.
        if(voice.sustained&&voice.start<=now&&JSON.stringify(voice.settings)!==JSON.stringify(source.sound)) {
          this.holdGain(voice.gate.gain,at);voice.gate.gain.setTargetAtTime((.035+source.y*source.y*.28)*source.sound.gain*source.sound.sustain,at,.025);
        }
        voice.settings=clone(source.sound);
      }
    }
    createDrum(p, when, preset, preview) {
      const c=this.context,settings=p.sound,config=mix().drums;
      const note=p.note+settings.octave*12+settings.detune/100;
      const pitch=clamp(frequencyFor(note)/frequencyFor(48),.25,4)*config.tone/.7;
      const length=clamp(settings.duration/preset.settings.duration*config.decay/.18,.15,5);
      const amplitude=(.035+p.y*p.y*.28)*settings.gain;
      const filter=c.createBiquadFilter(),pan=c.createStereoPanner();
      filter.type='lowpass';filter.frequency.value=settings.brightness;filter.Q.value=.45;pan.pan.value=settings.pan;
      filter.connect(pan).connect(this.channels[2]);
      let remaining=preset.components.length;
      for(const component of preset.components) {
        const node=component.noise?c.createBufferSource():c.createOscillator(),gate=c.createGain();
        const at=when+(component.delay||0)*length,decay=Math.max(.008,component.decay*length),end=at+decay+.01;
        let noiseFilter;
        if(component.noise) {
          node.buffer=this.noise;node.loop=true;
          noiseFilter=c.createBiquadFilter();noiseFilter.type=component.filter;noiseFilter.Q.value=component.q;
          noiseFilter.frequency.value=clamp(component.frequency*Math.sqrt(pitch),80,c.sampleRate*.45);
          node.connect(noiseFilter).connect(gate);
        }else {
          node.type=component.wave;node.frequency.setValueAtTime(clamp(component.frequency*pitch,15,c.sampleRate*.45),at);
          node.frequency.exponentialRampToValueAtTime(clamp(component.endFrequency*pitch,15,c.sampleRate*.45),at+decay);
          node.connect(gate);
        }
        const peak=amplitude*component.level*(component.noise?clamp(config.noise/.3,0,2.4)*(settings.noise??1):1);
        gate.gain.setValueAtTime(0,at);
        gate.gain.linearRampToValueAtTime(peak,at+Math.min(settings.attack,decay*.2,.01));
        if(peak>0)gate.gain.exponentialRampToValueAtTime(.0001,at+decay);
        else gate.gain.setValueAtTime(0,at+decay);
        gate.gain.linearRampToValueAtTime(0,end);
        gate.connect(filter);node.start(at);node.stop(end+.005);this.active.add(node);
        this.voices.set(node,{id:p.id,note,channel:2,start:at,end,group:p.group,gate,preview,instrument:preset.id});
        node.onended=()=>{this.active.delete(node);this.voices.delete(node);node.disconnect();gate.disconnect();noiseFilter?.disconnect();if(!--remaining){filter.disconnect();pan.disconnect();}};
      }
    }
    heldSignature(e) {
      return JSON.stringify([e.x,e.y,e.sound,waveforms[worldKey][1],mix().voices[1].detune,typeof performancePatch==='undefined'?null:performancePatch]);
    }
    hold(p, when) {
      const held=this.held.get(p.id);
      if ((!held || (held.releaseAt!==null&&held.releaseAt<=when)) && this.context?.state==='running') {
        if(held)for(const node of held.partials?.length?held.partials.map(part=>part.node):[held.oscillator])try {node.stop(Math.max(this.context.currentTime,held.releaseAt)+.02);} catch {}
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
        for(const node of held.partials?.length?held.partials.map(part=>part.node):[held.oscillator])try {node.stop(now+.02);} catch {}
        this.voices.delete(held.oscillator);this.held.delete(id);
      }
    }
    stopSource(id) {
      this.release(id);
      for (const [node,voice] of this.voices) if (voice.id===id) {try {node.stop();} catch {} this.active.delete(node);this.voices.delete(node);}
    }
    cancelPending(ids) {
      if(!this.context)return;const now=this.context.currentTime;
      for(const [node,voice] of this.voices)if(ids.has(voice.id)&&voice.start>now){try{node.stop(now);}catch{}this.active.delete(node);this.voices.delete(node);if(this.held.get(voice.id)?.oscillator===node)this.held.delete(voice.id);}
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
      if (this.muted || this.context?.state!=='running') return;
      for (const e of scene()) if (typeFor(e.type).sustained) {
        if (!e.muted&&heldOnStep(e,step)) this.hold({...e,note:noteFor(e.x)},when);
        else this.release(e.id,when);
      }
    }
    syncHeld() {
      const now=this.context?.currentTime||0;
      if(this.muted){for(const id of this.held.keys())this.release(id);return;}
      for (const [id,held] of this.held) {
        const e=scene().find(e=>e.id===id);
        if (!running||!e||e.muted||!typeFor(e.type).sustained||(held.start<=now&&!heldOnStep(e,playingStep))) this.release(id);
      }
      if (!running||this.context?.state!=='running') return;
      for (const e of scene()) if (!e.muted&&typeFor(e.type).sustained&&((activatedHeld.has(e.id)&&heldOnStep(e,playingStep))||this.held.get(e.id)?.start>now)) {
        this.hold({...e,note:noteFor(e.x)},now+.005);
        const held=this.held.get(e.id),signature=this.heldSignature(e);
        if (held.signature===signature) continue;
        if(!held.basic&&(instruments.get(e.sound.instrument)?.category==='waves'||e.sound.wave==='noise'||e.sound.wave==='auto'&&waveforms[worldKey][1]==='noise')){this.stopSource(e.id);this.hold({...e,note:noteFor(e.x)},now+.005);continue;}
        if(held.basic){
          const voice=this.voices.get(held.oscillator),at=Math.max(now,held.start);
          if(!voice)continue;this.updateSynthVoice(voice,e,at);
          if(held.start>now){held.gate.gain.cancelScheduledValues(at);this.envelope(held.gate,at,(.035+e.y*e.y*.28)*e.sound.gain,this.voiceSettings(e.sound,held.channel),true,0);}
          else{this.holdGain(held.gate.gain,now);held.gate.gain.setTargetAtTime((.035+e.y*e.y*.28)*e.sound.gain*e.sound.sustain,now,.025);}
          held.signature=signature;if(held.releaseAt!==null&&held.releaseAt>now)this.release(e.id,held.releaseAt);continue;
        }
        const settings=e.sound,detune=settings.detune+mix().voices[1].detune,at=Math.max(now,held.start);
        const wave=settings.wave&&settings.wave!=='auto'?settings.wave:waveforms[worldKey][1],frequency=frequencyFor(noteFor(e.x)+settings.octave*12);
        for(const part of held.partials?.length?held.partials:[{node:held.oscillator,ratio:1,detune:0}]) {
          part.node.type=part.wave||wave;
          part.node.frequency.setTargetAtTime(frequency*part.ratio,at,.025);
          part.node.detune.setTargetAtTime(detune+part.detune,at,.025);
        }
        if(held.start>now){held.gate.gain.cancelScheduledValues(at);this.envelope(held.gate,at,(.035+e.y*e.y*.28)*settings.gain,settings,true,0);}
        else {this.holdGain(held.gate.gain,now);held.gate.gain.setTargetAtTime((.035+e.y*e.y*.28)*settings.gain*settings.sustain,now,.025);}
        held.filter.frequency.setTargetAtTime(settings.brightness,at,.025);
        held.pan.pan.setTargetAtTime(settings.pan,at,.025);
        this.voices.get(held.oscillator).note=noteFor(e.x)+settings.octave*12+detune/100;
        held.signature=signature;
        if(held.releaseAt!==null&&held.releaseAt>now)this.release(e.id,held.releaseAt);
      }
    }
    stop(when = this.context?.currentTime) {
      for (const node of this.active) {
        const voice = this.voices.get(node);
        if (when > this.context.currentTime && voice?.gate) {
          this.holdGain(voice.gate.gain, Math.max(this.context.currentTime, when - .008));
          voice.gate.gain.linearRampToValueAtTime(0, when);
        }
        try { node.stop(when); } catch {}
      }
      if (!(when > this.context?.currentTime)) this.active.clear();
      this.voices.clear(); this.held.clear();
      this.samples?.fill(0); this.spectrum?.fill(0); this.peak = 0; this.displayPeak = 0;
    }
    readPeak() {
      if (!this.meter) return 0;
      this.meter.getFloatTimeDomainData(this.samples);
      if (showAudio) this.meter.getByteFrequencyData(this.spectrum);
      let peak = 0; for (const sample of this.samples) peak = Math.max(peak, Math.abs(sample));
      let wavePeak = 0;
      const recentStart = Math.max(0, this.samples.length - Math.round(this.context.sampleRate * .048));
      for (let i = recentStart; i < this.samples.length; i++) wavePeak = Math.max(wavePeak, Math.abs(this.samples[i]));
      const now = this.context.currentTime, dt = Math.max(0, now - (this.lastMeterTime ?? now));
      // Fast attack, slow release keeps visual gain steady without clipping peaks.
      this.displayPeak = Math.max(wavePeak, this.displayPeak * Math.exp(-dt / .18));
      this.lastMeterTime = now;
      this.peak = peak; return peak;
    }
    sounding() { return this.context?.state === 'running' ? [...this.voices.values()].filter(v => !v.noise && v.start <= this.context.currentTime && v.end > this.context.currentTime) : []; }
    energyAt(note) {
      if (!this.meter) return 0;
      const bin = frequencyFor(note) * this.meter.fftSize / this.context.sampleRate, index = Math.floor(bin), fraction = bin - index;
      return ((this.spectrum[index] || 0) * (1 - fraction) + (this.spectrum[index + 1] || 0) * fraction) / 255;
    }
  }
  let sound=new Sound();
  function fieldSnapshot() {
    return {version:5, worldKey, bpm, phraseLength, selectedId, tool, toolInstrument, nextId, showAudio, layoutName,
      scaleSettings:clone(scaleSettings), scenes:clone(scenes), waveforms:clone(waveforms), soundSettings:clone(soundSettings)};
  }
  const currentLayer = () => layers.find(layer=>layer.id===currentLayerId);
  const usesCycleClock = () => layers.length>0 && editorView==='composition';
  const isEditorLayer = () => !layers.length || currentLayerId===selectedLayerId;
  function beatRate() {
    return usesCycleClock()?compositionTools.layerBeatRate(phraseLength,activeField().repeats,fields.length,cycleBeats,compositionTempo):(!layers.length?bpm:compositionTempo)/60;
  }
  function contextState() {
    return {fields,activeFieldId,queuedFieldId,fieldCycle,selectedFieldId,scenes,worldKey,selectedId,selectedSourceIds,tool,toolInstrument,bpm,nextId,waveforms,scaleSettings,soundSettings,phraseLength,nextPhraseBeat,playingStep,playingStepAt,phraseEvents,activatedHeld,elapsed,beat,particles,ripples,sound};
  }
  function applyContext(value) {
    ({fields,activeFieldId,queuedFieldId,fieldCycle,selectedFieldId,scenes,worldKey,selectedId,selectedSourceIds,tool,toolInstrument,bpm,nextId,waveforms,scaleSettings,soundSettings,phraseLength,nextPhraseBeat,playingStep,playingStepAt,phraseEvents,activatedHeld,elapsed,beat,particles,ripples,sound}=value);
  }
  function storeCurrentLayer() {
    const layer=currentLayer();if(!layer)return;
    layer.context=contextState();layer.fields=fields;layer.activeFieldId=activeFieldId;
  }
  function withLayer(layer,callback) {
    storeCurrentLayer();
    if(layer.id===currentLayerId){try{return callback();}finally{storeCurrentLayer();}}
    const before=contextState(),beforeId=currentLayerId;
    applyContext(layer.context);currentLayerId=layer.id;
    try{return callback();}
    finally{storeCurrentLayer();currentLayerId=beforeId;applyContext(before);}
  }
  function buildLayer(record) {
    const before=contextState();
    scaleSettings=clone(scaleSettings);soundSettings=clone(soundSettings);waveforms=clone(waveforms);
    const engine=new Sound();engine.layerGain=record.gain??1;engine.muted=!!record.muted;
    fields=record.fields.map(field=>({...field,snapshot:{...compositionTools.defaultTheme(field.snapshot),bpm:compositionTempo}}));
    activeFieldId=fields.some(field=>field.id===record.activeFieldId)?record.activeFieldId:fields[0].id;
    selectedFieldId=activeFieldId;queuedFieldId=null;fieldCycle=0;sound=engine;
    elapsed=0;beat=0;nextPhraseBeat=0;playingStep=null;playingStepAt=null;phraseEvents=[];particles=[];ripples=[];activatedHeld=new Set();
    restoreField(fields.find(field=>field.id===activeFieldId).snapshot);
    const layer={id:record.id,kind:record.kind,gain:engine.layerGain,muted:engine.muted,fields,activeFieldId,context:contextState(),engine};
    applyContext(before);return layer;
  }
  function clearEmptyComposition() {
    running=false;sound=new Sound();fields=[];
    selectedLayerId=currentLayerId=activeFieldId=selectedFieldId=null;queuedFieldId=null;
    scenes={autumn:[],space:[]};selectedId=null;selectedSourceIds=new Set();
    selectedPhraseKeys.clear();phraseSelectionCleared=true;compositionSourceFilter='all';
    bpm=compositionTempo;nextId=1;ghost=null;drag=null;fieldDrag=null;pendingPersistence=false;
    resetTransport(false);
  }
  function installLayers(records,id=records[0]?.id) {
    for(const layer of layers){layer.engine.stop();layer.engine.master?.disconnect();}
    audioHost=audioHost?.context?audioHost:null;layers=records.map(buildLayer);
    if(layers.length){selectedLayerId=currentLayerId=layers.some(layer=>layer.id===id)?id:layers[0].id;applyContext(currentLayer().context);}
    else clearEmptyComposition();
    renderedFields=null;renderedLayers=null;
  }
  function selectLayer(id,preserveSelection=false) {
    if(!preserveSelection){selectedPhraseKeys.clear();phraseSelectionCleared=false;compositionSourceFilter='all';}
    if(id===selectedLayerId)return;
    const layer=layers.find(layer=>layer.id===id);if(!layer)return;
    if(fieldDrag)endFieldDrag(true);
    if(editorView==='field'&&running)pause();
    storeCurrentLayer();selectedLayerId=currentLayerId=id;applyContext(layer.context);
    ghost=null;drag=null;q('[data-repeats-popover]').hidden=true;updateLayerAudibility();sync();
  }
  function updateLayerAudibility() {
    for(const layer of layers){layer.engine.previewSuppressed=editorView==='field'&&layer.id!==selectedLayerId;withLayer(layer,()=>sound.configure(undefined,false));}
  }
  async function initializeLayers() {
    if(!layers.length){if(fields.length)await sound.init();return;}
    audioHost=audioHost||layers[0].engine;
    const primary=layers.find(layer=>layer.engine===audioHost)||layers[0];
    if(!audioHost.context)await withLayer(primary,()=>primary.engine.init());
    for(const layer of layers)await withLayer(layer,()=>layer.engine.init(layer.engine===audioHost?null:audioHost));
    updateLayerAudibility();
  }
  function resetAllTransport() {
    if(!layers.length){resetTransport();return;}
    storeCurrentLayer();
    for(const layer of layers)withLayer(layer,()=>resetTransport(false));
    applyContext(currentLayer().context);anchorClock();
  }
  function setCompositionTempo(value) {
    remember();compositionTempo=bpm=clamp(Math.round(Number(value)||96),45,160);
    for(const layer of layers){layer.context.bpm=compositionTempo;layer.fields.forEach(field=>field.snapshot.bpm=compositionTempo);}
    resetAllTransport();commit();
  }
  function soundingAll() {
    if(!layers.length)return sound.sounding();
    const audible=editorView==='field'?layers.filter(layer=>layer.id===selectedLayerId):layers;
    return audible.flatMap(layer=>layer.engine.sounding().map(voice=>({...voice,layerId:layer.id})));
  }

  const activeField = () => fields.find(field => field.id === activeFieldId);
  function captureField() { if (activeField()) activeField().snapshot = fieldSnapshot(); }
  function serial() {
    captureField();storeCurrentLayer();
    const snapshot={...fieldSnapshot(),version:layers.length||!fields.length?7:6,fields:clone(fields),activeFieldId,sequenceEnabled};
    if(snapshot.version===7)Object.assign(snapshot,{compositionTempo,cycleBeats,selectedLayerId,layers:layers.map(layer=>({id:layer.id,kind:layer.kind,gain:layer.gain,muted:layer.muted,fields:clone(layer.fields),activeFieldId:layer.activeFieldId}))});
    if(typeof performancePatch!=='undefined')Object.assign(snapshot,{performanceVersion:1,performancePatch:clone(performancePatch)});
    return snapshot;
  }
  function persist() {
    const snapshot = serial(); lastPersisted = JSON.stringify(snapshot);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({privateContent:snapshot})); } catch { status('Не удалось сохранить изменения в браузере'); }
    if (window.openai?.setWidgetState) window.openai.setWidgetState({privateContent:snapshot}).catch(() => {});
  }
  function restoreField(saved){
    saved=compositionTools.defaultTheme(saved);
    if(!saved||![1,2,3,4,5].includes(saved.version)||!worlds[saved.worldKey])return;
    for(const key of Object.keys(worlds)){const settings=saved.scaleSettings?.[key];scaleSettings[key]=saved.version>=2&&Number.isInteger(settings?.tonic)&&settings.tonic>=0&&settings.tonic<12&&Object.hasOwn(modes,settings.mode)?{tonic:settings.tonic,mode:settings.mode}:{tonic:0,mode:key==='autumn'?'majorPent':'minorPent'};}
    const clean={};let maxId=0;
    for(const key of Object.keys(worlds)){if(!Array.isArray(saved.scenes?.[key]))return;clean[key]=saved.scenes[key].slice(0,MAX_SOURCES).filter(e=>Number.isInteger(e.id)&&worlds[key].types.some(t=>t.id===e.type)&&Number.isFinite(e.x)&&Number.isFinite(e.y)).map(e=>{maxId=Math.max(maxId,e.id);const x=saved.version===1?(worlds[key].notes[Math.round(clamp(e.x,0,1)*10)]-PITCH_MIN)/PITCH_SPAN:e.x;const sustained=worlds[key].types.find(t=>t.id===e.type).sustained;const steps=sustained&&saved.version<5?allPhraseSteps():saved.version>=3?Array.isArray(e.steps)?[...new Set(e.steps.filter(step=>Number.isInteger(step)&&step>=0&&step<32))].sort((a,b)=>a-b):[0]:legacySteps([.5,1,2,4].includes(e.interval)?e.interval:2);return {id:e.id,type:e.type,x:snapX(x,key),y:clamp(e.y,.08,.92),muted:!!e.muted,steps,sound:cleanSourceSettings(e.sound,e.type)};});}
    for (const key of Object.keys(worlds)) soundSettings[key] = cleanMix(saved.soundSettings?.[key]);
    phraseLength=saved.version>=3?clamp(Math.round(Number(saved.phraseLength)||8),1,32):8;
    scenes=clean;worldKey=saved.worldKey;bpm=clamp(Number(saved.bpm)||80,45,160);nextId=Math.max(maxId+1,Number(saved.nextId)||0);selectedId=scene().some(e=>e.id===saved.selectedId)?saved.selectedId:scene()[0]?.id||null;tool=world().types.some(t=>t.id===saved.tool)?saved.tool:world().types[0].id;
    toolInstrument=instruments.get(saved.toolInstrument)?saved.toolInstrument:'default';
    selectedSourceIds=new Set(selectedId===null?[]:[selectedId]);
    for(const key of Object.keys(worlds)){const arr=saved.waveforms?.[key];if(Array.isArray(arr)&&arr.length===2&&arr.every(v=>['sine','triangle','sawtooth','square','noise'].includes(v)))waveforms[key]=arr;}
  }
  function restore(saved) {
    if(!saved)return;
    if(saved.version===7){
      let valid;try{valid=layoutFiles.validateSnapshot(saved);}catch{return;}
      if(typeof performancePatch!=='undefined'&&valid.performancePatch)performancePatch=clone(valid.performancePatch);
      compositionTempo=valid.compositionTempo;cycleBeats=valid.cycleBeats;sequenceEnabled=valid.sequenceEnabled;
      installLayers(valid.layers,valid.selectedLayerId);
    }else{
      if(saved.version===6){
        let valid;try{valid=layoutFiles.validateSnapshot(saved);}catch{return;}
        fields=valid.fields.map(field=>({...field,snapshot:compositionTools.defaultTheme(field.snapshot)}));activeFieldId=valid.activeFieldId;sequenceEnabled=valid.sequenceEnabled;restoreField(activeField().snapshot);
      }else{
        if(![1,2,3,4,5].includes(saved.version)||!worlds[saved.worldKey])return;
        restoreField(saved);activeFieldId=1;sequenceEnabled=true;fields=[{id:1,name:'Поле 1',repeats:1,snapshot:fieldSnapshot()}];
      }
      compositionTempo=bpm;cycleBeats=clamp(fields.reduce((sum,field)=>sum+field.snapshot.phraseLength*field.repeats,0)||32,1,128);
      installLayers([{id:1,kind:'main',gain:1,muted:false,fields,activeFieldId}]);
    }
    layoutName=layoutFiles.normalizeName(saved.layoutName);showAudio=true;fieldDrag=null;selectedPhraseKeys.clear();phraseSelectionCleared=false;
  }
  const starterSnapshot=fieldSnapshot();
  restore(window.openai?.widgetState?.privateContent || savedState);
  const initialSaved=window.openai?.widgetState?.privateContent||savedState;
  if(!initialSaved?.performanceVersion){
    if(initialSaved)try{localStorage.setItem(STORAGE_KEY+'-before-performance',JSON.stringify(initialSaved));}catch{}
    fields=score.fields(starterSnapshot);compositionTempo=96;cycleBeats=64;sequenceEnabled=true;
    installLayers([{id:1,kind:'main',gain:1,muted:false,fields,activeFieldId:1}]);
    layoutName='Пейзаж · восемь фраз';
  }
  function layoutStatus(message,error=false){
    const output=q('[data-layout-status]');output.textContent=message;output.dataset.state=error?'error':'success';
    status(message);
  }
  function exportLayout(){
    try {
      layoutName=layoutName||'Композиция';
      const filename=layoutFiles.filename(layoutName),contents=layoutFiles.encode(serial(),layoutName);
      const url=URL.createObjectURL(new Blob([contents],{type:'application/json;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=filename;link.hidden=true;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      persist();syncLayout();layoutStatus('Файл «'+filename+'» отправлен в загрузки.');
    } catch(error){layoutStatus('Не удалось сохранить раскладку: '+error.message,true);}
  }
  async function importLayout(file){
    if(!file)return;
    const button=q('[data-action="import-layout"]');button.disabled=true;
    try {
      if(file.size>layoutFiles.MAX_BYTES)throw new Error('Файл слишком большой. Максимум — 1 МБ.');
      const imported=layoutFiles.decode(await file.text());
      // Validate the entire file before changing the current composition.
      remember();running=false;resetTransport();restore(imported.snapshot);
      layoutName=imported.name||layoutFiles.normalizeName(file.name.replace(/(?:\.landscape)?\.json$/i,''))||'Импортированная композиция';
      ghost=null;commit();openInspector('layouts');
      layoutStatus('Открыта раскладка «'+layoutName+'». Нажми «Играть», чтобы послушать.');
    } catch(error){layoutStatus(error.message||'Не удалось прочитать раскладку.',true);}
    finally {button.disabled=false;q('[data-control="layout-file"]').value='';}
  }
  function syncLayout(){document.title='Музыкальный инструмент';}
  function syncViewControls() {
    const view=editorView==='field'?'full-field':liveEditorOpen?'field':'composition';
    all('[data-editor-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.editorView===view)));
  }
  function setEditorView(view) {
    if(!layers.length&&!fields.length)view='composition';
    const changed=view!==editorView;if(changed&&running)pause();
    if(changed&&view==='field'&&selectedFieldId!==activeFieldId){captureField();activeFieldId=selectedFieldId;restoreField(activeField().snapshot);}
    editorView=view;root.dataset.view=view;
    const overview=view==='composition';q('[data-stage]').style.visibility=overview?'hidden':'';q('[data-composition]').hidden=!overview;
    syncViewControls();
    if(changed){resetAllTransport();updateLayerAudibility();sync();}else syncFields();
    if(!overview)resize();else resizeRing();
  }
  function resizeRing() {
    const panel=q('[data-composition]').getBoundingClientRect();
    if(!panel.width||!panel.height)return;
    const performanceMode=root.classList.contains('performance-mode'),padding=performanceMode?40:150;
    const controls=performanceMode?q('[data-composition-layers]').getBoundingClientRect().height+q('[data-field-actions]').getBoundingClientRect().height:0;
    const size=Math.max(160,Math.min(panel.width-padding,panel.height-padding-controls,580));
    const ring=q('[data-fields]');ring.style.width=size+'px';ring.style.height=size+'px';
    ring.style.setProperty('--ring-size',size+'px');
    ring.dataset.compact=String(size<300||layers.length>1&&size<420);
    positionFieldActions();
  }
  function nextFieldId() {
    if (queuedFieldId !== null) return queuedFieldId;
    if (!sequenceEnabled || fields.length < 2) return null;
    return fields[(fields.findIndex(field => field.id === activeFieldId) + 1) % fields.length].id;
  }
  function chooseField(id,layerId=selectedLayerId) {
    selectedPhraseKeys=new Set([phraseKey(layerId,id)]);phraseSelectionCleared=false;compositionSourceFilter='all';
    if(layerId!==selectedLayerId)selectLayer(layerId,true);
    selectedFieldId=id;
    if (!fields.some(field => field.id === id)) return;
    if (running) {
      queuedFieldId = id === activeFieldId || id === queuedFieldId ? null : id;
      openInspector('source');sync();
      status(queuedFieldId === null ? 'Ручной переход отменён' : 'Следующая фраза: '+fields.find(field => field.id === id).name+(typeof performancePatch==='undefined'?' · после текущего лупа':' · на следующей доле'));
    } else if (id !== activeFieldId) {
      remember();captureField();resetTransport();activeFieldId=id;restoreField(activeField().snapshot);ghost=null;commit();
      status('Выбрана фраза');
    } else {openInspector('source');sync();}
  }
  function inspectField(id,layerId=selectedLayerId) {
    selectedPhraseKeys=new Set([phraseKey(layerId,id)]);phraseSelectionCleared=false;compositionSourceFilter='all';
    if(layerId!==selectedLayerId)selectLayer(layerId,true);
    selectedFieldId=id;openInspector('source');sync();
  }
  function addField(duplicate = false, templateId = selectedFieldId) {
    if(!fields.length)return;
    if(fields.length>=MAX_FIELDS){status('Не больше 16 фраз в слое');return;}
    remember();captureField();
    const template=fields.find(field=>field.id===templateId)||activeField(),id=Math.max(...fields.map(field=>field.id))+1;
    const kind=currentLayer()?.kind||'main';
    const generated=typeof performancePatch==='undefined'?(kind==='main'?compositionTools.demoSnapshot(fieldSnapshot(),id-1):compositionTools.partFields(fieldSnapshot(),kind,1,id-1)[0].snapshot):score.partFields(template.snapshot,kind)[(id-1)%score.phrases.length].snapshot;
    const snapshot=duplicate?clone(template.snapshot):generated;snapshot.bpm=compositionTempo;
    snapshot.scaleSettings=clone(template.snapshot.scaleSettings);snapshot.scenes.autumn.forEach(source=>source.x=snapForSnapshot(source.x,snapshot));
    fields.push({id,name:'Фраза '+id,repeats:duplicate?template.repeats:1,snapshot});selectedFieldId=id;
    selectedPhraseKeys=new Set([phraseKey(selectedLayerId,id)]);phraseSelectionCleared=false;if(typeof performancePatch!=='undefined')liveEditorOpen=true;
    if(running){syncFields();persist();}
    else{resetTransport();activeFieldId=id;restoreField(snapshot);ghost=null;commit();}
    status(duplicate?'Фраза скопирована':'Фраза добавлена');
  }
  function reorderField(id,target) {
    const result=compositionTools.reordered(fields,id,target);
    if(result.every((field,index)=>field.id===fields[index].id))return;
    remember();fields.splice(0,fields.length,...result);syncFields();persist();status('Порядок фраз изменён');
  }
  function moveField(id,direction) {
    const index=fields.findIndex(field=>field.id===id),target=index+direction;
    if(index<0||target<0||target>=fields.length)return;reorderField(id,target);
  }
  function deleteField(id=selectedFieldId) {
    const index=fields.findIndex(field=>field.id===id);if(index<0)return;
    if(fields.length===1){removeLayer(selectedLayerId);return;}
    remember();captureField();const deletingActive=id===activeFieldId;
    if(deletingActive)resetTransport();
    fields.splice(index,1);if(queuedFieldId===id)queuedFieldId=null;
    selectedFieldId=fields[Math.min(index,fields.length-1)].id;
    selectedPhraseKeys=new Set([phraseKey(selectedLayerId,selectedFieldId)]);
    if(deletingActive){activeFieldId=selectedFieldId;restoreField(activeField().snapshot);ghost=null;commit();}
    else{syncFields();persist();}
    q('[data-layer-id="'+selectedLayerId+'"][data-field-select="'+selectedFieldId+'"]')?.focus({preventScroll:true});status('Фраза удалена');
  }
  function editSelectedField() {
    if(typeof performancePatch!=='undefined'){liveEditorOpen=true;inspectField(selectedFieldId);resizeRing();return;}
    if(running)pause();chooseField(selectedFieldId);setEditorView('field');openInspector('source');
  }
  function ringAngle(event) {
    const rect=q('[data-fields]').getBoundingClientRect();
    return Math.atan2(event.clientY-rect.top-rect.height/2,event.clientX-rect.left-rect.width/2);
  }
  function beginFieldDrag(event,id,layerId=selectedLayerId) {
    if(event.shiftKey||phraseBatch()&&selectedPhraseKeys.has(phraseKey(layerId,id)))return;
    if(layerId!==selectedLayerId)selectLayer(layerId);
    if(event.button!==0||fieldDrag)return;
    const index=fields.findIndex(field=>field.id===id),angle=ringAngle(event);
    fieldDrag={id,layerId,pointer:event.pointerId,x:event.clientX,y:event.clientY,lastAngle:angle,rotation:index*360/fields.length,target:index,moved:false};
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}
  }
  function updateFieldDrag(event) {
    if(!fieldDrag||event.pointerId!==fieldDrag.pointer)return;
    if(!fieldDrag.moved&&Math.hypot(event.clientX-fieldDrag.x,event.clientY-fieldDrag.y)<6)return;
    if(!fieldDrag.moved){fieldDrag.moved=true;selectedFieldId=fieldDrag.id;q('[data-repeats-popover]').hidden=true;}
    const angle=ringAngle(event);let delta=angle-fieldDrag.lastAngle;
    if(delta>Math.PI)delta-=Math.PI*2;if(delta<-Math.PI)delta+=Math.PI*2;
    fieldDrag.rotation+=delta*180/Math.PI;fieldDrag.lastAngle=angle;
    const rect=q('[data-fields]').getBoundingClientRect();
    const target=compositionTools.slotAtPoint(event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2,fields.length);
    if(target!==null)fieldDrag.target=target;syncFields();
  }
  function endFieldDrag(cancel=false) {
    if(!fieldDrag)return;
    const previous=fieldDrag;fieldDrag=null;
    if(previous.moved){ignoreFieldClickUntil=performance.now()+400;if(!cancel)reorderField(previous.id,previous.target);}
    syncFields();
  }
  function positionFieldActions() {
    const actions=q('[data-field-actions]'),ring=q('[data-fields]');
    actions.hidden=!fields.length||!!fieldDrag?.moved||phraseSelectionCleared;
    if(root.classList.contains('performance-mode'))return;
    const index=fields.findIndex(field=>field.id===selectedFieldId);if(index<0)return;
    const angle=-Math.PI/2+(index+.5)*Math.PI*2/fields.length;
    const size=ring.getBoundingClientRect().width,panel=q('[data-composition]').getBoundingClientRect(),rect=ring.getBoundingClientRect();
    if(!size||!panel.width)return;
    const half=actions.offsetWidth/2||78,halfHeight=actions.offsetHeight/2||40;
    const x=clamp(size/2+Math.cos(angle)*size*.63,panel.left-rect.left+half+12,panel.right-rect.left-half-12);
    let y=clamp(size/2+Math.sin(angle)*size*.63,panel.top-rect.top+halfHeight+12,panel.bottom-rect.top-halfHeight-12);
    const clearance=size*.462+14,nearX=Math.max(0,Math.abs(x-size/2)-half),nearY=Math.max(0,Math.abs(y-size/2)-halfHeight);
    if(Math.hypot(nearX,nearY)<clearance){
      const offset=Math.sqrt(Math.max(0,clearance*clearance-nearX*nearX))+halfHeight;
      y=clamp(size/2+(Math.sin(angle)<0?-1:1)*offset,panel.top-rect.top+halfHeight+12,panel.bottom-rect.top-halfHeight-12);
    }
    actions.dataset.side=y>size/2?'bottom':'top';
    actions.style.left=x+'px';actions.style.top=y+'px';
  }
  async function addLayer(kind) {
    if(layers.length>=4)return;
    remember();captureField();storeCurrentLayer();
    const base=fieldSnapshot(),parts=typeof performancePatch==='undefined'?compositionTools.partFields(base,kind):score.partFields(base,kind);
    for(const field of parts){field.snapshot.scaleSettings=clone(base.scaleSettings);field.snapshot.scenes.autumn.forEach(source=>source.x=snapForSnapshot(source.x,field.snapshot));}
    const previousElapsed=elapsed;
    const layer=buildLayer({id:Math.max(0,...layers.map(item=>item.id))+1,kind,gain:.8,muted:false,fields:parts});
    if(running)layer.context.elapsed=previousElapsed;
    layers.push(layer);selectedLayerId=currentLayerId=layer.id;applyContext(layer.context);
    selectedPhraseKeys.clear();phraseSelectionCleared=false;compositionSourceFilter='all';
    q('[data-layer-picker]').hidden=true;if(!running)resetAllTransport();
    if(running){try{await initializeLayers();}catch(error){pause();status(error.message);}}
    sync();resizeRing();persist();
  }
  function discardLayers(ids) {
    storeCurrentLayer();
    for(const layer of layers)if(ids.has(layer.id)){layer.engine.stop();layer.engine.master?.disconnect();}
    layers=layers.filter(layer=>!ids.has(layer.id));
    selectedPhraseKeys=new Set([...selectedPhraseKeys].filter(key=>!ids.has(Number(key.split(':')[0]))));
    if(!layers.length)clearEmptyComposition();
    else if(ids.has(selectedLayerId)){selectedLayerId=currentLayerId=layers[0].id;applyContext(layers[0].context);}
    fieldDrag=null;ghost=null;drag=null;renderedLayers=null;updateLayerAudibility();
  }
  function removeLayer(id) {
    if(!layers.some(layer=>layer.id===id))return;
    remember();captureField();discardLayers(new Set([id]));
    if(!layers.length&&editorView!=='composition')setEditorView('composition');else sync();persist();
  }
  function syncLayers() {
    const panel=q('[data-layer-controls]'),signature=layers.map(layer=>layer.id).join(',');
    if(panel.dataset.layers!==signature||renderedLayers!==layers){
      renderedLayers=layers;panel.dataset.layers=signature;
      panel.replaceChildren(...layers.map(layer=>{
        const row=document.createElement('div');row.className='layer-row';row.dataset.layerRow=layer.id;
        const name=document.createElement('button');name.type='button';name.className='layer-name';name.textContent=compositionTools.PART_NAMES[layer.kind];name.addEventListener('click',()=>selectLayer(layer.id));
        const mute=document.createElement('button');mute.type='button';mute.className='layer-mute';mute.textContent='◉';mute.title='Приглушить слой';
        mute.addEventListener('click',()=>{remember();layer.muted=!layer.muted;layer.engine.muted=layer.muted;withLayer(layer,()=>{if(layer.muted)sound.stop();sound.configure(undefined,false);});syncLayers();syncFields();persist();});
        const gain=document.createElement('input');gain.type='range';gain.min=0;gain.max=1.5;gain.step=.01;gain.value=layer.gain;gain.dataset.layerGain=layer.id;gain.setAttribute('aria-label','Громкость слоя '+compositionTools.PART_NAMES[layer.kind]);
        gain.addEventListener('pointerdown',remember);gain.addEventListener('keydown',event=>{if(event.key.startsWith('Arrow'))remember();});
        gain.addEventListener('input',()=>{layer.gain=Number(gain.value);layer.engine.layerGain=layer.gain;withLayer(layer,()=>sound.configure(undefined,false));persist();});
        const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.className='layer-remove';remove.setAttribute('aria-label','Удалить слой '+compositionTools.PART_NAMES[layer.kind]);remove.addEventListener('click',()=>removeLayer(layer.id));
        row.append(name,mute,gain,remove);return row;
      }));
    }
    for(const layer of layers){
      const row=q('[data-layer-row="'+layer.id+'"]');row.querySelector('.layer-name').setAttribute('aria-pressed',String(layer.id===selectedLayerId));
      row.querySelector('.layer-mute').setAttribute('aria-pressed',String(layer.muted));row.querySelector('.layer-mute').setAttribute('aria-label',(layer.muted?'Включить':'Приглушить')+' слой '+compositionTools.PART_NAMES[layer.kind]);
      const input=row.querySelector('input');if(document.activeElement!==input)input.value=layer.gain;
    }
    root.dataset.layerCount=layers.length;
    q('[data-action="add-layer"]').disabled=layers.length>=4;
    q('[data-cycle-control]').hidden=editorView!=='composition';
    q('[data-control="cycle-beats"]').value=cycleBeats;
  }

  function svgNode(name,attributes={}) {
    const node=document.createElementNS('http://www.w3.org/2000/svg',name);
    for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);return node;
  }
  function syncFields() {
    storeCurrentLayer();syncLayers();
    const list=q('[data-field-list]'),membership=layers.flatMap(layer=>layer.fields.map(field=>layer.id+':'+field.id)).sort().join(',');
    if(list.dataset.members!==membership||renderedFields!==layers) {
      renderedFields=layers;list.dataset.members=membership;
      list.replaceChildren(...layers.flatMap(layer=>layer.fields.map(field=>{
        const card=document.createElement('div');card.className='field-card';card.dataset.fieldId=field.id;card.dataset.layerId=layer.id;
        const button=document.createElement('button');button.type='button';button.className='field-select';button.dataset.fieldSelect=field.id;button.dataset.layerId=layer.id;
        const svg=svgNode('svg',{viewBox:'0 0 1000 1000','aria-hidden':'true'}),sector=svgNode('g',{'data-sector':''});
        sector.append(svgNode('path',{class:'phrase-sector','data-sector-path':''}));svg.append(sector);button.append(svg);
        const label=document.createElement('span');label.className='phrase-label';
        for(const name of ['number','name','preview','rhythm']){const span=document.createElement('span');span.className='phrase-'+name;label.append(span);}button.append(label);
        button.addEventListener('pointerdown',event=>beginFieldDrag(event,field.id,layer.id));
        button.addEventListener('click',event=>{if(performance.now()<ignoreFieldClickUntil)return;if(event.shiftKey)chooseField(field.id,layer.id);else{liveEditorOpen=true;inspectField(field.id,layer.id);}syncFields();});
        button.addEventListener('dblclick',event=>{if(event.shiftKey||performance.now()<ignoreFieldClickUntil)return;event.preventDefault();editSelectedField();});
        button.addEventListener('keydown',event=>{
          if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='a'){event.preventDefault();selectedPhraseKeys=new Set(layers.flatMap(item=>item.fields.map(phrase=>phraseKey(item.id,phrase.id))));focusPhraseSelection();return;}
          if(['Delete','Backspace'].includes(event.key)){event.preventDefault();if(phraseBatch()&&selectedPhraseKeys.has(phraseKey(layer.id,field.id)))deletePhraseSelection();else{selectLayer(layer.id);deleteField(field.id);}}
          if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();selectLayer(layer.id);selectedFieldId=field.id;moveField(field.id,event.key==='ArrowLeft'?-1:1);}
        });card.append(button);return card;
      })));
    }
    for(const [depth,layer] of layers.entries()) {
      const context=layer.id===currentLayerId?contextState():layer.context;
      const order=fieldDrag?.moved&&fieldDrag.layerId===layer.id?compositionTools.reordered(layer.fields,fieldDrag.id,fieldDrag.target):layer.fields;
      const radii=compositionTools.ringRadii(layers.length,depth),middle=(radii.outer+radii.inner)/2;
      for(const [index,field] of order.entries()) {
        const card=q('[data-layer-id="'+layer.id+'"][data-field-id="'+field.id+'"]'),button=card.querySelector('button'),sector=card.querySelector('[data-sector]');
        const selected=!phraseSelectionCleared&&(selectedPhraseKeys.size?selectedPhraseKeys.has(phraseKey(layer.id,field.id)):layer.id===selectedLayerId&&field.id===selectedFieldId),active=field.id===context.activeFieldId,queued=field.id===context.queuedFieldId,dragging=fieldDrag?.moved&&fieldDrag.layerId===layer.id&&field.id===fieldDrag.id;
        card.dataset.active=active;card.dataset.selected=selected;card.dataset.queued=queued;card.dataset.dragging=!!dragging;card.dataset.muted=layer.muted;
        const rotation=dragging?fieldDrag.rotation:index*360/order.length;
        sector.style.transform='rotate('+rotation+'deg)';card.querySelector('[data-sector-path]').setAttribute('d',compositionTools.sectorPath(order.length,{...radii,notchStart:!dragging&&index===0,notchEnd:!dragging&&index===order.length-1}));
        const angle=-Math.PI/2+Math.PI/order.length+rotation*Math.PI/180,label=card.querySelector('.phrase-label');
        label.style.left=(50+middle/10*Math.cos(angle))+'%';label.style.top=(50+middle/10*Math.sin(angle))+'%';card.querySelector('.phrase-number').textContent=String(field.id).padStart(2,'0');
        const snapshot=active?{scenes:context.scenes,phraseLength:context.phraseLength}:field.snapshot;
        card.querySelector('.phrase-name').textContent=field.name;
        const pattern=card.querySelector('.phrase-rhythm'),signature=JSON.stringify([snapshot.phraseLength,snapshot.scenes.autumn.map(source=>[source.type,source.x,source.y,source.steps,source.muted])]);
        if(pattern.dataset.pattern!==signature){
          pattern.dataset.pattern=signature;
          card.querySelector('.phrase-preview').replaceChildren(...snapshot.scenes.autumn.filter(source=>!source.muted).map(source=>{const mark=document.createElement('i');mark.dataset.kind=source.type;mark.style.left=source.x*100+'%';mark.style.top=(1-source.y)*100+'%';return mark;}));
          pattern.replaceChildren(...Array.from({length:Math.min(16,snapshot.phraseLength)},(_,step)=>{const dot=document.createElement('i');dot.dataset.on=snapshot.scenes.autumn.some(source=>!source.muted&&source.type!=='fog'&&source.steps.includes(step));return dot;}));
        }
        button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',compositionTools.PART_NAMES[layer.kind]+' · фраза '+field.id+' · '+field.name+(active&&running?' · звучит':'')+(queued?' · следующая':''));
      }
    }
    const plusKey=layers.map(layer=>layer.id).join(',');
    if(list.dataset.plus!==plusKey){
      list.dataset.plus=plusKey;all('[data-layer-add]').forEach(button=>button.remove());
      for(const layer of layers){const button=document.createElement('button');button.type='button';button.className='ring-add-phrase';const symbol=document.createElement('span');symbol.className='add-symbol';symbol.setAttribute('aria-hidden','true');symbol.textContent='+';button.append(symbol);button.dataset.layerAdd=layer.id;button.setAttribute('aria-label','Добавить фразу в слой '+compositionTools.PART_NAMES[layer.kind]);button.title='Добавить фразу';button.addEventListener('click',()=>{selectLayer(layer.id);addField();});q('[data-fields]').append(button);}
    }
    for(const [depth,layer] of layers.entries()){const radii=compositionTools.ringRadii(layers.length,depth),button=q('[data-layer-add="'+layer.id+'"]');button.style.top=(50-(radii.outer+radii.inner)/20)+'%';button.style.setProperty('--add-scale',compositionTools.addButtonRadius(radii)*2/1000);button.disabled=layer.fields.length>=MAX_FIELDS;}
    const center=q('[data-action="add-layer"]'),inner=layers.length?compositionTools.ringRadii(layers.length,layers.length-1).inner:110;
    center.style.setProperty('--add-scale',Math.min(170,inner*1.55)/1000);
    q('[data-fields]').style.setProperty('--play-scale',Math.min(160,inner*1.55)/1000);
    if(!fields.length){q('[data-repeats-popover]').hidden=true;positionFieldActions();return;}
    if(!fields.some(field=>field.id===selectedFieldId))selectedFieldId=activeFieldId;
    const chosen=fields.find(field=>field.id===selectedFieldId),index=fields.indexOf(chosen);
    q('[data-control="sequence"]').checked=sequenceEnabled;q('[data-action="duplicate-field"]').disabled=phraseBatch()||fields.length>=MAX_FIELDS;q('[data-action="delete-field"]').disabled=phraseBatch()&&!removablePhrases().length;q('[data-action="edit-field"]').disabled=phraseBatch();
    q('[data-field-move="-1"]').disabled=phraseBatch()||index===0;q('[data-field-move="1"]').disabled=phraseBatch()||index===fields.length-1;
    const input=q('[data-control="field-repeats"]');if(document.activeElement!==input)controlState(input,phraseBatch()?editingFields().map(target=>target.field.repeats):[chosen.repeats]);
    q('[data-action="cue-field"]').disabled=phraseBatch();
    q('[data-action="delete-field"]').setAttribute('aria-label',phraseBatch()?'Удалить выбранные фразы':'Удалить фразу');
    q('[data-action="field-repeats"]').setAttribute('aria-expanded',String(!q('[data-repeats-popover]').hidden));q('[data-action="field-repeats"]').title='Повторы внутри сегмента: '+chosen.repeats;
    positionFieldActions();if(typeof syncPerformance==='function')syncPerformance();
  }

  const phraseKey=(layerId,fieldId)=>layerId+':'+fieldId;
  const sourceGroupKey=source=>source.sound?.instrument&&source.sound.instrument!=='default'?'instrument:'+source.sound.instrument:'type:'+source.type;
  function snapForSnapshot(x,snapshot) {
    const settings=snapshot.scaleSettings?.autumn||{tonic:0,mode:'majorPent'},steps=modes[settings.mode].steps;
    if(!steps)return clamp(x,0,1);const notes=[];
    for(let note=PITCH_MIN;note<=PITCH_MIN+PITCH_SPAN;note++)if(steps.includes(((note-settings.tonic)%12+12)%12))notes.push(note);
    const raw=PITCH_MIN+x*PITCH_SPAN;return (notes.reduce((nearest,note)=>Math.abs(note-raw)<Math.abs(nearest-raw)?note:nearest)-PITCH_MIN)/PITCH_SPAN;
  }
  const phraseBatch=()=>editorView==='composition'&&selectedPhraseKeys.size>1;
  function editingFields() {
    storeCurrentLayer();
    if(editorView==='composition'&&phraseSelectionCleared)return [];
    if(!layers.length)return activeField()?[{layer:null,field:activeField(),live:true,snapshot:fieldSnapshot()}]:[];
    return layers.flatMap(layer=>layer.fields.filter(field=>editorView==='composition'?(selectedPhraseKeys.size?selectedPhraseKeys.has(phraseKey(layer.id,field.id)):layer.id===selectedLayerId&&field.id===selectedFieldId):layer.id===selectedLayerId&&field.id===activeFieldId).map(field=>{
      const live=field.id===layer.context.activeFieldId,c=layer.context;
      return {layer,field,live,snapshot:live?{...field.snapshot,phraseLength:c.phraseLength,scenes:c.scenes,scaleSettings:c.scaleSettings,waveforms:c.waveforms,soundSettings:c.soundSettings}:field.snapshot};
    }));
  }
  function editingSources() {
    const targets=editingFields();
    return targets.flatMap(target=>target.snapshot.scenes.autumn.filter(source=>editorView==='composition'?compositionSourceFilter==='all'||sourceGroupKey(source)===compositionSourceFilter||source.type===compositionSourceFilter:selectedSourceIds.has(source.id)).map(source=>({...target,source,items:target.snapshot.scenes.autumn})));
  }
  function selectSources(ids) {
    selectedSourceIds=new Set(ids.filter(id=>scene().some(source=>source.id===id)));
    if(!selectedSourceIds.has(selectedId))selectedId=[...selectedSourceIds][0]??null;
  }
  function selectSource(id,additive=false) {
    const ids=additive?new Set(selectedSourceIds):new Set();
    if(additive&&ids.has(id))ids.delete(id);else ids.add(id);
    selectSources([...ids]);openInspector('source');sync();
  }
  function finishSourceEdits(entries,activateHeld=false) {
    const liveLayers=new Set(entries.filter(entry=>entry.live).map(entry=>entry.layer));
    const update=()=>{sound.cancelHeldSchedules();for(const event of phraseEvents)event.heldScheduled=false;if(activateHeld)for(const entry of entries){const source=scene().find(item=>item.id===entry.source.id);if(entry.live&&(entry.layer?entry.layer.id===currentLayerId:!layers.length)&&source&&typeFor(source.type).sustained&&heldOnStep(source,playingStep))activatedHeld.add(source.id);}sound.configure(undefined,false);captureField();};
    for(const layer of liveLayers)if(layer)withLayer(layer,update);else update();
    sync();persist();
  }
  function editSources(update,record=true) {
    if(!editingSources().length)return;
    if(record)remember();const entries=editingSources();
    for(const entry of entries)update(entry.source,entry);
    if(editorView==='composition'&&compositionSourceFilter!=='all'&&!entries.some(entry=>sourceGroupKey(entry.source)===compositionSourceFilter)){const keys=[...new Set(entries.map(entry=>sourceGroupKey(entry.source)))];compositionSourceFilter=keys.length===1?keys[0]:'all';}
    finishSourceEdits(entries);
  }
  function editFields(update,record=true) {
    if(!editingFields().length)return;
    if(record)remember();const targets=editingFields();
    for(const target of targets){
      const snapshot=clone(target.snapshot);snapshot.soundSettings={...snapshot.soundSettings,autumn:cleanMix(snapshot.soundSettings?.autumn)};snapshot.scaleSettings={...snapshot.scaleSettings,autumn:snapshot.scaleSettings?.autumn||{tonic:0,mode:'majorPent'}};snapshot.waveforms={...snapshot.waveforms,autumn:snapshot.waveforms?.autumn||[...worlds.autumn.waves]};update(snapshot);
      if(target.live){
        const apply=()=>{const ids=[...selectedSourceIds],oldLength=phraseLength;restoreField(snapshot);selectSources(ids);if(oldLength!==phraseLength)resetTransport();sound.cancelHeldSchedules();for(const event of phraseEvents)event.heldScheduled=false;sound.configure(undefined,isEditorLayer());captureField();};
        if(target.layer)withLayer(target.layer,apply);else apply();
      }else target.field.snapshot=snapshot;
    }
    sync();persist();
  }
  function setSourceParameter(key,value) {editSources(source=>{
    (source.sound??=cleanSourceSettings({},source.type))[key]=value;
    const preset=instruments.get(source.sound.instrument);
    if(['wave','noise','fm','harmonicity','sub','vibrato','motion','lfoRate','pulse','drive'].includes(key)&&preset&&preset.category!=='waves'&&preset.category!=='drums'){
      const wave=source.sound.wave==='auto'?preset.settings.wave:source.sound.wave;
      source.sound.instrument='wave-'+wave;source.sound.channel=String(preset.channel);
    }
  },false);}
  function setPositionParameter(key,value) {
    const x=key!=='pitch'?0:scale().mode==='free'?value/(PITCH_SPAN*100):(allowedNotes()[value]-PITCH_MIN)/PITCH_SPAN;
    editSources((source,entry)=>{if(key==='volume')source.y=value/100;else source.x=snapForSnapshot(x,entry.snapshot);},false);
  }
  function deleteSources() {
    if(!editingSources().length)return;remember();const entries=editingSources();
    for(const entry of entries){
      if(entry.live){const stop=()=>{sound.stopSource(entry.source.id);activatedHeld.delete(entry.source.id);particles=particles.filter(p=>p.id!==entry.source.id);};if(entry.layer)withLayer(entry.layer,stop);else stop();}
      const index=entry.items.indexOf(entry.source);if(index>=0)entry.items.splice(index,1);
    }
    for(const layer of new Set(entries.filter(entry=>entry.live).map(entry=>entry.layer))){const reset=()=>selectSources(scene().length?[scene()[0].id]:[]);if(layer)withLayer(layer,reset);else reset();}
    finishSourceEdits(entries);
  }
  function duplicateSources() {
    const entries=editingSources();if(!entries.length)return;
    if(entries.some(entry=>entry.items.length+entries.filter(other=>other.items===entry.items).length>MAX_SOURCES)){status('На сцене может быть до 16 предметов');return;}
    remember();const copies=[];
    for(const entry of editingSources()){
      const copy=clone(entry.source);
      if(entry.live){const add=()=>{copy.id=nextId++;copy.x=stepX(copy.x,1);entry.items.push(copy);copies.push(copy.id);};if(entry.layer)withLayer(entry.layer,add);else add();}
      else{const snapshot=entry.field.snapshot;copy.id=Math.max(Number(snapshot.nextId)||1,...Object.values(snapshot.scenes).flat().map(source=>source.id+1));snapshot.nextId=copy.id+1;copy.x=snapForSnapshot(clamp(copy.x+1/PITCH_SPAN,0,1),snapshot);entry.items.push(copy);}
    }
    if(!phraseBatch())selectSources(copies);finishSourceEdits(entries);
  }
  function muteSources() {
    const muted=!editingSources().every(entry=>entry.source.muted);
    editSources((source,entry)=>{source.muted=muted;if(muted&&entry.live){const stop=()=>{sound.stopSource(source.id);particles.filter(p=>p.id===source.id&&!p.done).forEach(p=>p.scheduled=false);};if(entry.layer)withLayer(entry.layer,stop);else stop();}});
  }
  function controlState(input,values,output,format=value=>String(value)) {
    if(!values.length){input.disabled=true;input.dataset.mixed='false';if(output)output.textContent='';return {value:undefined,mixed:false};}
    input.disabled=false;
    const state=selectionTools.common(values);input.dataset.mixed=String(state.mixed);if(input.tagName!=='SELECT')input.title=state.mixed?'Разные значения':'';
    if(input.tagName==='SELECT'){
      let option=input.querySelector('[data-mixed-option]');
      if(state.mixed&&!option){option=document.createElement('option');option.value='__mixed';option.textContent='Разные';option.disabled=true;option.dataset.mixedOption='';input.prepend(option);}
      if(!state.mixed)option?.remove();input.value=state.mixed?'__mixed':state.value;
    }else input.value=state.value;
    input.setAttribute('aria-valuetext',state.mixed?'Разные значения':format(state.value));
    if(output)output.textContent=state.mixed?'Разные':format(state.value);
    return state;
  }
  function togglePhraseSelection(layerId,id) {
    phraseSelectionCleared=false;
    if(!selectedPhraseKeys.size)selectedPhraseKeys.add(phraseKey(selectedLayerId,selectedFieldId));
    const key=phraseKey(layerId,id);if(selectedPhraseKeys.has(key))selectedPhraseKeys.delete(key);else selectedPhraseKeys.add(key);
    focusPhraseSelection();
  }
  function focusPhraseSelection() {
    if(selectedPhraseKeys.size)phraseSelectionCleared=false;
    const key=selectedPhraseKeys.has(phraseKey(selectedLayerId,selectedFieldId))?phraseKey(selectedLayerId,selectedFieldId):[...selectedPhraseKeys][0];
    if(key){const [layerId,id]=key.split(':').map(Number);selectLayer(layerId,true);selectedFieldId=id;
      if(!running&&id!==activeFieldId){captureField();resetTransport();activeFieldId=id;restoreField(activeField().snapshot);}
    }
    openInspector('source');sync();
  }

  function removablePhrases() {
    return layers.flatMap(layer=>layer.fields.filter(field=>selectedPhraseKeys.has(phraseKey(layer.id,field.id))).map(field=>({layer,field})));
  }
  function deletePhraseSelection() {
    if(phraseSelectionCleared)return;
    if(!phraseBatch()){deleteField(selectedFieldId);return;}
    const removed=removablePhrases();if(!removed.length)return;remember();storeCurrentLayer();
    const emptyLayers=new Set(layers.filter(layer=>removed.filter(target=>target.layer===layer).length===layer.fields.length).map(layer=>layer.id));
    for(const layer of new Set(removed.map(target=>target.layer).filter(layer=>!emptyLayers.has(layer.id))))withLayer(layer,()=>{
      captureField();const ids=new Set(removed.filter(target=>target.layer===layer).map(target=>target.field.id)),index=fields.findIndex(field=>field.id===activeFieldId),activeRemoved=ids.has(activeFieldId);
      if(activeRemoved)resetTransport();
      fields.splice(0,fields.length,...fields.filter(field=>!ids.has(field.id)));
      if(ids.has(queuedFieldId))queuedFieldId=null;
      if(activeRemoved){activeFieldId=fields[Math.min(index,fields.length-1)].id;restoreField(activeField().snapshot);sound.configure(undefined,false);}
      if(!fields.some(field=>field.id===selectedFieldId))selectedFieldId=activeFieldId;
      captureField();
    });
    if(emptyLayers.size)discardLayers(emptyLayers);
    for(const target of removed)selectedPhraseKeys.delete(phraseKey(target.layer.id,target.field.id));
    focusPhraseSelection();persist();status('Удалены фразы: '+removed.length);
  }
  function beginMarquee(event,scope) {
    if(event.button!==0||event.target.closest('button,input,select,[data-field-actions],[data-layer-picker]'))return;
    const area=scope==='sources'?stage:q('[data-composition]'),rect=area.getBoundingClientRect();
    const focus=scope==='sources'?canvas:area;focus.tabIndex=0;focus.focus({preventScroll:true});
    const candidates=scope==='sources'?all('[data-source-id]').map(button=>({key:Number(button.dataset.sourceId),bounds:button.getBoundingClientRect()})):all('[data-field-id]').map(card=>{
      const path=card.querySelector('[data-sector-path]'),matrix=path.getScreenCTM(),length=path.getTotalLength();
      const polygon=Array.from({length:64},(_,index)=>{const p=path.getPointAtLength(length*index/64);return {x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f};});
      return {key:phraseKey(Number(card.dataset.layerId),Number(card.dataset.fieldId)),polygon};
    });
    marquee={scope,pointer:event.pointerId,start:{x:event.clientX,y:event.clientY},point:{x:event.clientX,y:event.clientY},area:rect,candidates,additive:event.shiftKey,previousCleared:phraseSelectionCleared,previousId:selectedId,previousSources:new Set(selectedSourceIds),previousPhrases:new Set(selectedPhraseKeys.size||phraseSelectionCleared?selectedPhraseKeys:[phraseKey(selectedLayerId,selectedFieldId)]),moved:false};
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}
  }
  function updateMarquee(event) {
    if(!marquee||event.pointerId!==marquee.pointer)return;
    const m=marquee;m.point={x:clamp(event.clientX,m.area.left,m.area.right),y:clamp(event.clientY,m.area.top,m.area.bottom)};
    if(!m.moved&&Math.hypot(m.point.x-m.start.x,m.point.y-m.start.y)<5)return;
    m.moved=true;ghost=null;const box=selectionTools.rect(m.start,m.point),panel=q('.canvas-panel').getBoundingClientRect(),overlay=q('[data-marquee]');
    overlay.hidden=false;overlay.style.left=box.left-panel.left+'px';overlay.style.top=box.top-panel.top+'px';overlay.style.width=box.right-box.left+'px';overlay.style.height=box.bottom-box.top+'px';
    const hits=m.candidates.filter(candidate=>candidate.polygon?selectionTools.polygonIntersects(box,candidate.polygon):selectionTools.intersects(box,candidate.bounds)).map(candidate=>candidate.key);
    if(m.scope==='sources'){selectSources([...new Set([...(m.additive?m.previousSources:[]),...hits])]);syncSources();paint();}
    else{selectedPhraseKeys=new Set([...(m.additive?m.previousPhrases:[]),...hits]);phraseSelectionCleared=!selectedPhraseKeys.size;syncFields();}
  }
  function endMarquee(cancel=false) {
    if(!marquee)return;const m=marquee;marquee=null;q('[data-marquee]').hidden=true;
    if(m.moved){ignoreSurfaceClickUntil=performance.now()+150;
      if(cancel){phraseSelectionCleared=m.previousCleared;selectedId=m.previousId;selectedSourceIds=m.previousSources;selectedPhraseKeys=m.previousPhrases;}
      if(m.scope==='phrases')focusPhraseSelection();else{selectSources([...selectedSourceIds]);openInspector('source');sync();}
    }else if(!cancel&&m.scope==='phrases'&&!m.additive){selectedPhraseKeys.clear();phraseSelectionCleared=true;sync();}
  }
  function startSourceDrag(event,id) {
    if(event.button!==0)return;event.preventDefault();event.currentTarget.focus({preventScroll:true});
    if(event.shiftKey){selectSource(id,true);return;}
    if(!selectedSourceIds.has(id))selectSources([id]);else selectedId=id;
    openInspector('source');drag={id,pointer:event.pointerId,recorded:false,start:coordinates(event),origins:scene().filter(source=>selectedSourceIds.has(source.id)).map(source=>({id:source.id,x:source.x,y:source.y}))};
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}sync();
  }
  function sourceKey(event,id) {
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='a'){event.preventDefault();selectSources(scene().map(source=>source.id));sync();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace'].includes(event.key))return;
    event.preventDefault();if(!selectedSourceIds.has(id))selectSources([id]);selectedId=id;
    if(event.key==='Delete'||event.key==='Backspace'){removeSource();return;}
    editSources(source=>{if(event.key==='ArrowLeft')source.x=stepX(source.x,-1);if(event.key==='ArrowRight')source.x=stepX(source.x,1);if(event.key==='ArrowUp')source.y=clamp(source.y+.05,.08,.92);if(event.key==='ArrowDown')source.y=clamp(source.y-.05,.08,.92);});
  }

  function remember(){history.push(serial());if(history.length>20)history.shift();q('[data-action="undo"]').disabled=false;}
  function commit(){sound.cancelHeldSchedules();for(const event of phraseEvents)event.heldScheduled=false;sound.configure();sync();persist();}
  function anchorClock(){audioAnchor=((audioHost?.context||sound.context)?.currentTime||0)-elapsed;wallAnchor=performance.now()/1000-elapsed;}
  function resetTransport(isolated=usesCycleClock()){sound.stop();if(!isolated)elapsed=0;beat=0;nextPhraseBeat=0;playingStep=null;playingStepAt=null;phraseEvents=[];particles=[];ripples=[];activatedHeld.clear();queuedFieldId=null;fieldCycle=0;if(!isolated)anchorClock();lastTime=performance.now();if(isEditorLayer())syncPlayhead();}
  function addSource(type,x,y,template=null){if(!activeField())return;if(scene().length>=MAX_SOURCES){status('На сцене уже 16 источников');return;}remember();const e={id:nextId++,type,x:snapX(x),y:clamp(y,.08,.92),steps:template?[...template.steps]:typeFor(type).sustained?allPhraseSteps():[0],muted:template?.muted||false,sound:cleanSourceSettings(template?.sound||{...instruments.get(toolInstrument)?.settings,instrument:toolInstrument,channel:instruments.get(toolInstrument)?.category==='waves'?(currentLayer()?.kind==='melody'?'1':'0'):'auto'},type)};scene().push(e);selectedId=e.id;selectedSourceIds=new Set([e.id]);openInspector('source');commit();status(typeFor(type).sustained?'Непрерывная нота: выбери справа доли, на которых она звучит':'Источник размещён. Отметь справа доли, на которых он звучит');}
  function removeSource(){deleteSources();}
  function setScale(property,value){editFields(snapshot=>{snapshot.scaleSettings.autumn[property]=value;snapshot.scenes.autumn.forEach(source=>source.x=snapForSnapshot(source.x,snapshot));});ghost=null;}
  function coordinates(event){const rect=canvas.getBoundingClientRect();return {x:clamp((event.clientX-rect.left-geom.left)/(geom.right-geom.left),0,1),y:clamp((geom.bottom-(event.clientY-rect.top))/(geom.bottom-geom.top),.08,.92)};}
  function inField(event){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;return x>=geom.left&&x<=geom.right&&y>=geom.top&&y<=geom.bottom;}
  function syncPitchEditor(){
    const entries=editingSources();if(!entries.length)return;
    const input=q('[data-control="pitch"]'),notes=allowedNotes(),free=scale().mode==='free';
    input.min=0;input.max=free?PITCH_SPAN*100:notes.length-1;input.step=1;
    const values=entries.map(entry=>free?Math.round(entry.source.x*PITCH_SPAN*100):notes.indexOf(noteFor(entry.source.x)));
    controlState(input,values,q('[data-value="pitch"]'),value=>noteName(free?PITCH_MIN+value/100:notes[value]));
    input.disabled=selectionTools.common(entries.map(entry=>JSON.stringify(entry.snapshot.scaleSettings?.autumn))).mixed;
  }
  function toggleStep(step){if(!editingSources().length)return;remember();const entries=editingSources();selectionTools.toggleStep(entries.map(entry=>entry.source),step);finishSourceEdits(entries,true);}
  function syncPattern(){
    const entries=editingSources(),items=entries.map(entry=>entry.source),group=q('[data-steps]'),length=entries.length?Math.min(...entries.map(entry=>entry.snapshot.phraseLength)):phraseLength;
    group.hidden=false;
    if(group.children.length!==length){group.replaceChildren(...Array.from({length},(_,step)=>{const button=document.createElement('button');button.type='button';button.textContent=step+1;button.dataset.step=step;button.addEventListener('click',()=>toggleStep(step));return button;}));}
    for(const button of group.children){const step=Number(button.dataset.step),state=selectionTools.stepState(items,step);button.setAttribute('aria-pressed',state);button.dataset.mixed=String(state==='mixed');button.disabled=!items.length;button.setAttribute('aria-label','Доля '+(step+1)+(items.length>1?' для выбранных предметов':items.length?' для '+typeFor(items[0].type).name+' '+items[0].id:''));}
    q('[data-pattern-label]').textContent=items.length>1?'Ритм выбранных предметов':items.length&&typeFor(items[0].type).sustained?'Непрерывно на долях':'Звучит на долях';
    q('[data-period]').textContent='';
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
      if(!button){button=document.createElement('button');button.type='button';button.className='ll-source';button.dataset.sourceId=String(e.id);button.addEventListener('pointerdown',event=>startSourceDrag(event,e.id));button.addEventListener('click',event=>{if(event.detail===0)selectSource(e.id,event.shiftKey);persist();});button.addEventListener('keydown',event=>sourceKey(event,e.id));sourceButtons.set(e.id,button);q('[data-sources]').appendChild(button);}
      const p=position(e);button.style.left=p.x+'px';button.style.top=p.y+'px';button.setAttribute('aria-pressed',String(selectedSourceIds.has(e.id)));button.setAttribute('aria-label',sourceName(e)+' '+e.id+', '+noteName(noteFor(e.x))+', громкость '+Math.round(e.y*100)+'%, '+patternLabel(e)+(e.muted?', приглушён':''));
    }
  }
  function choosePalette(category) {
    category=category==='drums'?'drums':'waves';paletteCategory=category;
    if(category==='landscape') {toolInstrument='default';if(!typeFor(tool))tool=world().types[0].id;}
    else {
      const preset=instruments.get(toolInstrument)?.category===category?instruments.get(toolInstrument):instruments.forCategory(category)[0];
      toolInstrument=preset.id;tool=instruments.typeFor(preset,worldKey);
    }
  }
  function syncPalette() {
    const layerKey=selectedLayerId+':'+worldKey;
    if(paletteLayer!==layerKey) {
      paletteLayer=layerKey;
      const kind=currentLayer()?.kind;
      choosePalette(kind==='drums'?'drums':'waves');
    }
    const brush=instruments.get(toolInstrument);
    if(brush&&['waves','drums'].includes(brush.category)&&paletteCategory!==brush.category)paletteCategory=brush.category;
    const palette=q('[data-palette]'),signature=worldKey+':'+paletteCategory;
    if(palette.dataset.library!==signature) {
      palette.dataset.library=signature;
      const presets=paletteCategory==='landscape'?world().types.map(type=>({id:'default',type:type.id,name:type.name,texture:type.sustained?'Непрерывная нота':type.voice})):instruments.forCategory(paletteCategory).map(preset=>({...preset,type:instruments.typeFor(preset,worldKey)}));
      palette.replaceChildren(...presets.map(preset=>{
        const button=document.createElement('button');button.type='button';button.dataset.type=preset.type;button.dataset.instrument=preset.id;
        button.title=preset.name+' · '+preset.texture;button.setAttribute('aria-label',preset.name+' · '+preset.texture);
        const icon=document.createElement('canvas');icon.width=96;icon.height=96;icon.setAttribute('aria-hidden','true');
        const info=document.createElement('span');info.className='tool-info';
        const name=document.createElement('span');name.className='tool-name';name.textContent=preset.name;
        const texture=document.createElement('small');texture.textContent=preset.texture;info.append(name,texture);button.append(icon,info);
        button.addEventListener('click',()=>{tool=preset.type;toolInstrument=preset.id;sync();persist();status(preset.name+': нанеси на свободное место холста');});
        drawToolIcon(icon,preset.type,preset.id);return button;
      }));
      palette.scrollLeft=0;
    }
    all('[data-instrument-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.instrumentCategory===paletteCategory)));
    for(const button of palette.children)button.setAttribute('aria-pressed',String(button.dataset.type===tool&&button.dataset.instrument===toolInstrument));
    q('[data-brush-name]').textContent=instruments.get(toolInstrument)?.name || typeFor(tool).name;
  }
  function changeInstrument(id) {
    const preset=instruments.get(id);if(id!=='default'&&!preset)return;
    editSources((source,entry)=>{
      if(entry.live){const stop=()=>sound.stopSource(source.id);if(entry.layer)withLayer(entry.layer,stop);else stop();}
      const previous=source.sound;
      if(preset)source.type=instruments.typeFor(preset,entry.snapshot.worldKey);
      source.sound=cleanSourceSettings({...SOURCE_DEFAULTS,...preset?.settings,instrument:id,gain:previous.gain,pan:previous.pan,detune:previous.detune},source.type);
    });
  }
  function syncPerformanceSources() {
    const panel=q('[data-performance-sources]'),targets=editingFields();panel.hidden=editorView!=='composition';
    const sources=targets.flatMap(target=>target.snapshot.scenes.autumn),group=q('[data-source-chips]');
    q('[data-performance-heading]').textContent='Источники · '+targets.length+' '+(targets.length===1?'фраза':'фразы');
    const keys=[...new Set(sources.map(sourceGroupKey))];
    const signature=JSON.stringify([keys,sources.map(source=>[sourceGroupKey(source),sourceName(source)]),compositionSourceFilter]);
    if(group.dataset.signature!==signature){
      group.dataset.signature=signature;
      group.replaceChildren(...['all',...keys].map(key=>{
        const button=document.createElement('button');button.type='button';button.dataset.sourceGroup=key;
        button.textContent=key==='all'?'Все':sourceName(sources.find(source=>sourceGroupKey(source)===key));
        button.setAttribute('aria-pressed',String(compositionSourceFilter===key));
        button.addEventListener('click',()=>{compositionSourceFilter=key;openInspector('source');sync();});return button;
      }));
    }
    const entries=editingSources(),mode=q('[data-control="voice-mode"]');
    controlState(mode,entries.length?entries.map(entry=>typeFor(entry.source.type).sustained?'held':'note'):['note']);
    mode.disabled=!entries.length||entries.some(entry=>sourceChannel(entry.source)===2);
    for(const button of all('[data-sound-preset]'))button.disabled=!entries.length||entries.some(entry=>sourceChannel(entry.source)===2);
  }
  function syncEnvelope() {
    const canvas=q('[data-envelope]'),context=canvas.getContext('2d'),entry=editingSources()[0];
    context.clearRect(0,0,canvas.width,canvas.height);if(!entry)return;
    const settings=entry.source.sound,total=settings.attack+settings.decay+settings.duration+settings.release;
    const x=time=>14+time/total*(canvas.width-28),y=level=>canvas.height-22-level*(canvas.height-38);
    const points=[[0,0],[settings.attack,1],[settings.attack+settings.decay,settings.sustain],[total-settings.release,settings.sustain],[total,0]];
    context.strokeStyle='#5a7546';context.fillStyle='#5a75461a';context.lineWidth=3;
    context.beginPath();points.forEach(([time,level],index)=>index?context.lineTo(x(time),y(level)):context.moveTo(x(time),y(level)));context.stroke();
    context.lineTo(x(total),y(0));context.closePath();context.fill();
    context.font='18px sans-serif';context.fillStyle='#829275';context.fillText('A',x(settings.attack),canvas.height-2);context.fillText('D',x(settings.attack+settings.decay),canvas.height-2);context.fillText('S',x(total-settings.release),canvas.height-2);context.fillText('R',canvas.width-24,canvas.height-2);
    canvas.setAttribute('aria-label','Огибающая: атака '+formatParameter('attack',settings.attack)+', спад '+formatParameter('decay',settings.decay)+', удержание '+Math.round(settings.sustain*100)+'%, отпускание '+formatParameter('release',settings.release));
  }
  function liveEditorModel() {
    if(!liveEditorOpen||editorView!=='composition')return null;
    const target=editingFields().find(target=>target.field.id===selectedFieldId&&(!target.layer||target.layer.id===selectedLayerId));if(!target)return null;
    return {key:phraseKey(selectedLayerId,target.field.id),name:target.field.name,snapshot:target.snapshot,playing:running&&target.live,step:target.live?(target.layer?.context.playingStep??playingStep):null,target};
  }
  function updateLivePhrase(update) {
    const model=liveEditorModel();if(!model)return;const target=model.target,ids=new Set(target.snapshot.scenes.autumn.map(source=>source.id));
    update(target.snapshot);
    if(target.live){
      const apply=()=>{
        nextId=Math.max(nextId,target.snapshot.nextId||1,...scene().map(source=>source.id+1));
        if(!scene().some(source=>source.id===selectedId))selectedId=scene()[0]?.id||null;selectSources([...selectedSourceIds]);
        sound.cancelPending(ids);sound.cancelHeldSchedules();
        for(const id of ids)if(!scene().some(source=>source.id===id)){sound.stopSource(id);activatedHeld.delete(id);}
        particles=particles.filter(p=>{const source=scene().find(source=>source.id===p.id);if(!source||!heldOnStep(source,p.step))return false;if(!p.done){p.x=source.x;p.y=source.y;p.note=noteFor(source.x);p.sound=source.sound;p.scheduled=false;}return true;});
        for(const event of phraseEvents){event.heldScheduled=false;if(event.at<=elapsed)continue;for(const source of scene()){
          const group=event.cycle*phraseLength+event.step;
          if(!source.muted&&!typeFor(source.type).sustained&&heldOnStep(source,event.step)&&!particles.some(p=>p.id===source.id&&p.group===group))particles.push({...source,note:noteFor(source.x),start:event.at-FALL_TIME,step:event.step,group,done:false,scheduled:false});
        }}
        for(const source of scene())if(typeFor(source.type).sustained&&heldOnStep(source,playingStep))activatedHeld.add(source.id);
        sound.configure(undefined,false);captureField();
      };
      if(target.layer)withLayer(target.layer,apply);else apply();
    }else target.field.snapshot=clone(target.snapshot);
    sync();persist();
  }
  function createLiveSource(brush,snapshot,x,y) {
    const held=brush==='held',channel=brush==='0'?0:brush==='1'||held?1:2,preset=channel===2?instruments.get(brush):instruments.get('wave-'+performancePatch.voices[channel].wave);
    const type=held?'fog':channel===2?'raven':channel===0?'drop':'leaf';
    const id=Math.max(snapshot.nextId||1,...Object.values(snapshot.scenes).flat().map(source=>source.id+1));snapshot.nextId=id+1;
    return {id,type,x:snapForSnapshot(channel===2&&x===.5?0:x,snapshot),y:clamp(y,.08,.92),muted:false,steps:held?Array.from({length:snapshot.phraseLength},(_,i)=>i):[0],sound:cleanSourceSettings({...preset.settings,channel:String(channel),instrument:preset.id,...(held?{attack:.2,sustain:.5,release:.5}:{})},type)};
  }
  function syncPerformance() {
    if(typeof performancePatch==='undefined')return;
    syncViewControls();
    performanceUI?.render();liveUI?.render();
    const current=activeField(),next=fields.find(field=>field.id===nextFieldId());
    q('[data-current-phrase]').textContent=current?.name||'Пустая композиция';
    q('[data-next-phrase]').textContent=next?(queuedFieldId!==null?'Выбрана следующей: ':'Далее: ')+next.name:'По кругу';
    const button=q('[data-action="performance-play"]');button.textContent=running?'Ⅱ':'▶';button.setAttribute('aria-pressed',String(running));button.setAttribute('aria-label',running?'Пауза':'Играть композицию');button.disabled=!fields.length;
  }
  function sync(){
    if(!layers.length&&!fields.length&&editorView!=='composition'){setEditorView('composition');return;}
    q('[data-action="play"]').disabled=!fields.length;q('[data-action="restart"]').disabled=!fields.length;
    for(const action of ['audition-tool','place-center','example','clear'])q('[data-action="'+action+'"]').disabled=!fields.length;
    all('[data-editor-view]').forEach(button=>button.disabled=!fields.length&&button.dataset.editorView!=='composition');
    q('[data-control="tempo"]').value=compositionTempo;
    const fieldTargets=editingFields();
    controlState(q('[data-control="phrase-length"]'),fieldTargets.map(target=>target.snapshot.phraseLength));
    controlState(q('[data-control="tonic"]'),fieldTargets.map(target=>target.snapshot.scaleSettings?.autumn?.tonic??0));
    controlState(q('[data-control="mode"]'),fieldTargets.map(target=>target.snapshot.scaleSettings?.autumn?.mode||'majorPent'));
    q('[data-control="tonic"]').disabled=fieldTargets.every(target=>target.snapshot.scaleSettings?.autumn?.mode==='free');
    root.dataset.world=worldKey;root.classList.toggle('is-playing',running);q('[data-empty]').hidden=scene().length>0;q('[data-audio-status]').textContent=running?'Звучит':sound.context?'Пауза':'Готов к игре';root.classList.toggle('ll-audio-on',showAudio);q('[data-live-notes]').hidden=!showAudio;
    q('[data-grid-summary]').textContent=(scale().mode==='free'?'Плавная частота · без привязки':allowedNotes().length+' разрешённых позиций')+' · C3–C5';
    canvas.setAttribute('aria-label','Пейзаж: X задаёт высоту звука от C3 до C5, Y задаёт громкость. Кольца источников разделены на '+phraseLength+' долей фразы; доли предмета выделены. '+(scale().mode==='free'?'Свободное размещение.':'Привязка к '+modes[scale().mode].name+', тоника '+pitchNames[scale().tonic]+'.')+(showAudio?' Показаны звучащие ноты, частотный спектр и форма реального звука.':''));
    q('[data-action="play"]').textContent=running?'Пауза':'Играть';q('[data-action="play"]').setAttribute('aria-pressed',String(running));
    syncPalette();
    const entries=editingSources(),items=entries.map(entry=>entry.source),sourceSelect=q('[data-control="source"]');
    const option=(value,label,disabled=false)=>{const node=document.createElement('option');node.value=value;node.textContent=label;node.disabled=disabled;return node;};
    if(editorView==='composition'){
      const sources=editingFields().flatMap(target=>target.snapshot.scenes.autumn),groups=[...new Set(sources.map(sourceGroupKey))];
      const missing=compositionSourceFilter!=='all'&&!groups.includes(compositionSourceFilter);
      sourceSelect.replaceChildren(option('all','Все предметы · '+sources.length),...(missing?[option(compositionSourceFilter,'Нет предметов',true)]:[]),...groups.map(key=>option(key,sourceName(sources.find(source=>sourceGroupKey(source)===key))+' · '+sources.filter(source=>sourceGroupKey(source)===key).length)));sourceSelect.value=compositionSourceFilter;
    }else{
      sourceSelect.replaceChildren(...(items.length>1?[option('__selection','Выбрано · '+items.length,true)]:[]),...scene().map(source=>option(source.id,sourceName(source)+' '+source.id)));sourceSelect.value=items.length>1?'__selection':selectedId||'';
    }
    sourceSelect.disabled=!editingFields().some(target=>target.snapshot.scenes.autumn.length);q('[data-action="audition"]').disabled=!items.length||editorView==='composition';drawToolIcon(q('[data-selected-icon]'),items[0]?.type||tool,items[0]?.sound.instrument||toolInstrument);
    q('[data-selection]').textContent=editorView==='composition'?'Фразы · '+fieldTargets.length:items.length>1?'Предметы · '+items.length:items.length?['Синт 1','Синт 2','Барабаны'][sourceChannel(items[0])]+' · '+(items[0].muted?'приглушён':'активен'):'Нет выделения';
    root.dataset.selectionCount=phraseBatch()?selectedPhraseKeys.size:items.length;
    q('[data-editor-fields]').disabled=!items.length;q('[data-action="delete"]').setAttribute('aria-label',items.length>1?'Удалить выбранные предметы':'Удалить источник');
    q('[data-control="pitch"]').disabled=!items.length;q('[data-control="volume"]').disabled=!items.length;
    if(items.length){syncPitchEditor();controlState(q('[data-control="volume"]'),items.map(item=>Math.round(item.y*100)),q('[data-value="volume"]'),value=>value+'%');}
    const muted=items.length&&items.every(item=>item.muted);q('[data-action="mute"]').textContent=muted?'Вернуть звук':'Приглушить';q('[data-action="mute"]').setAttribute('aria-pressed',String(!!muted));
    syncPerformanceSources();syncEnvelope();syncPattern();syncTimeline();for(let i=0;i<2;i++)controlState(q('[data-control="wave'+(i+1)+'"]'),fieldTargets.map(target=>target.snapshot.waveforms?.autumn?.[i]||worlds.autumn.waves[i]));syncParameters();syncLayout();syncFields();syncPerformance();resize();
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
  function drawToolIcon(target,type,instrument='default'){
    const icon=target.getContext('2d');icon.clearRect(0,0,target.width,target.height);
    icon.save();icon.translate(target.width/2,target.height/2);const size=target.width*.22;
    icon.fillStyle=typeColor(type);icon.strokeStyle=typeColor(type);icon.lineWidth=target.width*.035;icon.lineCap='round';
    const preset=instruments.get(instrument);
    if(preset?.category==='waves') {
      const wave=preset.settings.wave;icon.beginPath();
      for(let i=0;i<=48;i++){const t=i/48*2,x=(i/48*2-1)*size*1.3;
        const value=wave==='sine'?Math.sin(t*Math.PI*2):wave==='triangle'?2/Math.PI*Math.asin(Math.sin(t*Math.PI*2)):wave==='square'?(Math.sin(t*Math.PI*2)>=0?1:-1):wave==='sawtooth'?2*(t%1)-1:Math.sin(i*2.7)*Math.cos(i*.87);
        if(i)icon.lineTo(x,-value*size*.65);else icon.moveTo(x,-value*size*.65);
      }icon.stroke();icon.restore();return;
    }
    if(preset){
      if(preset.category==='drums'){
        if(/hat|ride/.test(preset.id)){for(let i=-1;i<=1;i++){icon.beginPath();icon.moveTo(-size*1.2,i*size*.42);icon.lineTo(size*1.2,i*size*.42);icon.stroke();}icon.beginPath();icon.moveTo(0,-size);icon.lineTo(0,size);icon.stroke();}
        else if(/kick|tom/.test(preset.id)){icon.beginPath();icon.arc(0,0,size,0,Math.PI*2);icon.stroke();icon.beginPath();icon.arc(0,0,size*.55,0,Math.PI*2);icon.stroke();}
        else {for(let i=0;i<5;i++){icon.beginPath();const x=(i-2)*size*.5;icon.moveTo(x,-size*(i%2?.55:1));icon.lineTo(x,size*(i%2?.55:1));icon.stroke();}}
      }else {
        icon.beginPath();for(let i=0;i<=40;i++){const x=(i/40*2-1)*size*1.3,y=Math.sin(i/40*Math.PI*(preset.category==='bass'?2:4))*size*.7;if(i)icon.lineTo(x,y);else icon.moveTo(x,y);}icon.stroke();
      }
      icon.restore();return;
    }
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
    const notes=allowedNotes(),width=geom.right-geom.left,step=width/PITCH_SPAN,free=scale().mode==='free',voices=showAudio?soundingAll():[];
    ctx.save();ctx.beginPath();ctx.rect(geom.left,geom.top,width,geom.bottom-geom.top);ctx.clip();
    for(const note of notes){const x=geom.left+(note-PITCH_MIN)/PITCH_SPAN*width;ctx.fillStyle=theme.color;ctx.globalAlpha=free?.006:.012;ctx.fillRect(x-step*.3,geom.top,step*.6,geom.bottom-geom.top);ctx.strokeStyle=theme.color;ctx.globalAlpha=free?.03:.08;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,geom.top);ctx.lineTo(x,geom.bottom);ctx.stroke();}
    if(showAudio)for(const voice of voices){const x=geom.left+(voice.note-PITCH_MIN)/PITCH_SPAN*width;ctx.fillStyle=theme.color;ctx.globalAlpha=voice.channel===2?.07:.15;ctx.fillRect(x-Math.max(2,step*.25),geom.top,Math.max(4,step*.5),geom.bottom-geom.top);}
    ctx.restore();ctx.fillStyle=theme.color;ctx.strokeStyle=theme.color;ctx.font='11px -apple-system,BlinkMacSystemFont,sans-serif';ctx.textAlign='center';
    for(const note of notes){const x=geom.left+(note-PITCH_MIN)/PITCH_SPAN*width;ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(x,geom.bottom);ctx.lineTo(x,geom.bottom+5);ctx.stroke();}ctx.globalAlpha=1;
    const selectedNote=selected()?noteFor(selected().x):null,active=voices.filter(v=>v.channel<2&&!v.noise).map(v=>v.note),candidates=[...notes];
    for(const note of active)if(!candidates.some(n=>Math.abs(n-note)<.001))candidates.push(note);
    candidates.sort((a,b)=>{const priority=n=>Math.abs(n-selectedNote)<.001?0:active.some(v=>Math.abs(v-n)<.001)?1:n%12===0?2:3;return priority(a)-priority(b)||a-b;});
    const labels=[];for(const note of candidates){const text=noteName(note),tw=ctx.measureText(text).width,x=clamp(geom.left+(note-PITCH_MIN)/PITCH_SPAN*width,geom.left+tw/2,geom.right-tw/2),left=x-tw/2,right=x+tw/2;if(labels.some(label=>left<label.right+7&&right>label.left-7))continue;labels.push({left,right});ctx.globalAlpha=active.some(v=>Math.abs(v-note)<.001)?1:.65;ctx.fillText(text,x,geom.bottom+19);}ctx.globalAlpha=1;
  }
  function paintAudio(theme){
    if(!showAudio)return;const width=geom.right-geom.left,height=geom.bottom-geom.top;
    ctx.save();ctx.beginPath();ctx.rect(geom.left,geom.top,width,height);ctx.clip();
    ctx.strokeStyle=theme.color;ctx.fillStyle=theme.color;ctx.lineWidth=2;ctx.lineJoin='round';
    const spectrumHeight=Math.min(150,height*.25);
    ctx.beginPath();ctx.moveTo(geom.left,geom.bottom);
    const spectrumPoints=Math.ceil(width);
    for(let pixel=0;pixel<=spectrumPoints;pixel++){
      const x=pixel/spectrumPoints*width,energy=sound.energyAt(PITCH_MIN+x/width*PITCH_SPAN);
      const level=Math.pow(clamp((energy-.08)/.92,0,1),.8);
      ctx.lineTo(geom.left+x,geom.bottom-level*spectrumHeight);
    }
    ctx.lineTo(geom.right,geom.bottom);ctx.globalAlpha=.9;ctx.stroke();
    ctx.lineTo(geom.left,geom.bottom);ctx.closePath();ctx.globalAlpha=.14;ctx.fill();
    const center=geom.top+height*.6,samples=sound.samples;
    const count=Math.min(samples?.length/2||1024,Math.round((sound.context?.sampleRate||44100)*.024));
    let start=samples?samples.length-count:0;
    if(samples)for(let i=samples.length-count*2;i<samples.length-count;i++)if(samples[i]<=0&&samples[i+1]>0){start=i;break;}
    const gain=Math.min(48,.92/Math.max(.001,sound.displayPeak)),amplitude=Math.min(140,height*.22);
    ctx.beginPath();
    for(let i=0;i<count;i++){
      const x=geom.left+i/(count-1)*width,y=center-(samples?.[start+i]||0)*gain*amplitude;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.globalAlpha=.9;ctx.lineWidth=2;ctx.stroke();
    ctx.lineTo(geom.right,center);ctx.lineTo(geom.left,center);ctx.closePath();ctx.globalAlpha=.055;ctx.fill();ctx.restore();
    const voices=soundingAll(),notes=[...new Set(voices.filter(v=>v.channel<2&&!v.noise).sort((a,b)=>a.note-b.note).map(v=>noteName(v.note)))],percussion=voices.some(v=>v.channel===2),text='Сейчас: '+([...notes,...(percussion?['перкуссия']:[])].join(', ')||'тишина');if(q('[data-live-notes]').textContent!==text)q('[data-live-notes]').textContent=text;
  }

  function phraseClock(){
    if(playingStep===null||playingStepAt===null)return {step:null,fraction:0};
    const duration=phraseEvents.length?phraseEvents[0].at-playingStepAt:1/beatRate();
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
      const p=position(source),selected=selectedSourceIds.has(source.id),held=!!typeFor(source.type).sustained;
      if(held&&running&&activatedHeld.has(source.id)&&heldOnStep(source,playingStep)&&!source.muted){ctx.fillStyle=theme.color;ctx.globalAlpha=.1;ctx.fillRect(p.x-7,p.y,14,geom.bottom-p.y);ctx.globalAlpha=.5;ctx.beginPath();ctx.ellipse(p.x,geom.bottom,18,4,0,0,Math.PI*2);ctx.fill();}
      ctx.save();ctx.fillStyle='#fff';ctx.globalAlpha=source.muted?.1:selected?.62:.32;ctx.beginPath();ctx.arc(p.x,p.y,21,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.globalAlpha=1;paintSourceRing(source,p,theme,selected);
      ctx.globalAlpha=source.muted?.35:.9;mark(source.type,p.x,p.y,10,typeColor(source.type));ctx.globalAlpha=1;
    }
    for(const p of particles){const progress=clamp((elapsed-p.start)/FALL_TIME,0,1),origin=position(p);let x=origin.x;const y=origin.y+(geom.bottom-origin.y)*progress;if(p.type==='leaf')x+=Math.sin(progress*Math.PI*3)*12*Math.sin(progress*Math.PI);if(p.type==='raven')x+=Math.sin(progress*Math.PI)*35;if(p.type==='comet')x-=Math.sin(progress*Math.PI)*22;ctx.globalAlpha=p.muted?.2:.95;mark(p.type,x,y,8,typeColor(p.type),p.type==='leaf'?progress*3:0);ctx.globalAlpha=1;}
    for(const r of ripples){const phase=(elapsed-r.start)/.4,p=position(r);ctx.globalAlpha=(1-phase)*.55;ctx.strokeStyle=theme.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,geom.bottom,6+phase*24,2+phase*8,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    if(ghost&&!drag){const p=position(ghost);ctx.globalAlpha=.4;mark(tool,p.x,p.y,10,typeColor(tool));ctx.strokeStyle=typeColor(tool);ctx.lineWidth=1;ctx.setLineDash([2,4]);ctx.beginPath();ctx.arc(p.x,p.y,25,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}
  }
  function generatePhraseBeats() {
    while(beat+1e-7>=nextPhraseBeat){
      const step=nextPhraseBeat%phraseLength,swingDelay=step%2?(typeof performancePatch==='undefined'?mix().swing||0:performancePatch.swing)/beatRate():0,start=elapsed-(beat-nextPhraseBeat)/beatRate()+swingDelay;
      phraseEvents.push({step,cycle:Math.floor(nextPhraseBeat/phraseLength),at:start+FALL_TIME,heldScheduled:false});
      for(const e of scene()){
        const held=!!typeFor(e.type).sustained,active=heldOnStep(e,step),previous=(step+phraseLength-1)%phraseLength;
        const enters=held?active&&(!heldOnStep(e,previous)||!activatedHeld.has(e.id))&&!particles.some(p=>p.id===e.id&&!p.done):active;
        if(enters)particles.push({...e,note:noteFor(e.x),start,step,group:nextPhraseBeat,done:false,scheduled:false});
      }nextPhraseBeat++;
    }
  }
  function transitionField(id,at) {
    captureField();sound.stop(Math.max(sound.context.currentTime,audioAnchor+at));
    activeFieldId=id;queuedFieldId=null;restoreField(activeField().snapshot);
    beat=(elapsed-(at-FALL_TIME))*beatRate();nextPhraseBeat=0;fieldCycle=0;playingStep=null;playingStepAt=null;
    phraseEvents=[];particles=[];ripples=[];activatedHeld.clear();ghost=null;drag=null;
    sound.configure(Math.max(sound.context.currentTime,audioAnchor+at),false);generatePhraseBeats();
    if(isEditorLayer())sync();if(layers.length)pendingPersistence=true;else persist();
  }
  function advanceLayer(now) {
    lastTime=now;
    if(!running)return;
    const clock=sound.context?.state==='running'?sound.context.currentTime-audioAnchor:now/1000-wallAnchor,dt=Math.max(0,clock-elapsed);
    elapsed=Math.max(elapsed,clock);beat+=dt*beatRate();generatePhraseBeats();
    const cue=typeof performancePatch!=='undefined'&&queuedFieldId!==null?phraseEvents.find(event=>event.at-elapsed<=.05):null;
    if(cue)transitionField(queuedFieldId,cue.at);
    const boundary=phraseEvents.find(event=>event.step===0&&event.cycle>0&&event.at-elapsed<=.05);
    if(boundary&&editorView==='composition'&&(usesCycleClock()?boundary.cycle>=activeField().repeats:(queuedFieldId!==null||boundary.cycle>=activeField().repeats))){
      const destination=nextFieldId();if(destination!==null)transitionField(destination,boundary.at);
    }
    const audioNow=sound.context?.currentTime||0;
    for(const event of phraseEvents)if(!event.heldScheduled&&event.at-elapsed<=.05){sound.scheduleHeldStep(event.step,Math.max(audioNow+.003,audioAnchor+event.at));event.heldScheduled=true;}
    for(const p of particles){
      const source=scene().find(e=>e.id===p.id),due=p.start+FALL_TIME;
      if(!p.done&&!p.scheduled&&source&&!source.muted&&heldOnStep(source,p.step)&&due-elapsed<=.05){p.audioAt=Math.max(audioNow+.003,audioAnchor+due);if(!typeFor(p.type).sustained)sound.hit({...p,sound:source.sound},p.audioAt);p.scheduled=true;}
      if(!p.done&&elapsed+1e-7>=due){p.done=true;if(source&&!source.muted&&heldOnStep(source,p.step)&&!sound.muted){stats.hits.push({layerId:currentLayerId,fieldId:activeFieldId,id:p.id,type:p.type,note:p.note,volume:p.y,at:due,audioAt:p.audioAt,step:p.step,group:p.group,sustained:!!typeFor(p.type).sustained,channel:typeFor(p.type).voice});if(stats.hits.length>192)stats.hits.shift();ripples.push({x:p.x,y:0,start:elapsed});}}
    }
    while(phraseEvents.length&&elapsed+1e-7>=phraseEvents[0].at){const event=phraseEvents.shift();playingStep=event.step;playingStepAt=event.at;fieldCycle=event.cycle;for(const e of scene())if(typeFor(e.type).sustained&&heldOnStep(e,event.step))activatedHeld.add(e.id);sound.syncHeld();if(isEditorLayer())syncPlayhead();}
    particles=particles.filter(p=>elapsed-p.start<FALL_TIME+.03);ripples=ripples.filter(r=>elapsed-r.start<.4);
  }
  function frame(now) {
    if(running){
      if(layers.length&&editorView==='composition'){storeCurrentLayer();for(const layer of layers)withLayer(layer,()=>advanceLayer(now));applyContext(currentLayer().context);syncFields();}
      else advanceLayer(now);
      if(pendingPersistence){pendingPersistence=false;persist();}
    }
    if(running||(sound.context&&sound.active.size)||(showAudio&&sound.context)){
      stats.peak=Math.max(stats.peak,sound.readPeak());const meter=q('.output-indicator');
      meter.dataset.level=sound.peak.toFixed(4);meter.setAttribute('aria-label','Уровень выхода '+Math.round(sound.peak*100)+'%');
      [...meter.children].forEach((bar,i)=>bar.style.height=(3+Math.min(1,sound.peak*8)*(i===2?9:i%2?6:3))+'px');paint();
    }
    if(typeof window.OutputScope!=='undefined')window.OutputScope.draw(q('[data-output-scope]'),{samples:sound.samples,spectrum:sound.spectrum,sampleRate:sound.context?.sampleRate,displayPeak:sound.displayPeak});
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown',event=>beginMarquee(event,'sources'));
  q('[data-composition]').addEventListener('pointerdown',event=>beginMarquee(event,'phrases'));
  window.addEventListener('pointermove',updateMarquee);
  window.addEventListener('pointerup',event=>{if(event.pointerId===marquee?.pointer)endMarquee();});
  window.addEventListener('pointercancel',event=>{if(event.pointerId===marquee?.pointer)endMarquee(true);});
  canvas.addEventListener('pointermove',event=>{if(marquee?.moved)return;ghost=inField(event)?coordinates(event):null;if(ghost)ghost.x=snapX(ghost.x);if(!running)paint();});canvas.addEventListener('pointerleave',()=>{ghost=null;if(!running)paint();});
  canvas.addEventListener('click',event=>{if(event.shiftKey||performance.now()<ignoreSurfaceClickUntil||!inField(event))return;const p=coordinates(event);addSource(tool,p.x,p.y);});
  canvas.tabIndex=0;
  canvas.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const p=ghost||{x:.5,y:.5};addSource(tool,p.x,p.y);}});
  window.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;const p=coordinates(event);
    let dx=p.x-drag.start.x,dy=p.y-drag.start.y;
    if(!drag.recorded){if(Math.abs(dx)<.005&&Math.abs(dy)<.01)return;remember();drag.recorded=true;}
    dx=clamp(dx,Math.max(...drag.origins.map(origin=>-origin.x)),Math.min(...drag.origins.map(origin=>1-origin.x)));
    dy=clamp(dy,Math.max(...drag.origins.map(origin=>.08-origin.y)),Math.min(...drag.origins.map(origin=>.92-origin.y)));
    for(const origin of drag.origins){const source=scene().find(item=>item.id===origin.id);if(source){source.x=snapX(origin.x+dx);source.y=origin.y+dy;}}
    sound.syncHeld();syncSources();syncPitchEditor();controlState(q('[data-control="volume"]'),editingSources().map(entry=>Math.round(entry.source.y*100)),q('[data-value="volume"]'),value=>value+'%');paint();
  });
  window.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointer){drag=null;commit();}});window.addEventListener('pointercancel',()=>{if(drag){drag=null;commit();}});
  q('[data-control="source"]').addEventListener('change',event=>{if(editorView==='composition'){compositionSourceFilter=event.target.value;sync();}else{selectSource(Number(event.target.value));persist();}});
  for(const key of ['pitch','volume']){const input=q('[data-control="'+key+'"]');input.addEventListener('pointerdown',remember);input.addEventListener('keydown',event=>{if(event.key.startsWith('Arrow'))remember();});input.addEventListener('input',()=>setPositionParameter(key,Number(input.value)));}
  q('[data-action="mute"]').addEventListener('click',muteSources);q('[data-action="duplicate"]').addEventListener('click',duplicateSources);q('[data-action="delete"]').addEventListener('click',removeSource);
  q('[data-action="clear"]').addEventListener('click',()=>{remember();scenes[worldKey]=[];particles=[];ripples=[];activatedHeld.clear();sound.stop();selectedId=null;commit();status('Сцена очищена. Отменить вернёт источники');});
  q('[data-action="undo"]').addEventListener('click',()=>{const previous=history.pop();if(!previous)return;if(running)pause();restore(previous);resetAllTransport();q('[data-action="undo"]').disabled=!history.length;commit();const message='Последнее изменение отменено · фраза с начала';if(inspectorTab==='layouts')layoutStatus(message);else status(message);});
  q('[data-action="restart"]').addEventListener('click',()=>{resetAllTransport();sync();status('Фраза с первой доли');});
  q('[data-control="tonic"]').addEventListener('change',event=>setScale('tonic',Number(event.target.value)));q('[data-control="mode"]').addEventListener('change',event=>setScale('mode',event.target.value));
  q('[data-control="tempo"]').addEventListener('change',event=>setCompositionTempo(event.target.value));
  q('[data-control="phrase-length"]').addEventListener('change',event=>{const length=clamp(Math.round(Number(event.target.value)||8),1,32);editFields(snapshot=>snapshot.phraseLength=length);});
  q('[data-action="example"]').addEventListener('click',()=>{
    remember();phraseLength=8;scaleSettings[worldKey]={tonic:0,mode:'major'};tool=world().types[0].id;
    const notes=[60,64,67,62,67,71],heights=[.8,.65,.5,.72,.32,.58];
    scenes[worldKey]=notes.map((note,index)=>({id:nextId++,type:tool,x:(note-PITCH_MIN)/PITCH_SPAN,y:heights[index],steps:index<3?[0,2,4,6]:[1,3,5,7],muted:false,sound:cleanSourceSettings({},tool)}));
    scene().push({id:nextId++,type:world().types[3].id,x:0,y:.24,steps:allPhraseSteps(),muted:false,sound:cleanSourceSettings({},world().types[3].id)},{id:nextId++,type:world().types[2].id,x:5/PITCH_SPAN,y:.16,steps:[0,2,4,6],muted:false,sound:cleanSourceSettings({},world().types[2].id)});selectedId=scene()[0].id;selectedSourceIds=new Set([selectedId]);
    resetTransport();commit();status('C–G: две группы по три ноты, длинная нота и перкуссия. Отменить вернёт твою фразу');
  });
  for(let i=0;i<2;i++)q('[data-control="wave'+(i+1)+'"]').addEventListener('change',event=>editFields(snapshot=>snapshot.waveforms.autumn[i]=event.target.value));
  for (const button of all('[data-inspector-tab]')) {
    button.addEventListener('click', () => openInspector(button.dataset.inspectorTab));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();const tabs=['source','sound','layouts'],index=tabs.indexOf(inspectorTab);
      const tab=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
      openInspector(tab);q('[data-inspector-tab="'+tab+'"]').focus();
    });
  }
  q('[data-action="export-layout"]').addEventListener('click',exportLayout);
  q('[data-action="import-layout"]').addEventListener('click',()=>q('[data-control="layout-file"]').click());
  q('[data-control="layout-file"]').addEventListener('change',event=>importLayout(event.target.files[0]));
  for(const button of all('[data-editor-view]'))button.addEventListener('click',()=>{
    if(button.dataset.editorView==='full-field'){
      liveEditorOpen=false;setEditorView('field');syncPerformance();
    }else if(typeof performancePatch!=='undefined'){
      setEditorView('composition');
      liveEditorOpen=button.dataset.editorView==='field';syncPerformance();resizeRing();
    }else setEditorView(button.dataset.editorView);
  });
  q('[data-action="edit-field"]').addEventListener('click',editSelectedField);
  q('[data-action="cue-field"]').addEventListener('click',()=>chooseField(selectedFieldId));
  q('[data-action="add-layer"]').addEventListener('click',()=>{const picker=q('[data-layer-picker]');picker.hidden=!picker.hidden;});
  for(const button of all('[data-part-kind]'))button.addEventListener('click',()=>addLayer(button.dataset.partKind));
  q('[data-control="cycle-beats"]').addEventListener('change',event=>{remember();cycleBeats=clamp(Math.round(Number(event.target.value)||32),1,128);resetAllTransport();commit();});

  q('[data-action="duplicate-field"]').addEventListener('click',()=>addField(true,selectedFieldId));
  q('[data-action="delete-field"]').addEventListener('click',deletePhraseSelection);
  for(const button of all('[data-field-move]'))button.addEventListener('click',()=>moveField(selectedFieldId,Number(button.dataset.fieldMove)));
  q('[data-action="field-repeats"]').addEventListener('click',()=>{const popover=q('[data-repeats-popover]');popover.hidden=!popover.hidden;syncFields();if(!popover.hidden)q('[data-control="field-repeats"]').focus();});
  q('[data-control="field-repeats"]').addEventListener('change',event=>{remember();const value=clamp(Math.round(Number(event.target.value)||1),1,32);for(const target of editingFields())target.field.repeats=value;syncFields();persist();});
  window.addEventListener('pointermove',updateFieldDrag);
  window.addEventListener('pointerup',event=>{if(event.pointerId===fieldDrag?.pointer)endFieldDrag();});
  window.addEventListener('pointercancel',event=>{if(event.pointerId===fieldDrag?.pointer)endFieldDrag(true);});
  root.addEventListener('pointerdown',event=>{if(!event.target.closest('[data-layer-picker],[data-action="add-layer"]'))q('[data-layer-picker]').hidden=true;if(!event.target.closest('[data-field-actions]')){q('[data-repeats-popover]').hidden=true;q('[data-action="field-repeats"]').setAttribute('aria-expanded','false');}});
  q('[data-control="sequence"]').addEventListener('change',event=>{remember();sequenceEnabled=event.target.checked;syncFields();persist();});
  {
    const select=q('[data-control="instrument"]'),fallback=document.createElement('option');
    fallback.value='default';fallback.textContent='По предмету';select.append(fallback);
    for(const [category,label] of Object.entries(instruments.categories)) {
      const group=document.createElement('optgroup');group.label=label;
      for(const preset of instruments.forCategory(category)){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.name;group.append(option);}
      select.append(group);
    }
    select.addEventListener('change',event=>changeInstrument(event.target.value));
  }
  for(const preset of instruments.soundPresets) {
    const button=document.createElement('button');button.type='button';button.dataset.soundPreset=preset.id;button.textContent=preset.name;
    button.addEventListener('click',()=>editSources(source=>{Object.assign(source.sound,preset.settings);const previous=instruments.get(source.sound.instrument);if(previous&&previous.category!=='waves'){source.sound.instrument='wave-'+preset.settings.wave;source.sound.channel=String(previous.channel);}}));
    q('[data-sound-presets]').append(button);
  }
  q('[data-control="voice-mode"]').addEventListener('change',event=>{
    const held=event.target.value==='held';
    editSources((source,entry)=>{
      if(entry.live){const stop=()=>sound.stopSource(source.id);if(entry.layer)withLayer(entry.layer,stop);else stop();}
      const previous=instruments.get(source.sound.instrument);if(previous&&previous.category!=='waves'){const wave=source.sound.wave==='auto'?previous.settings.wave:source.sound.wave;source.sound.instrument='wave-'+wave;}
      source.type=held?(entry.snapshot.worldKey==='space'?'aurora':'fog'):(entry.snapshot.worldKey==='space'?'comet':'drop');if(held){source.sound.channel='1';source.steps=allPhraseSteps();}
    });
  });
  for(const button of all('[data-instrument-category]'))button.addEventListener('click',()=>{choosePalette(button.dataset.instrumentCategory);sync();persist();});
  q('[data-action="audition-tool"]').addEventListener('click',async()=>{
    const button=q('[data-action="audition-tool"]'),layer=currentLayer(),preset=instruments.get(toolInstrument);
    const sample={id:-1,type:tool,x:.25,y:.55,note:noteFor(.25),sound:cleanSourceSettings({...preset?.settings,instrument:toolInstrument},tool)};
    button.disabled=true;
    try{await initializeLayers();const play=()=>sound.hit(sample,sound.context.currentTime+.01,true);if(layer)withLayer(layer,play);else play();status('Прослушивание: '+(preset?.name || typeFor(tool).name));}
    catch(error){status(error.message);}finally{button.disabled=false;}
  });
  for (const input of all('[data-source-param], [data-sound-param]')) {
    const sourceInput = !!input.dataset.sourceParam, key = input.dataset.sourceParam || input.dataset.soundParam;
    input.addEventListener('pointerdown',remember);
    input.addEventListener('keydown',event=>{if(event.key.startsWith('Arrow'))remember();});
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
      if(input.tagName==='SELECT')remember();
      const value = input.tagName === 'SELECT' ? key === 'octave' ? Number(input.value) : input.value : Number(input.value);
      if(sourceInput)setSourceParameter(key,value);else editFields(snapshot=>setPath(snapshot.soundSettings.autumn,key,value),false);
    });
  }
  q('[data-action="audition"]').addEventListener('click', async () => {
    const button=q('[data-action="audition"]');button.disabled=true;
    try{await initializeLayers();const entries=editingSources(),at=sound.context.currentTime+.01;for(const {source} of entries){if(running&&typeFor(source.type).sustained&&sound.held.has(source.id))sound.syncHeld();else sound.hit({...source,note:noteFor(source.x)},at,true);}status('Прослушивание выделенных предметов');}catch(error){status(error.message);}finally{button.disabled=!editingSources().length||editorView==='composition';}
  });
  q('[data-action="place-center"]').addEventListener('click',()=>addSource(tool,.5,.5));
  q('[data-action="fullscreen"]').addEventListener('click',async()=>{
    try { if(document.fullscreenElement)await document.exitFullscreen();else if(root.requestFullscreen)await root.requestFullscreen();else status('Окно инструмента уже занимает весь экран страницы'); } catch {status('Полноэкранный режим недоступен в этом браузере');}
  });
  window.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(marquee){endMarquee(true);event.preventDefault();return;}endFieldDrag(true);q('[data-repeats-popover]').hidden=true;q('[data-layer-picker]').hidden=true;q('[data-action="field-repeats"]').setAttribute('aria-expanded','false');}
    if(event.isComposing)return;
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'&&!event.target.closest('input,select,textarea,[contenteditable]')){event.preventDefault();q('[data-action="undo"]').click();return;}
    if(event.target.closest('input,select,textarea,button,[contenteditable]'))return;
    if(['Delete','Backspace'].includes(event.key)&&event.target.closest('[data-canvas],[data-composition]')){event.preventDefault();if(editorView==='field')deleteSources();else deletePhraseSelection();return;}
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='a'&&event.target.closest('[data-canvas],[data-composition]')){event.preventDefault();if(editorView==='field'){selectSources(scene().map(source=>source.id));sync();}else{selectedPhraseKeys=new Set(layers.flatMap(layer=>layer.fields.map(field=>phraseKey(layer.id,field.id))));focusPhraseSelection();}return;}
    if(event.code==='Space'){event.preventDefault();q('[data-action="play"]').click();}
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();q('[data-action="undo"]').click();}
    if(event.key==='Escape'){ghost=null;selectedPhraseKeys.clear();phraseSelectionCleared=false;selectSources(selectedId===null?[]:[selectedId]);sync();if(queuedFieldId!==null){queuedFieldId=null;syncFields();status('Ручной переход отменён');}paint();}
  });
  function pause(){running=false;const stop=()=>{sound.stop();for(const event of phraseEvents)event.heldScheduled=false;particles.filter(p=>!p.done).forEach(p=>p.scheduled=false);};if(layers.length){storeCurrentLayer();for(const layer of layers)withLayer(layer,stop);applyContext(currentLayer().context);}else stop();sync();}
  q('[data-action="play"]').addEventListener('click',async()=>{const button=q('[data-action="play"]');button.disabled=true;try{if(running){pause();status('Пауза: позиция во фразе сохранена');}else{try{await initializeLayers();}catch(error){status(error.message);return;}if(!fields.length)return;status('Фраза по кругу · предметы одной доли касаются земли вместе');anchorClock();running=true;if(layers.length&&editorView==='composition'){storeCurrentLayer();for(const layer of layers)withLayer(layer,()=>sound.syncHeld());}else sound.syncHeld();sync();}}finally{button.disabled=!fields.length;}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){pause();status('Пауза');}});
  window.addEventListener('openai:set_globals',event=>{const saved=event.detail?.globals?.widgetState?.privateContent;if(!saved||JSON.stringify(saved)===lastPersisted)return;running=false;restore(saved);lastPersisted=null;resetTransport();sync();});
  root.__landscapeLab={state:()=>({...serial(),scope:editorView,layerClocks:layers.map(layer=>({id:layer.id,activeFieldId:layer.context.activeFieldId,queuedFieldId:layer.context.queuedFieldId,playingStep:layer.context.playingStep,beat:layer.context.beat,elapsed:layer.context.elapsed})),selectedFieldId,selectedSourceIds:[...selectedSourceIds],selectedPhraseKeys:[...selectedPhraseKeys],draggedFieldId:fieldDrag?.id||null,queuedFieldId,fieldCycle,running,elapsed,beat,playingStep,nextPhraseBeat,phraseClock:phraseClock(),rings:scene().map(source=>({id:source.id,segments:ringSegments(source)})),pitch:{min:PITCH_MIN,max:PITCH_MAX,allowed:allowedNotes(),free:scale().mode==='free'},particles:particles.map(p=>({id:p.id,x:p.x,y:p.y,note:p.note,start:p.start,step:p.step,group:p.group})),hits:[...stats.hits],activeNotes:soundingAll().map(v=>({...v,name:v.channel===2?'перкуссия':noteName(v.note)})),audioState:sound.context?.state||'off',audioPeak:stats.peak,visualization:{enabled:showAudio,wavePeak:sound.peak,spectrumPeak:sound.spectrum?Math.max(...sound.spectrum):0}}),geometry:()=>({...geom,w,h}),audioSettings:()=>clone(mix())};
  performanceUI=window.PerformanceControls.mount(root,{
    get:()=>performancePatch,remember,
    selectVoice(value){performancePatch.selectedVoice=value;persist();},
    change(key,value,voice){
      if(voice)performancePatch.voices[performancePatch.selectedVoice][key]=value;else performancePatch[key]=value;
      if(layers.length){storeCurrentLayer();for(const layer of layers)withLayer(layer,()=>sound.configure(undefined,false));}else sound.configure();
      syncPerformance();persist();
    }
  });
  liveUI=window.LivePhraseEditor.mount(root,{
    get:liveEditorModel,update:updateLivePhrase,create:createLiveSource,snap:snapForSnapshot,channel:sourceChannel,
    name(source){const channel=sourceChannel(source);return (channel===2?sourceName(source):typeFor(source.type).sustained?'Фон · Синт 2':'Синт '+(channel+1))+' · '+(channel===2?'удар':noteName(48+source.x*24+source.sound.octave*12));},
    notes(snapshot){const scale=snapshot.scaleSettings.autumn,steps=modes[scale.mode].steps;return steps?Array.from({length:25},(_,i)=>48+i).filter(note=>steps.includes(((note-scale.tonic)%12+12)%12)):[];},
    selectSource(id){const source=liveEditorModel()?.snapshot.scenes.autumn.find(source=>source.id===id);if(source&&sourceChannel(source)<2){performancePatch.selectedVoice=sourceChannel(source);performanceUI.render();}},
    close(){liveEditorOpen=false;syncPerformance();resizeRing();},
    cue(){chooseField(selectedFieldId);if(!running)q('[data-action="play"]').click();}
  });
  q('[data-action="performance-play"]').addEventListener('click',()=>q('[data-action="play"]').click());
  const previousButton=q('[data-action="restore-previous"]');previousButton.hidden=!localStorage.getItem(STORAGE_KEY+'-before-performance');
  previousButton.addEventListener('click',()=>{const previous=JSON.parse(localStorage.getItem(STORAGE_KEY+'-before-performance')||'null');if(!previous)return;remember();pause();restore(previous);resetAllTransport();commit();});
  reducedMotion.addEventListener('change',paint);openInspector('source');sync();setEditorView(new URLSearchParams(window.location.search).get('view')==='field'?'field':'composition');new ResizeObserver(()=>{resize();resizeRing();}).observe(stage);resize();requestAnimationFrame(frame);
})();

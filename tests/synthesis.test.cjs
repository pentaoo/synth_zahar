'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/audio-fixture.cjs');
const instruments=require('../sketches/landscape/instruments.js');
const files=require('../sketches/landscape/layout-files.js');

test('the visible synth library has four periodic waves and white noise, plus three drums',()=>{
 assert.deepEqual(instruments.forCategory('waves').map(p=>p.settings.wave),['sine','triangle','sawtooth','square','noise']);
 assert.equal(instruments.forCategory('drums').length,3);
 assert.ok(instruments.get('melody-pad'),'old personal layouts retain their recipes');
});
test('a held voice morphs into noise and follows brightness and oscillator spread without a new attack',async()=>{
 const f=await fixture([0,1]),source=f.item(),engine=f.engine;
 Object.assign(source.sound,{instrument:'wave-sine',wave:'sine',noise:.2,detune:12});
 f.setStep(0,.1);const held=engine.held.get(source.id),voice=engine.voices.get(held.oscillator),original=held.oscillator;
 assert.equal(voice.partials.length,3);assert.equal(voice.noiseGain.gain.value,.2);
 const tones=voice.partials.filter(part=>!part.noise);
 assert.equal(voice.noiseGain.gain.events[0][0],'set','the noise mix is initialized before onset');
 assert.equal(tones[0].node.frequency.events[0][0],'set','a new note starts at its target frequency');
 assert.equal(tones[0].node.detune.value,-19);assert.equal(tones[1].node.detune.value,19);
 Object.assign(source.sound,{wave:'noise',noise:0,brightness:1800,detune:3});engine.configure();
 assert.equal(engine.held.get(source.id).oscillator,original);
 assert.equal(voice.toneGain.gain.value,0);assert.equal(voice.noiseGain.gain.value,1);assert.equal(voice.filter.frequency.value,1800);
 Object.assign(source.sound,{wave:'square',noise:.35});engine.configure();
 assert.equal(tones[0].node.type,'square');assert.equal(voice.noiseGain.gain.value,.35);
 engine.scheduleHeldStep(2,.8);f.setStep(2,.8);engine.context.advance(.83);
 assert.equal(engine.active.size,0,'both oscillators and the looped noise stop on a rest');
});
test('an already sounding short voice follows timbre edits and releases every generator',async()=>{
 const f=await fixture([]),source=f.item(),engine=f.engine;source.type='drop';
 Object.assign(source.sound,{instrument:'wave-triangle',wave:'triangle'});
 engine.hit({...source,note:60},.01);engine.context.advance(.1);
 const voice=[...engine.voices.values()].find(voice=>voice.primary);const starts=voice.partials.map(part=>part.node.startAt);
 Object.assign(source.sound,{wave:'sawtooth',noise:.4,brightness:2400,detune:8});engine.configure();
 assert.ok(voice.partials.filter(part=>!part.noise).every(part=>part.node.type==='sawtooth'));
 assert.equal(voice.filter.frequency.value,2400);assert.equal(voice.noiseGain.gain.value,.4);
 assert.deepEqual(voice.partials.map(part=>part.node.startAt),starts);
 engine.context.advance(10);assert.equal(engine.active.size,0);
});
test('white noise, primitive held sources and swing survive a file round trip; invalid values reject',async()=>{
 const f=await fixture([0,7]);Object.assign(f.item().sound,{instrument:'wave-noise',wave:'noise',noise:.37});
 const snapshot=f.serial();snapshot.soundSettings.autumn.swing=.31;
 const decoded=files.decode(files.encode(snapshot,'Синтез')).snapshot;
 assert.equal(decoded.soundSettings.autumn.swing,.31);assert.equal(decoded.scenes.autumn[0].sound.noise,.37);
 assert.equal(decoded.scenes.autumn[0].sound.wave,'noise');
 for(const mutate of [s=>s.soundSettings.autumn.swing=.51,s=>s.scenes.autumn[0].sound.noise=-.1]){
  const invalid=structuredClone(snapshot);mutate(invalid);assert.throws(()=>files.validateSnapshot(invalid));
 }
});

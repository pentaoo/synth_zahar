'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const score=require('../sketches/landscape/performance-score.js'),files=require('../sketches/landscape/layout-files.js');
const {fixture}=require('./helpers/audio-fixture.cjs');
test('the authored track has eight valid, distinct phrases with bass, melody, chords and drums',async()=>{
 const f=await fixture([]),base=f.serial(),before=JSON.stringify(base),fields=score.fields(base);
 assert.equal(fields.length,8);assert.equal(JSON.stringify(base),before);
 for(const field of fields){
  files.validateSnapshot(field.snapshot);const sources=field.snapshot.scenes.autumn;
  assert.ok(sources.length<=16);assert.equal(field.snapshot.phraseLength,8);
  assert.deepEqual(field.snapshot.scaleSettings.autumn,{tonic:2,mode:'minor'});
  assert.ok(sources.some(s=>s.sound.channel==='0'&&s.sound.octave===-1));
  assert.equal(sources.filter(s=>s.type==='fog').length,3);
  assert.equal(sources.filter(s=>s.type==='raven').length,3);
  assert.ok(sources.every(s=>[0,2,3,5,7,8,10].includes(((48+s.x*24-2)%12+12)%12)));
 }
 assert.equal(new Set(fields.map(f=>JSON.stringify(f.snapshot.scenes.autumn))).size,8);
 assert.equal(score.phrases[0].root,score.phrases.at(-1).root,'the ending resolves to the opening tonic');
 assert.ok(score.phrases[0].energy<score.phrases[6].energy&&score.phrases[7].energy<score.phrases[6].energy);
});
test('all modulation generators release on a rest, and live FM, sub, movement and saturation reach the graph',async()=>{
 const f=await fixture([0]);f.setStep(0,.1);const held=f.engine.held.get(1),voice=f.engine.voices.get(held.oscillator);
 Object.assign(f.item().sound,{fm:1.4,harmonicity:2.76,sub:.6,vibrato:18,motion:.5,lfoRate:4,pulse:.4,drive:.35});f.engine.configure();
 assert.equal(voice.fmGain.gain.value,voice.partials[0].node.frequency.value*1.4);
 assert.equal(voice.sub.frequency.value,voice.partials[0].node.frequency.value/2);
 assert.equal(voice.vibratoGain.gain.value,18);assert.equal(voice.lfo.frequency.value,4);
 assert.equal(voice.pulseGain.gain.value,.2);assert.ok(voice.drive.curve.length>0);
 assert.equal(f.engine.active.size,6);f.engine.scheduleHeldStep(1,.8);f.setStep(1,.8);f.engine.context.advance(.83);assert.equal(f.engine.active.size,0);
});
test('the shared performance patch controls both sounding phrases without replacing their notes',async()=>{
 const f=await fixture([0]);f.evaluate(`performancePatch=${JSON.stringify(score.patchDefaults)};`);const item=f.item(),x=item.x;f.setStep(0,.1);
 const voice=f.engine.voices.get(f.engine.held.get(1).oscillator),node=f.engine.held.get(1).oscillator;
 f.evaluate("performancePatch.voices[1].fm=2;performancePatch.voices[1].wave='sawtooth';performancePatch.voices[1].brightness=2500;");f.engine.configure();
 assert.equal(f.engine.held.get(1).oscillator,node);assert.equal(voice.partials[0].node.type,'sawtooth');assert.equal(voice.filter.frequency.value,2500);assert.equal(item.x,x);
 const patch=f.evaluate('performancePatch');const saved={...f.serial(),performancePatch:patch,performanceVersion:1};assert.deepEqual(files.decode(files.encode(saved,'Пейзаж')).snapshot.performancePatch,JSON.parse(JSON.stringify(patch)));
 for(const mutate of [p=>p.voices[0].fm=6,p=>delete p.voices[1].brightness,p=>p.voices[0].wave='missing']){const bad=structuredClone(saved);mutate(bad.performancePatch);assert.throws(()=>files.validateSnapshot(bad));}
});

test('party seeds follow all eight harmonies and contain only their own channel',async()=>{
 const f=await fixture([]),base=f.serial();
 for(const [kind,channel] of [['bass','0'],['melody','1'],['drums','2']]){
  const fields=score.partFields(base,kind);assert.equal(fields.length,8);
  for(const field of fields){files.validateSnapshot(field.snapshot);assert.ok(field.snapshot.scenes.autumn.length);assert.ok(field.snapshot.scenes.autumn.every(source=>source.sound.channel===channel));}
 }
});

test('quick timbres morph a sounding synth without replacing its note or its oscillator',async()=>{
 const f=await fixture([0]);f.evaluate(`performancePatch=${JSON.stringify(score.patchDefaults)};`);f.setStep(0,.1);
 const node=f.engine.held.get(1).oscillator,x=f.item().x;
 for(const preset of require('../sketches/landscape/performance-controls.js').timbres){
  f.evaluate(`Object.assign(performancePatch.voices[1],${JSON.stringify(preset.settings)});`);f.engine.configure();
  assert.equal(f.engine.held.get(1).oscillator,node);assert.equal(f.item().x,x);
  const voice=f.engine.voices.get(node);assert.equal(voice.partials[0].node.type,preset.settings.wave);assert.equal(voice.filter.frequency.value,preset.settings.brightness);
  files.validateSnapshot({...f.serial(),performancePatch:JSON.parse(JSON.stringify(f.evaluate('performancePatch')))});
 }
});

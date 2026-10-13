'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const instruments=require('../sketches/landscape/instruments.js');
const files=require('../sketches/landscape/layout-files.js');
const {fixture}=require('./helpers/audio-fixture.cjs');

test('every library instrument uses its intended channel and releases all audio nodes after audition',async()=>{
  for(const preset of instruments.catalog){
    const f=await fixture([]),source=f.item(),engine=f.engine;
    source.type=preset.type;Object.assign(source.sound,preset.settings,{instrument:preset.id});
    engine.hit({...source,note:48},.01,true);
    assert.ok(engine.active.size>0,preset.id+' must start sound');
    assert.ok([...engine.voices.values()].every(voice=>voice.channel===preset.channel),preset.id+' routes to the wrong channel');
    engine.context.advance(20);
    assert.equal(engine.active.size,0,preset.id+' leaves a running source');
    assert.equal(engine.voices.size,0,preset.id+' leaves a voice in the meter');
  }
});
test('kicks sweep downward, hats use highpass noise, and claps contain separated transients',async()=>{
  const f=await fixture([]),source=f.item(),engine=f.engine;
  function hit(id){engine.stop();const preset=instruments.get(id);source.type=preset.type;Object.assign(source.sound,preset.settings,{instrument:id});const before=engine.context.nodes.length;engine.hit({...source,note:48},.01,true);return engine.context.nodes.slice(before);}
  const kick=hit('kick-deep').find(node=>node.kind==='Oscillator');
  const sweep=kick.frequency.events;assert.ok(sweep[0][1]>sweep[1][1]);
  const hat=hit('hat-closed');assert.ok(hat.some(node=>node.kind==='BiquadFilter'&&node.type==='highpass'));
  const clap=hit('clap').filter(node=>node.kind==='BufferSource');
  assert.equal(clap.length,3);assert.ok(clap[0].startAt<clap[1].startAt&&clap[1].startAt<clap[2].startAt);
});
test('the sustained pad keeps all partials through the loop seam and stops every partial on a rest',async()=>{
  const f=await fixture([7,0]),preset=instruments.get('melody-pad');Object.assign(f.item().sound,preset.settings,{instrument:preset.id});
  f.engine.scheduleHeldStep(7,.8);f.setStep(7,.8);
  const nodes=[...f.engine.active];assert.equal(nodes.length,2);
  f.engine.scheduleHeldStep(0,1.55);f.setStep(0,1.55);
  assert.deepEqual([...f.engine.active],nodes);
  f.item().x=.75;f.engine.syncHeld();
  assert.ok(nodes.every(node=>node.frequency.events.at(-1)[0]==='target'));
  f.engine.scheduleHeldStep(1,2.3);f.setStep(1,2.3);f.engine.context.advance(2.33);
  assert.equal(f.engine.active.size,0);assert.equal(f.engine.held.size,0);
});
test('instrument, per-source waveform and edited settings survive export, import and restore',async()=>{
  for(const preset of instruments.catalog){
    const f=await fixture([]),source=f.item();source.type=preset.type;
    Object.assign(source.sound,preset.settings,{instrument:preset.id,pan:-.27,gain:.73,wave:preset.category==='drums'?'auto':'square'});
    const saved=files.decode(files.encode(f.serial(),'Набор')).snapshot;
    f.item().sound.instrument='default';f.restore(saved);
    assert.equal(f.item().sound.instrument,preset.id);assert.equal(f.item().sound.pan,-.27);assert.equal(f.item().sound.gain,.73);
    assert.equal(f.item().sound.wave,saved.scenes.autumn[0].sound.wave);
  }
});
test('unknown instruments, mismatched objects and unknown waveforms reject the whole layout without mutation',async()=>{
  const f=await fixture([]),snapshot=f.serial(),original=JSON.stringify(snapshot);
  for(const settings of [{instrument:'missing'},{instrument:'kick-deep'},{wave:'missing'}]){
    const invalid=structuredClone(snapshot);Object.assign(invalid.scenes.autumn[0].sound,settings);
    assert.throws(()=>files.decode(JSON.stringify(invalid)));
  }
  assert.equal(JSON.stringify(snapshot),original);
});

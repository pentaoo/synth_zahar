'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture}=require('./helpers/audio-fixture.cjs');

test('adjacent selected beats and the loop boundary share one oscillator and one attack', async()=>{
  const f=await fixture([0,1,7]);
  f.engine.scheduleHeldStep(7,.8);f.setStep(7,.8);
  const node=f.engine.held.get(1).oscillator;
  const envelopeEvents=f.engine.held.get(1).gate.gain.events.length;
  for(const [step,time] of [[0,1.55],[1,2.3]]){f.engine.scheduleHeldStep(step,time);f.setStep(step,time);assert.equal(f.engine.held.get(1).oscillator,node);}
  assert.equal(f.engine.held.get(1).gate.gain.events.length,envelopeEvents,'Continuation must not repeat the attack or reset ADSR');
});
test('unselected beats schedule silence at their audio boundary; a later run starts again',async()=>{
  const f=await fixture([0,1,4]);
  f.engine.scheduleHeldStep(0,.8);f.setStep(0,.8);
  const first=f.engine.held.get(1).oscillator;
  f.engine.context.advance(1.51);f.engine.scheduleHeldStep(2,1.55);
  assert.equal(f.engine.voices.get(first).end,1.55);
  f.setStep(2,1.55);assert.equal(f.engine.held.size,0);
  f.engine.context.advance(1.58);assert.equal(f.engine.active.size,0);
  f.engine.scheduleHeldStep(3,2.3);f.setStep(3,2.3);assert.equal(f.engine.held.size,0);
  f.engine.scheduleHeldStep(4,3.05);f.setStep(4,3.05);
  assert.notEqual(f.engine.held.get(1).oscillator,first);
});
test('editing a scheduled rest keeps the current note alive when the beat becomes selected',async()=>{
  const f=await fixture([0,1]);
  f.engine.scheduleHeldStep(1,.8);f.setStep(1,.8);
  const first=f.engine.held.get(1).oscillator;
  f.engine.context.advance(1.51);f.engine.scheduleHeldStep(2,1.55);
  f.item().steps.push(2);f.engine.cancelHeldSchedules();f.engine.syncHeld();
  assert.equal(f.engine.voices.get(first).end,Infinity);
  f.engine.scheduleHeldStep(2,1.55);f.setStep(2,1.55);
  assert.equal(f.engine.held.get(1).oscillator,first);
  assert.equal(first.stopAt,undefined,'Cancelling a future rest must cancel its oscillator stop too');
});
test('dragging a held source updates a pending onset and preserves a pending rest',async()=>{
  const f=await fixture([0,1]);
  f.engine.scheduleHeldStep(0,.8);
  f.item().x=.75;f.item().y=.4;f.engine.syncHeld();
  const held=f.engine.held.get(1);
  assert.equal(held.oscillator.frequency.events.at(-1)[2],.8,'Pending pitch edits use the onset time');
  f.setStep(0,.8);f.engine.context.advance(1.51);f.engine.scheduleHeldStep(2,1.55);
  f.item().y=.7;f.engine.syncHeld();
  assert.equal(held.releaseAt,1.55);
  assert.equal(f.engine.voices.get(held.oscillator).end,1.55);
  assert.equal(held.gate.gain.events.at(-1)[2],1.558,'Volume edits preserve the upcoming fade');
});
test('empty selection is silent, and removing the current beat stops its held note',async()=>{
  const f=await fixture([]);
  for(let step=0;step<8;step++){f.engine.scheduleHeldStep(step,.8+step*.75);f.setStep(step,.8+step*.75);}
  assert.equal(f.engine.active.size,0);
  f.item().steps=[0];f.engine.scheduleHeldStep(0,7);f.setStep(0,7);assert.equal(f.engine.held.size,1);
  f.item().steps=[];f.engine.cancelHeldSchedules();f.engine.syncHeld();assert.equal(f.engine.held.size,0);
});
test('mute, pause and source removal stop holds; resume during a rest stays silent',async()=>{
  const f=await fixture([0]);
  f.engine.scheduleHeldStep(0,.8);f.setStep(0,.8);
  f.item().muted=true;f.engine.syncHeld();assert.equal(f.engine.held.size,0);
  f.item().muted=false;f.engine.syncHeld();assert.equal(f.engine.held.size,1);
  f.setRunning(false);f.engine.stop();assert.equal(f.engine.held.size,0);
  f.setRunning(true);f.setStep(1,1.55);assert.equal(f.engine.held.size,0);
  f.setStep(0,2.3);f.item().type='drop';f.engine.syncHeld();assert.equal(f.engine.held.size,0);
});
test('old whole-phrase holds migrate; new selections, including silence, survive saving',async()=>{
  const f=await fixture([]);
  const old=JSON.parse(JSON.stringify(f.serial()));old.version=4;old.scenes.autumn[0].steps=[];
  f.restore(old);assert.equal(f.item().steps.length,32);assert.equal(f.stepsFor(f.item()).length,8);
  for(const steps of [[1,2,7],[]]){f.item().steps=steps;const saved=JSON.parse(JSON.stringify(f.serial()));assert.equal(saved.version,5);f.restore(saved);assert.deepEqual(Array.from(f.item().steps),steps);}
  f.item().steps=[1,15,31];f.setLength(2);assert.deepEqual(Array.from(f.stepsFor(f.item())),[1]);f.setLength(32);assert.deepEqual(Array.from(f.stepsFor(f.item())),[1,15,31]);
});

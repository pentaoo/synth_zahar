'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/audio-fixture.cjs');
const score=require('../sketches/landscape/performance-score.js'),instruments=require('../sketches/landscape/instruments.js'),files=require('../sketches/landscape/layout-files.js');
async function setup(){const f=await fixture([0]);f.evaluate(`performancePatch=${JSON.stringify(score.patchDefaults)};`);f.setStep(0,.1);return f;}
test('individual drum gains and effects update live without changing either synth',async()=>{
 const f=await setup(),engine=f.engine,held=engine.held.get(1).oscillator,synthGains=engine.channels.slice(0,2).map(node=>node.gain.value);
 f.evaluate('Object.assign(performancePatch.drums,{kick:0,snare:.4,hat:.2,gain:.55,brightness:2500,drive:.4,echo:.3,space:.15});');engine.configure();
 assert.equal(engine.drumLevels.kick.gain.value,0);assert.equal(engine.drumLevels.snare.gain.value,.4);assert.equal(engine.drumLevels.hat.gain.value,.2);
 assert.equal(engine.channels[2].gain.value,.55);assert.deepEqual(engine.channels.slice(0,2).map(node=>node.gain.value),synthGains);assert.equal(engine.held.get(1).oscillator,held);
 assert.equal(engine.buses.drum.filter.frequency.value,2500);assert.equal(engine.buses.drum.delayWet.gain.value,.3);assert.equal(engine.buses.drum.reverbWet.gain.value,.15);assert.equal(engine.buses.drum.driveValue,.4);
 assert.equal(engine.buses.synth.delayWet.gain.value,score.patchDefaults.echo);
});
test('drum strikes use the selected tone and tail and route to independent kick, snare and hat gains',async()=>{
 const f=await setup(),engine=f.engine;f.evaluate('Object.assign(performancePatch.drums,{tone:1.4,decay:.36,noise:.6});');engine.configure();
 for(const [id,family] of [['kick-deep','kick'],['snare-dry','snare'],['hat-closed','hat']]){
  const preset=instruments.get(id),before=engine.context.nodes.length,source={...f.item(),id:20,note:48,type:'raven',sound:{...f.item().sound,...preset.settings,instrument:id,channel:'2'}};
  engine.hit(source,.2,true);const nodes=engine.context.nodes.slice(before),pan=nodes.find(node=>node.kind==='StereoPanner');assert.equal(pan.connections[0],engine.drumLevels[family]);
  const tonal=preset.components.filter(component=>!component.noise),oscillators=nodes.filter(node=>node.kind==='Oscillator');
  for(let i=0;i<tonal.length;i++)assert.equal(oscillators[i].frequency.events[0][1],Math.min(engine.context.sampleRate*.45,Math.max(15,tonal[i].frequency*2)));
  for(const node of nodes.filter(node=>node.kind==='Oscillator'||node.kind==='BufferSource'))assert.ok(node.stopAt>.2);
 }
});
test('drum timbres preserve the mix, save their settings and reject corrupt values before import',async()=>{
 const f=await setup();f.evaluate('performancePatch.selectedVoice=2;performancePatch.drums.hat=.2;');
 for(const preset of require('../sketches/landscape/performance-controls.js').drumTimbres){f.evaluate(`Object.assign(performancePatch.drums,${JSON.stringify(preset.settings)});`);f.engine.configure();assert.equal(f.engine.drumLevels.hat.gain.value,.2,preset.name+' сохраняет уровень хэта');}
 const saved={...JSON.parse(JSON.stringify(f.serial())),performancePatch:JSON.parse(JSON.stringify(f.evaluate('performancePatch')))};
 assert.deepEqual(files.decode(files.encode(saved,'Ритм')).snapshot.performancePatch,saved.performancePatch);
 for(const mutate of [p=>p.drums.kick=-1,p=>p.drums.decay=2,p=>delete p.drums.echo,p=>p.selectedVoice=3]){const bad=structuredClone(saved);mutate(bad.performancePatch);assert.throws(()=>files.validateSnapshot(bad));}
 const old=structuredClone(saved);delete old.performancePatch.drums;old.performancePatch.selectedVoice=1;files.validateSnapshot(old);
});

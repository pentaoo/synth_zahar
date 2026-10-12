'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const files=require('../sketches/landscape/layout-files.js');
function snapshot(){return {
 version:5,worldKey:'autumn',bpm:80,phraseLength:8,selectedId:1,nextId:3,tool:'fog',showAudio:true,
 scaleSettings:{autumn:{tonic:9,mode:'minorPent'},space:{tonic:0,mode:'free'}},
 waveforms:{autumn:['triangle','sine'],space:['sawtooth','square']},
 scenes:{autumn:[{id:1,type:'fog',x:.375,y:.634985,muted:false,steps:[0,1,7],sound:{gain:.85,pan:-.23,octave:1,detune:-17,duration:.28,attack:.06,decay:.3,sustain:.6,release:.5,brightness:3400,channel:'auto'}}],space:[{id:2,type:'star',x:.753429,y:.87125,steps:[],muted:true}]},
 soundSettings:{autumn:{master:.34,threshold:-24,ratio:6,voices:[{gain:.9,pan:-.5,detune:0},{gain:.6,pan:.25,detune:7}],drums:{gain:.85,pan:.1,decay:.18,tone:.7,noise:.3},effects:{synth:{brightness:6000,drive:.08,delayMix:.25,delayTime:.375,feedback:.3,reverbMix:.16,room:1.6},drum:{brightness:8000,drive:.04,delayMix:.08,delayTime:.125,feedback:.12,reverbMix:.08,room:1.1}}}}
};}
test('file round trip preserves both scenes, precise positions, rhythm and every sound setting',()=>{
 const original=snapshot(),text=files.encode(original,'Осень из Dia','2026-10-12T10:00:00.000Z'),decoded=files.decode(text);
 assert.deepEqual(decoded.snapshot,original);assert.equal(decoded.name,'Осень из Dia');
 assert.equal(JSON.parse(text).savedAt,'2026-10-12T10:00:00.000Z');
 decoded.snapshot.scenes.autumn[0].y=.2;assert.equal(original.scenes.autumn[0].y,.634985);
});
test('browser snapshots and old raw saves remain importable',()=>{
 const raw=snapshot();raw.version=3;delete raw.soundSettings;delete raw.scenes.autumn[0].sound;
 assert.deepEqual(files.decode(JSON.stringify(raw)).snapshot,raw);
 assert.deepEqual(files.decode(JSON.stringify({privateContent:raw})).snapshot,raw);
 assert.deepEqual(files.decode('\uFEFF'+JSON.stringify(raw)).snapshot,raw);
});
test('empty scenes and silent held-note patterns survive export',()=>{
 const state=snapshot();state.scenes.space=[];state.scenes.autumn[0].steps=[];
 assert.deepEqual(files.decode(files.encode(state,'Тишина')).snapshot,state);
 state.scenes.autumn=[];state.selectedId=null;
 assert.deepEqual(files.decode(files.encode(state,'Пустой холст')).snapshot,state);
});
test('invalid files are rejected without changing the supplied composition',()=>{
 const original=snapshot(),before=JSON.stringify(original);
 const bads=[null,{},'not json',{...original,version:99},{...original,worldKey:'__proto__'},{...original,phraseLength:33},{...original,bpm:0},{...original,nextId:1e308},{...original,scenes:{autumn:[]}}];
 for(const bad of bads)assert.throws(()=>files.decode(typeof bad==='string'?bad:JSON.stringify(bad)));
 assert.equal(JSON.stringify(original),before);
 assert.throws(()=>files.decode(JSON.stringify({format:files.FORMAT,formatVersion:2,state:original})));
});
test('malformed sources, duplicate IDs and unsafe audio parameters are rejected',()=>{
 const variants=[s=>s.scenes.autumn[0].steps=[-1],s=>s.scenes.autumn[0].steps=[32],s=>s.scenes.autumn[0].x=1.1,s=>s.scenes.space[0].id=1,s=>s.scenes.space[0].type='fog',s=>s.scenes.autumn[0].sound.attack=-1,s=>s.soundSettings.autumn.effects.synth.feedback=2,s=>s.soundSettings.autumn.voices=null,s=>s.waveforms.autumn=['noise','sine']];
 for(const mutate of variants){const state=snapshot();mutate(state);assert.throws(()=>files.decode(JSON.stringify(state)));}
});
test('large files are rejected and filenames cannot include directory separators',()=>{
 assert.throws(()=>files.decode(' '.repeat(files.MAX_BYTES+1)));
 assert.equal(files.filename('Осень из Dia'),'Осень из Dia.landscape.json');
 assert.equal(files.filename('../../фраза.json'),'-..-фраза.landscape.json');
 assert.equal(files.filename(''),'Пейзаж.landscape.json');
 assert.equal(files.normalizeName('  Осень\n  '),'Осень');
});

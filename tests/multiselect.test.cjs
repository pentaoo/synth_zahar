'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,between}=require('./helpers/audio-fixture.cjs');
async function editor(){
 const f=await fixture([0,2]);
 f.evaluate(`
  let sound=engine,layers=[],selectedLayerId=1,currentLayerId=1,compositionTempo=96,cycleBeats=16,editorView='field',audioHost=null,pendingPersistence=false;
  const FALL_TIME=.8;let fields=[],activeFieldId=1,queuedFieldId=null,sequenceEnabled=true,fieldCycle=0,selectedFieldId=1,fieldDrag=null,renderedFields=null,renderedLayers=null;
  let elapsed=0,beat=0,nextPhraseBeat=0,lastTime=0,audioAnchor=0,wallAnchor=0,playingStepAt=null,phraseEvents=[],particles=[],ripples=[],ghost=null,drag=null;
  const scale=()=>scaleSettings[worldKey],allowedNotes=()=>Array.from({length:25},(_,i)=>48+i);
  const history=[],performance={now:()=>0},node={dataset:{},setAttribute(){},children:[]},q=()=>node,all=()=>[],status=()=>{},openInspector=()=>{},sync=()=>{},syncFields=()=>{},syncPlayhead=()=>{},commit=()=>{};
  const remember=()=>history.push(serial()),persist=()=>{},MAX_FIELDS=8;
 `+between('  function stepX(', '  function noteName(')+between('  const activeField =','  function persist() {')+
 between('  function restore(saved) {','  const starterSnapshot=')+
 between('  function anchorClock(){','  function addSource(')+between('  function nextFieldId() {','  function syncFields() {')+
 between('  function toggleStep(step){','  function syncPattern(){')+`
  phraseLength=4;bpm=96;scenes.space=[];
  const fog=scene()[0];scene().push({...clone(fog),id:2,type:'leaf',steps:[1]}, {...clone(fog),id:3,type:'raven',steps:[3]});nextId=4;
  const base=fieldSnapshot(),makeFields=()=>[1,2].map(id=>({id,name:'Фраза '+id,repeats:1,snapshot:clone(base)}));
  installLayers([{id:1,kind:'main',gain:1,muted:false,fields:makeFields(),activeFieldId:1},{id:2,kind:'bass',gain:.8,muted:false,fields:makeFields(),activeFieldId:1}]);
  globalThis.editor={init:initializeLayers,step:toggleStep,param:setSourceParameter,remove:deleteSources,copy:duplicateSources,removePhrases:deletePhraseSelection,
    sources(ids){selectSources(ids);},
    batch(){editorView='composition';selectedPhraseKeys=new Set(['1:2','2:1']);compositionSourceFilter='type:leaf';},
    state:serial,history:()=>history.length,
    inspect:inspectField,
    filter(value){compositionSourceFilter=value;},
    undo(){restore(history.pop());},
    missingCounter(){delete layers[0].fields[1].snapshot.nextId;},
    allPhrases(){editorView='composition';selectedPhraseKeys=new Set(layers.flatMap(layer=>layer.fields.map(field=>phraseKey(layer.id,field.id))));},
    phrases(keys){editorView='composition';selectedPhraseKeys=new Set(keys);},
    clearPhrases(){editorView='composition';selectedPhraseKeys.clear();phraseSelectionCleared=true;},
    hold(){playingStep=0;activatedHeld.add(1);sound.syncHeld();storeCurrentLayer();},
    held:()=>layers[0].engine.held.size,
    wave(){editFields(snapshot=>snapshot.waveforms.autumn[0]='square');},
    clocks:()=>layers.map(layer=>({active:layer.context.activeFieldId,queued:layer.context.queuedFieldId})),
  };
 `);
 const e=f.evaluate('editor');await e.init();return e;
}
const sources=(state,layerId=1,fieldId=1)=>state.layers.find(layer=>layer.id===layerId).fields.find(field=>field.id===fieldId).snapshot.scenes.autumn;
test('selected sources share rhythm and parameters while unselected sources retain their pattern and sound',async()=>{
 const e=await editor();e.sources([1,2]);const before=e.state();e.step(1);e.param('gain',.42);
 const after=sources(e.state());assert.deepEqual(Array.from(after[0].steps),[0,1,2]);assert.deepEqual(Array.from(after[1].steps),[1]);
 assert.equal(after[0].sound.gain,.42);assert.equal(after[1].sound.gain,.42);assert.deepEqual(after[2],sources(before)[2]);
 e.step(1);assert.deepEqual(Array.from(sources(e.state())[0].steps),[0,2]);assert.deepEqual(Array.from(sources(e.state())[1].steps),[]);
});
test('one grouped rhythm edit is one undo operation and restores every source',async()=>{
 const e=await editor();e.sources([1,2]);const before=e.state();e.step(1);assert.equal(e.history(),1);e.undo();
 assert.deepEqual(sources(e.state()),sources(before));
});
test('composition editing reaches an inactive phrase and another ring without cueing either ring',async()=>{
 const e=await editor();const before=e.state();e.batch();e.step(0);e.param('pan',-.3);const after=e.state();
 for(const [layer,field] of [[1,2],[2,1]]){const items=sources(after,layer,field);assert.deepEqual(Array.from(items[1].steps),[0,1]);assert.equal(items[1].sound.pan,-.3);assert.deepEqual(items[0],sources(before,layer,field)[0]);}
 assert.deepEqual(sources(after,1,1),sources(before,1,1));assert.deepEqual(sources(after,2,2),sources(before,2,2));
 assert.deepEqual(Array.from(e.clocks(),clock=>({...clock})),[{active:1,queued:null},{active:1,queued:null}]);
});
test('common phrase settings apply to every selected phrase, preserving unrelated phrases',async()=>{
 const e=await editor();e.batch();e.wave();const state=e.state();
 for(const [layer,field] of [[1,2],[2,1]])assert.equal(state.layers.find(item=>item.id===layer).fields.find(item=>item.id===field).snapshot.waveforms.autumn[0],'square');
 assert.equal(state.layers[0].fields[0].snapshot.waveforms.autumn[0],'triangle');assert.equal(state.layers[1].fields[1].snapshot.waveforms.autumn[0],'triangle');
});
test('group copy and delete retain independent source settings and each action is undoable',async()=>{
 const e=await editor();e.sources([1,2]);e.copy();let items=sources(e.state());assert.equal(items.length,5);
 assert.equal(items[3].type,'fog');assert.equal(items[4].type,'leaf');assert.notEqual(items[3].id,items[0].id);assert.equal(e.history(),1);
 e.remove();assert.equal(sources(e.state()).length,3);assert.equal(e.history(),2);e.undo();assert.equal(sources(e.state()).length,5);
});
test('deleting selected phrases across rings is one action and undo restores the whole group',async()=>{
 const e=await editor();const before=e.state();e.batch();e.removePhrases();const after=e.state();
 assert.deepEqual(Array.from(after.layers[0].fields,field=>field.id),[1]);assert.deepEqual(Array.from(after.layers[1].fields,field=>field.id),[2]);assert.equal(e.history(),1);
 e.undo();assert.deepEqual(JSON.parse(JSON.stringify(e.state().layers)),JSON.parse(JSON.stringify(before.layers)));
});
test('deleting all phrases removes every ring and undo restores the complete composition',async()=>{
 const e=await editor();e.allPhrases();e.removePhrases();const state=e.state();
 assert.equal(state.layers.length,0);assert.equal(state.fields.length,0);assert.equal(state.selectedLayerId,null);assert.equal(state.activeFieldId,null);
 assert.equal(state.scenes.autumn.length,0);assert.equal(state.scenes.space.length,0);assert.equal(e.history(),1);
 require('../sketches/landscape/layout-files.js').validateSnapshot(state);
 e.undo();assert.ok(e.state().layers.every(layer=>layer.fields.length===2));
});
test('an empty marquee cannot delete the previous phrase',async()=>{
 const e=await editor();e.clearPhrases();e.removePhrases();assert.equal(e.history(),0);assert.ok(e.state().layers.every(layer=>layer.fields.length===2));
});
test('deleting every phrase of one ring and part of another removes only the empty ring',async()=>{
 const e=await editor();const before=e.state();e.phrases(['1:1','1:2','2:1']);e.removePhrases();const after=e.state();
 assert.equal(after.layers.length,1);assert.equal(after.layers[0].id,2);assert.equal(after.selectedLayerId,2);
 assert.equal(after.layers[0].fields.length,1);assert.equal(after.layers[0].activeFieldId,2);
 assert.deepEqual(sources(after,2,2),sources(before,2,2));assert.equal(e.history(),1);
 e.undo();assert.deepEqual(JSON.parse(JSON.stringify(e.state().layers)),JSON.parse(JSON.stringify(before.layers)));
});
test('deleting a selected held source stops its audio voice',async()=>{
 const e=await editor();e.sources([1,2]);e.hold();assert.equal(e.held(),1);e.remove();assert.equal(e.held(),0);assert.equal(sources(e.state()).length,1);
});
test('copying an inactive imported phrase without a source counter creates valid unique IDs',async()=>{
 const e=await editor();e.missingCounter();e.batch();e.copy();const state=e.state(),items=sources(state,1,2);
 assert.equal(items.length,4);assert.equal(new Set(items.map(item=>item.id)).size,4);assert.ok(Number.isSafeInteger(items[3].id));
 require('../sketches/landscape/layout-files.js').validateSnapshot(state);
});

test('a single selected inactive phrase edits only its chosen sources without cueing playback',async()=>{
 const e=await editor();const before=e.state();e.phrases(['1:1']);e.inspect(2,1);e.filter('type:leaf');e.param('noise',.47);
 assert.equal(sources(e.state(),1,2)[1].sound.noise,.47);
 assert.deepEqual(sources(e.state(),1,1),sources(before,1,1));
 assert.deepEqual(sources(e.state(),1,2)[0],sources(before,1,2)[0]);
 assert.deepEqual(Array.from(e.clocks(),clock=>({...clock})),[{active:1,queued:null},{active:1,queued:null}]);
});

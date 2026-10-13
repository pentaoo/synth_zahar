/* Portable local layout files. No network or audio access. */
(() => {
  'use strict';
  const FORMAT = 'landscape-layout';
  const MAX_BYTES = 1024 * 1024;
  const VERSIONS = [1, 2, 3, 4, 5, 6, 7];
  const TYPES = {autumn:['drop','leaf','raven','fog'],space:['comet','star','asteroid','aurora']};
  const WAVES = ['sine','triangle','sawtooth','square','noise'];
  const instruments = typeof module!=='undefined'&&module.exports ? require('./instruments.js') : window.LandscapeInstruments;
  const MODES = ['major','minor','dorian','phrygian','lydian','mixolydian','locrian','majorPent','minorPent','chromatic','free'];
  const SOURCE_RANGES = {gain:[0,1.5],pan:[-1,1],octave:[-2,2],detune:[-50,50],duration:[.08,2],attack:[.002,1],decay:[.02,1],sustain:[0,1],release:[.03,2],brightness:[300,12000],noise:[0,1],fm:[0,5],harmonicity:[.5,8],sub:[0,1],vibrato:[0,100],motion:[0,1],lfoRate:[.1,12],pulse:[0,1],drive:[0,1]};
  const FX_RANGES = {brightness:[300,12000],drive:[0,1],delayMix:[0,.8],delayTime:[.04,1],feedback:[0,.75],reverbMix:[0,.8],room:[.4,4]};
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  function invalid(message='Этот файл не является раскладкой Пейзажа.') {throw new Error(message);}
  function number(value,min,max,integer=false) {return Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value));}
  function ranges(value,spec) {
    if(!record(value))invalid('Повреждены настройки звука в файле.');
    for(const [key,[min,max]] of Object.entries(spec))if(key in value&&!number(value[key],min,max,key==='octave'))invalid('Недопустимый параметр звука: '+key+'.');
  }
  function validateSnapshot(snapshot) {
    if(!record(snapshot)||!VERSIONS.includes(snapshot.version)||!Object.hasOwn(TYPES,snapshot.worldKey)||!record(snapshot.scenes))invalid();
    if(snapshot.performancePatch!==undefined){
      const patch=snapshot.performancePatch;if(!record(patch)||['drive','echo','space','swing','master'].some(key=>!Object.hasOwn(patch,key)))invalid('Неполная панель синтеза.');ranges(patch,{drive:[0,1],echo:[0,.8],space:[0,.8],swing:[0,.5],master:[0,.8]});
      if(!number(patch.selectedVoice,0,1,true)||!Array.isArray(patch.voices)||patch.voices.length!==2)invalid('Повреждена панель синтеза.');
      for(const voice of patch.voices){if(!record(voice)||['wave','noise','brightness','fm','harmonicity','detune','motion','lfoRate','attack','release'].some(key=>!Object.hasOwn(voice,key)))invalid('Неполные настройки синта.');ranges(voice,{noise:[0,1],brightness:[300,12000],fm:[0,5],harmonicity:[.5,8],detune:[0,50],motion:[0,1],lfoRate:[.1,12],attack:[.002,1],release:[.03,2]});if(!WAVES.includes(voice.wave))invalid('Неизвестная волна синта.');}
    }
    if(snapshot.version===7) {
      if(!Array.isArray(snapshot.layers)||snapshot.layers.length>4)invalid('В композиции может быть до 4 слоёв.');
      if(!number(snapshot.compositionTempo,45,160,true)||!number(snapshot.cycleBeats,1,128,true))invalid('Повреждены темп или длина оборота.');
      const ids=new Set();
      for(const layer of snapshot.layers){
        if(!record(layer)||!number(layer.id,1,Number.MAX_SAFE_INTEGER-32,true)||ids.has(layer.id)||!['main','bass','melody','drums'].includes(layer.kind)||!number(layer.gain,0,1.5)||typeof layer.muted!=='boolean')invalid('Повреждены настройки слоя.');
        ids.add(layer.id);
        validateSnapshot({...snapshot,version:6,layers:undefined,fields:layer.fields,activeFieldId:layer.activeFieldId});
      }
      if(snapshot.layers.length){if(!ids.has(snapshot.selectedLayerId))invalid('Неизвестный выбранный слой.');}
      else if(snapshot.selectedLayerId!==null||snapshot.activeFieldId!==null||snapshot.selectedId!==null||!Array.isArray(snapshot.fields)||snapshot.fields.length||Object.values(snapshot.scenes).some(sources=>!Array.isArray(sources)||sources.length)||typeof snapshot.sequenceEnabled!=='boolean')invalid('Повреждена пустая композиция.');
    }
    if(snapshot.version===6) {
      if(!Array.isArray(snapshot.fields)||snapshot.fields.length<1||snapshot.fields.length>16)invalid('В слое должно быть от 1 до 16 фраз.');
      const fieldIds=new Set();
      for(const field of snapshot.fields) {
        if(!record(field)||!number(field.id,1,Number.MAX_SAFE_INTEGER-32,true)||fieldIds.has(field.id))invalid('Повреждён список полей.');
        fieldIds.add(field.id);
        if(typeof field.name!=='string'||!field.name.trim()||field.name.length>80||normalizeName(field.name)!==field.name)invalid('Недопустимое название поля.');
        if(!number(field.repeats,1,32,true))invalid('Число повторов поля должно быть от 1 до 32.');
        if(!record(field.snapshot)||field.snapshot.version!==5||'fields' in field.snapshot)invalid('Повреждено содержимое поля.');
        validateSnapshot(field.snapshot);
      }
      if(!fieldIds.has(snapshot.activeFieldId)||typeof snapshot.sequenceEnabled!=='boolean')invalid('Повреждены настройки порядка полей.');
    }
    if(!number(snapshot.bpm,45,160,true))invalid('Темп в раскладке должен быть от 45 до 160 BPM.');
    if(snapshot.version>=3&&!number(snapshot.phraseLength,1,32,true))invalid('Длина фразы должна быть от 1 до 32 долей.');
    if('nextId' in snapshot&&!number(snapshot.nextId,1,Number.MAX_SAFE_INTEGER-32,true))invalid('Повреждён счётчик источников.');
    if('selectedId' in snapshot&&snapshot.selectedId!==null&&!number(snapshot.selectedId,1,Number.MAX_SAFE_INTEGER-32,true))invalid('Повреждён выбор источника.');
    if('toolInstrument' in snapshot&&snapshot.toolInstrument!=='default'&&!instruments.get(snapshot.toolInstrument))invalid('Неизвестный инструмент палитры.');
    const ids=new Set();
    for(const [world,types] of Object.entries(TYPES)) {
      const sources=snapshot.scenes[world];
      if(!Array.isArray(sources)||sources.length>16)invalid('В каждом пейзаже может быть до 16 источников.');
      for(const source of sources) {
        if(!record(source)||!number(source.id,1,Number.MAX_SAFE_INTEGER-32,true)||ids.has(source.id)||!types.includes(source.type)||!number(source.x,0,1)||!number(source.y,0,1))invalid('Повреждён источник в раскладке.');
        ids.add(source.id);
        if(snapshot.version>=3&&(!Array.isArray(source.steps)||source.steps.length>32||source.steps.some(step=>!number(step,0,31,true))))invalid('Недопустимые доли источника.');
        if('muted' in source&&typeof source.muted!=='boolean')invalid('Повреждено состояние приглушения.');
        if(source.sound!==undefined) {
          ranges(source.sound,SOURCE_RANGES);
          if('channel' in source.sound&&!['auto','0','1','2'].includes(source.sound.channel))invalid('Неизвестный звуковой канал.');
          if('instrument' in source.sound&&source.sound.instrument!=='default'&&!instruments.get(source.sound.instrument))invalid('Неизвестный инструмент.');
          if('wave' in source.sound&&!['auto',...WAVES].includes(source.sound.wave))invalid('Неизвестная форма волны источника.');
          const preset=instruments.get(source.sound.instrument);
          if(preset&&preset.category!=='waves'&&instruments.typeFor(preset,world)!==source.type)invalid('Инструмент не соответствует предмету.');
        }
      }
      const scale=snapshot.scaleSettings?.[world];
      if(scale!==undefined&&(!record(scale)||!number(scale.tonic,0,11,true)||!MODES.includes(scale.mode)))invalid('Неизвестная тональность или лад.');
      const waves=snapshot.waveforms?.[world];
      if(waves!==undefined&&(!Array.isArray(waves)||waves.length!==2||waves.some(wave=>!WAVES.includes(wave))))invalid('Неизвестная форма волны.');
      const mix=snapshot.soundSettings?.[world];
      if(mix!==undefined) {
        ranges(mix,{master:[0,.8],threshold:[-40,0],ratio:[1,12],swing:[0,.5]});
        if(mix.voices!==undefined) {
          if(!Array.isArray(mix.voices)||mix.voices.length!==2)invalid('В раскладке должны быть два синта.');
          mix.voices.forEach(voice=>ranges(voice,{gain:[0,1.5],pan:[-1,1],detune:[-50,50]}));
        }
        if(mix.drums!==undefined)ranges(mix.drums,{gain:[0,1.5],pan:[-1,1],decay:[.05,1],tone:[.3,2],noise:[0,1]});
        if(mix.effects!==undefined) {
          if(!record(mix.effects))invalid('Повреждены эффекты.');
          for(const bus of ['synth','drum'])if(mix.effects[bus]!==undefined)ranges(mix.effects[bus],FX_RANGES);
        }
      }
    }
    return copy(snapshot);
  }
  function normalizeName(name) {return typeof name==='string'?name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80):'';}
  function filename(name) {
    const title=normalizeName(name).replace(/(?:\.landscape)?\.json$/i,'').replace(/[\\/:*?"<>|]/g,'-').replace(/^\.+|[. ]+$/g,'').trim();
    return (title||'Пейзаж')+'.landscape.json';
  }
  function encode(snapshot,name,savedAt=new Date().toISOString()) {
    return JSON.stringify({format:FORMAT,formatVersion:1,name:normalizeName(name)||'Моя композиция',savedAt,state:validateSnapshot(snapshot)},null,2)+'\n';
  }
  function decode(text) {
    if(typeof text!=='string'||text.length>MAX_BYTES)invalid('Файл слишком большой. Максимум — 1 МБ.');
    let value;
    try {value=JSON.parse(text.replace(/^\uFEFF/,''));} catch {invalid('Не удалось прочитать JSON. Выбери сохранённый файл раскладки.');}
    let snapshot=value,name;
    if(record(value)&&'format' in value) {
      if(value.format!==FORMAT||value.formatVersion!==1)invalid('Этот формат раскладки пока не поддерживается.');
      snapshot=value.state;name=value.name;
    } else if(record(value)&&'privateContent' in value)snapshot=value.privateContent;
    const result=validateSnapshot(snapshot);
    return {snapshot:result,name:normalizeName(name)||normalizeName(result.layoutName)};
  }
  const api={FORMAT,MAX_BYTES,validateSnapshot,normalizeName,filename,encode,decode};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.LandscapeFiles=api;
})();

/* Local Web Audio recipes: no samples, downloads or extra audio channels. */
(() => {
  'use strict';
  const categories = {waves:'Волны',drums:'Барабаны'};
  const tone = (frequency, endFrequency, decay, level=1, wave='sine', delay=0) => ({frequency,endFrequency,decay,level,wave,delay});
  const noise = (filter, frequency, decay, level=1, delay=0, q=.7) => ({noise:true,filter,frequency,decay,level,delay,q});
  const drum = (id,name,texture,components,duration=.18) => ({id,category:'drums',name,texture,type:'raven',channel:2,components,settings:{duration,attack:.002,decay:.08,sustain:0,release:.03,brightness:12000,wave:'auto',noise:1}});
  const synth = (id,category,name,texture,wave,settings={},partials=[],fm=null) => ({id,category,name,texture,type:category==='bass'?'drop':'leaf',channel:category==='bass'?0:1,partials,fm,settings:{wave,octave:category==='bass'?-2:0,duration:.16,attack:.006,decay:.2,sustain:.2,release:.2,brightness:5000,...settings}});
  const legacyCatalog = [
    drum('kick-deep','Бочка · саб','Глубокая, длинная',[tone(145,43,.48),noise('lowpass',1400,.012,.14)],.36),
    drum('kick-punch','Бочка · панч','Плотная, с щелчком',[tone(190,56,.22),noise('highpass',2600,.016,.32)]),
    drum('kick-soft','Бочка · мягкая','Тёплая, приглушённая',[tone(88,48,.28,.85),noise('lowpass',700,.026,.12)],.24),
    drum('snare-dry','Снейр · сухой','Короткий, хлёсткий',[tone(190,125,.09,.48,'triangle'),noise('highpass',1200,.16,.95)]),
    drum('snare-dust','Снейр · пыль','Шершавый, глухой',[tone(165,110,.14,.38),noise('bandpass',1900,.28,1,0,1.1)],.24),
    drum('snare-electro','Снейр · электро','Яркий, пружинящий',[tone(290,170,.1,.48),tone(410,240,.075,.18),noise('highpass',2200,.2,.8)]),
    drum('hat-closed','Хэт · закрытый','Сухой, острый',[noise('highpass',6800,.045,.8),tone(8100,8100,.026,.12,'square')],.08),
    drum('hat-open','Хэт · открытый','Воздушный, длинный',[noise('highpass',5600,.38,.62),tone(7300,7300,.21,.1,'square')],.36),
    drum('hat-pedal','Хэт · педаль','Мягкий, шипящий',[noise('bandpass',7400,.1,.72,0,.65)],.12),
    drum('clap','Хлопок','Три удара, широкий хвост',[noise('bandpass',1500,.025,.8),noise('bandpass',1700,.025,.8,.012),noise('bandpass',1900,.14,.8,.026)]),
    drum('rim','Римшот','Деревянный щелчок',[tone(840,700,.035,.7,'triangle'),tone(1700,1600,.018,.25),noise('bandpass',2800,.015,.18)],.08),
    drum('tom-low','Том · низкий','Округлый, глубокий',[tone(155,78,.33,.9),noise('lowpass',1800,.025,.17)],.3),
    drum('tom-high','Том · высокий','Упругий, звонкий',[tone(290,165,.23,.8),noise('lowpass',2600,.022,.2)],.22),
    drum('shaker','Шейкер','Зернистый шелест',[noise('bandpass',5200,.045,.6,0,.5),noise('highpass',4200,.06,.42,.035)],.1),
    drum('ride','Райд','Металлический звон',[tone(3100,3100,.65,.16,'square'),tone(4387,4387,.54,.11,'square'),tone(6199,6199,.4,.1,'square'),noise('highpass',7600,.4,.23)],.65),
    drum('metal','Металл','Неровный, индустриальный',[tone(460,420,.36,.38,'square'),tone(731,710,.25,.2,'square'),tone(1193,1110,.19,.16),noise('bandpass',3200,.17,.35)],.3),
    synth('bass-sub','bass','Саб','Чистый, глубокий','sine',{brightness:900,sustain:.75,release:.16}),
    synth('bass-round','bass','Круглый бас','Тёплый, мягкий','triangle',{brightness:1600,sustain:.55},[{ratio:1,level:1},{ratio:2,level:.16}]),
    synth('bass-analog','bass','Аналоговый','Плотный, с биениями','sawtooth',{brightness:1800,sustain:.6},[{ratio:1,level:.65,detune:-5},{ratio:1,level:.35,detune:5}]),
    synth('bass-rubber','bass','Резиновый','Упругий, скользящий','square',{brightness:2200,decay:.24,sustain:.25}),
    synth('bass-pluck','bass','Щипковый бас','Короткий, собранный','triangle',{duration:.08,decay:.18,sustain:.04,release:.09,brightness:2400},[{ratio:1,level:1},{ratio:2,level:.28,decay:.06}]),
    synth('bass-growl','bass','Рычание','Шершавый, насыщенный','sawtooth',{brightness:2800,sustain:.5},[{ratio:1,level:.75},{ratio:.5,level:.25,wave:'square'}]),
    synth('bass-fm','bass','FM-бас','Ударный, металлический','sine',{decay:.22,sustain:.25,brightness:3600},[],{ratio:2,index:2.4,decay:.13}),
    synth('bass-reed','bass','Тростниковый','Полый, носовой','square',{brightness:1400,sustain:.55,attack:.012},[{ratio:1,level:1},{ratio:3,level:.15,wave:'sine'}]),
    synth('melody-keys','melody','Клавиши','Мягкий электрический тон','sine',{duration:.12,decay:.45,sustain:.13,release:.38},[{ratio:1,level:1},{ratio:2,level:.32,decay:.18},{ratio:3,level:.08,decay:.08}]),
    synth('melody-bell','melody','Колокол','Звонкий, металлический','sine',{decay:.6,sustain:.04,release:.8,brightness:9000},[],{ratio:2.76,index:2.8,decay:.3}),
    synth('melody-pluck','melody','Струна','Яркий щипок','sawtooth',{duration:.08,decay:.2,sustain:.03,release:.12,brightness:3400}),
    synth('melody-marimba','melody','Маримба','Деревянная, округлая','sine',{duration:.08,decay:.25,sustain:.02,release:.12,brightness:4000},[{ratio:1,level:1},{ratio:4,level:.28,decay:.045}]),
    synth('melody-kalimba','melody','Калимба','Нежная, с щелчком','triangle',{duration:.08,decay:.32,sustain:.06,release:.3,brightness:6000},[{ratio:1,level:1},{ratio:3.02,level:.2,decay:.065}]),
    synth('melody-glass','melody','Стекло','Прозрачный перелив','sine',{decay:.48,sustain:.03,release:.65,brightness:10000},[{ratio:1,level:1},{ratio:2.01,level:.35,decay:.24},{ratio:3.97,level:.16,decay:.13}]),
    synth('melody-lead','melody','Лид','Яркий, певучий','sawtooth',{attack:.016,decay:.12,sustain:.65,release:.18,brightness:3600},[{ratio:1,level:.6,detune:-6},{ratio:1,level:.4,detune:6}]),
    synth('melody-flute','melody','Флейта','Мягкая, полая','sine',{attack:.08,decay:.12,sustain:.7,release:.24,brightness:2600},[{ratio:1,level:1},{ratio:2,level:.1},{ratio:3,level:.04}]),
    synth('melody-strings','melody','Струнные','Плавные, тёплые','sawtooth',{attack:.18,decay:.2,sustain:.65,release:.55,brightness:2200},[{ratio:1,level:.5,detune:-9},{ratio:1,level:.5,detune:9}]),
    {...synth('melody-pad','melody','Туман','Непрерывный мягкий слой','triangle',{attack:.3,decay:.3,sustain:.65,release:.7,brightness:1800},[{ratio:1,level:.6,detune:-4},{ratio:1,level:.4,detune:4}]),type:'fog',sustained:true}
  ];
  // A small pitch scoop gives the rubber bass its elastic attack.
  const rubber = legacyCatalog.find(preset=>preset.id==='bass-rubber');
  rubber.partials=[{ratio:1,level:1,scoop:1.8}];
  const waveNames = {sine:'Синус',triangle:'Треугольник',sawtooth:'Пила',square:'Квадрат',noise:'Белый шум'};
  const textures = {sine:'Чистый тон',triangle:'Мягкие гармоники',sawtooth:'Яркие гармоники',square:'Полый электронный тон',noise:'Шорох и воздух'};
  const waves = Object.keys(waveNames).map(wave=>({id:'wave-'+wave,category:'waves',name:waveNames[wave],texture:textures[wave],type:'drop',channel:0,partials:[],settings:{wave,noise:0,octave:0,duration:.16,attack:.006,decay:.18,sustain:.35,release:.2,brightness:6000,detune:0}}));
  const catalog = [...waves,...['kick-deep','snare-dry','hat-closed'].map(id=>legacyCatalog.find(preset=>preset.id===id))];
  // Existing personal layouts keep their old recipes; only the small catalog is shown.
  const byId = new Map([...legacyCatalog,...catalog].map(preset=>[preset.id,preset]));
  const motionDefaults={fm:0,harmonicity:2,sub:0,vibrato:0,motion:0,lfoRate:3,pulse:0,drive:0};
  const soundPresets = [
    {id:'clean',name:'Чистый',settings:{wave:'sine',noise:0,detune:0,attack:.006,decay:.18,sustain:.7,release:.2,brightness:6000}},
    {id:'pluck',name:'Щипок',settings:{wave:'triangle',noise:0,detune:0,attack:.002,decay:.12,sustain:.03,release:.09,brightness:4200}},
    {id:'float',name:'Плывущий',settings:{wave:'sawtooth',noise:.03,detune:9,attack:.3,decay:.3,sustain:.65,release:.7,brightness:2200}},
    {id:'rough',name:'Шершавый',settings:{wave:'square',noise:.22,detune:4,attack:.006,decay:.16,sustain:.45,release:.2,brightness:3800,drive:.4}},
    {id:'metal',name:'Металл',settings:{wave:'sine',noise:0,detune:3,attack:.002,decay:.32,sustain:.14,release:.4,brightness:8000,fm:1.6,harmonicity:2.76}},
    {id:'pulse',name:'Пульс',settings:{wave:'sawtooth',noise:.04,detune:7,attack:.01,decay:.15,sustain:.55,release:.2,brightness:2400,sub:.3,motion:.7,pulse:.45,lfoRate:3.2,drive:.18}}
  ];
  soundPresets.forEach(preset=>preset.settings={...motionDefaults,...preset.settings});
  const get = id => byId.get(id) || null;
  const forCategory = category => catalog.filter(preset=>preset.category===category);
  const typeFor = (preset,world='autumn') => world==='space'?({drop:'comet',leaf:'star',raven:'asteroid',fog:'aurora'}[preset.type]):preset.type;
  const api = {catalog,categories,get,forCategory,typeFor,soundPresets,waveNames};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.LandscapeInstruments=api;
})();

/* A small performance surface: two voices, eight knobs each, four shared effects. */
(() => {
 'use strict';
 const waves=['sine','triangle','sawtooth','square','noise'];
 const names=['Синус','Треугольник','Пила','Квадрат','Белый шум'];
 const timbres=[
  {name:'Мягкий',settings:{wave:'sine',noise:.01,brightness:2000,fm:.1,harmonicity:2,detune:4,motion:.12,lfoRate:.8,attack:.04,release:.55}},
  {name:'Щипок',settings:{wave:'triangle',noise:0,brightness:4300,fm:.35,harmonicity:2,detune:6,motion:.08,lfoRate:2,attack:.004,release:.13}},
  {name:'Стекло',settings:{wave:'sine',noise:0,brightness:7400,fm:1.7,harmonicity:2.76,detune:9,motion:.2,lfoRate:1.8,attack:.006,release:.65}},
  {name:'Шершавый',settings:{wave:'sawtooth',noise:.13,brightness:3200,fm:.65,harmonicity:1.5,detune:21,motion:.55,lfoRate:3.5,attack:.01,release:.28}}
 ];
 const drumTimbres=[
  {name:'Сухо',settings:{tone:.7,decay:.12,noise:.25,brightness:9500,drive:0,echo:0,space:0}},
  {name:'Тепло',settings:{tone:.5,decay:.25,noise:.18,brightness:3000,drive:.16,echo:.025,space:.05}},
  {name:'Плотно',settings:{tone:.8,decay:.2,noise:.5,brightness:7000,drive:.4,echo:0,space:.035}},
  {name:'Воздух',settings:{tone:1.1,decay:.38,noise:.8,brightness:11000,drive:.04,echo:.12,space:.28}}
 ];
 const voiceControls=[
  {key:'wave',name:'Волна',min:0,max:4,step:1,format:value=>names[value]},
  {key:'brightness',name:'Яркость',min:300,max:12000,step:10,log:true,format:value=>value>=1000?(value/1000).toFixed(1)+' кГц':Math.round(value)+' Гц'},
  {key:'fm',name:'Металл',min:0,max:5,step:.01,format:value=>value.toFixed(2)},
  {key:'detune',name:'Расстройка',min:0,max:50,step:1,format:value=>Math.round(value)+' ц'},
  {key:'noise',name:'Шум',min:0,max:1,step:.01},
  {key:'motion',name:'Движение',min:0,max:1,step:.01},
  {key:'attack',name:'Атака',min:.002,max:1,step:.002,log:true,time:true},
  {key:'release',name:'Хвост',min:.03,max:2,step:.01,log:true,time:true}
 ];
 const effects=[
  {key:'drive',name:'Насыщение',min:0,max:1,step:.01},
  {key:'echo',name:'Эхо',min:0,max:.8,step:.01},
  {key:'space',name:'Пространство',min:0,max:.8,step:.01},
  {key:'swing',name:'Свинг',min:0,max:.5,step:.01}
 ];
 const drumControls=[
  {key:'kick',name:'Бочка',min:0,max:1.5,step:.01},
  {key:'snare',name:'Снейр',min:0,max:1.5,step:.01},
  {key:'hat',name:'Хэт',min:0,max:1.5,step:.01},
  {key:'gain',name:'Громкость',min:0,max:1.5,step:.01},
  {key:'tone',name:'Тон',min:.3,max:2,step:.01,format:value=>value.toFixed(2)+' ×'},
  {key:'noise',name:'Шум',min:0,max:1,step:.01},
  {key:'brightness',name:'Яркость',min:300,max:12000,step:10,log:true,format:value=>value>=1000?(value/1000).toFixed(1)+' кГц':Math.round(value)+' Гц'},
  {key:'decay',name:'Хвост',min:.05,max:1,step:.01,log:true,time:true}
 ];
 function mount(root,api){
  const panel=root.querySelector('[data-performance-panel]'),inputs=[];let controlsKind=null;
  function knob(spec,voice){
   const label=document.createElement('label');label.className='knob-control';
   const name=document.createElement('span');name.className='knob-name';name.textContent=spec.name;
   const surface=document.createElement('span');surface.className='knob-surface';
   const dial=document.createElement('span');dial.className='knob-dial';dial.setAttribute('aria-hidden','true');dial.append(document.createElement('i'));
   const input=document.createElement('input');input.type='range';input.min=spec.min;input.max=spec.max;input.step=spec.step;input.dataset.knob='';input.dataset.performanceKey=spec.key;input.setAttribute('aria-label',spec.name);if(spec.log)input.dataset.knobScale='log';
   const output=document.createElement('output');surface.append(dial,input);label.append(name,surface,output);
   input.addEventListener('pointerdown',api.remember);input.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))api.remember();});
   input.addEventListener('input',()=>{const value=Number(input.value),drums=api.get().selectedVoice===2,scope=voice==='drums'||!voice&&drums&&spec.key!=='swing'?'drums':voice;api.change(spec.key,voice===true&&spec.key==='wave'?waves[value]:value,scope);render();});
   inputs.push({input,output,spec,voice});return label;
  }
  function build(drums){
   controlsKind=drums;inputs.length=0;
   panel.querySelector('[data-voice-knobs]').replaceChildren(...(drums?drumControls:voiceControls).map(spec=>knob(spec,drums?'drums':true)));
   panel.querySelector('[data-effect-knobs]').replaceChildren(...effects.map(spec=>knob(spec,false)));
   panel.querySelector('[data-timbre-presets]').replaceChildren(...(drums?drumTimbres:timbres).map(preset=>{const button=document.createElement('button');button.type='button';button.textContent=preset.name;button.title=(drums?'Звучание барабанов: ':'Тембр выбранного синта: ')+preset.name;button.addEventListener('click',()=>{api.preset(preset.settings);render();});return button;}));
   panel.querySelector('.performance-fx-title').textContent=drums?'ЭФФЕКТЫ БАРАБАНОВ':'ЭФФЕКТЫ СИНТОВ';
   window.SynthKnobs.init(panel);
  }
  for(const button of panel.querySelectorAll('[data-performance-voice]'))button.addEventListener('click',()=>{api.selectVoice(Number(button.dataset.performanceVoice));render();});
  function render(){
   const patch=api.get();
   const drums=patch.selectedVoice===2;if(controlsKind!==drums)build(drums);
   for(const button of panel.querySelectorAll('[data-performance-voice]'))button.setAttribute('aria-pressed',String(Number(button.dataset.performanceVoice)===patch.selectedVoice));
   for(const {input,output,spec,voice} of inputs){
    let value=voice==='drums'||!voice&&drums&&spec.key!=='swing'?patch.drums[spec.key]:voice?patch.voices[patch.selectedVoice][spec.key]:patch[spec.key];if(spec.key==='wave')value=waves.indexOf(value);
    input.value=value;
    const text=spec.format?spec.format(value):spec.time?value<1?Math.round(value*1000)+' мс':value.toFixed(1)+' с':Math.round(value*100)+'%';
    output.textContent=text;input.setAttribute('aria-valuetext',text);window.SynthKnobs.update(input);
   }
  }
  render();return {render};
 }
 const api={mount,timbres,drumTimbres};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.PerformanceControls=api;
})();

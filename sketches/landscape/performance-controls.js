/* A small performance surface: two voices, eight knobs each, four shared effects. */
(() => {
 'use strict';
 const waves=['sine','triangle','sawtooth','square','noise'];
 const names=['Синус','Треугольник','Пила','Квадрат','Белый шум'];
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
 function mount(root,api){
  const panel=root.querySelector('[data-performance-panel]'),inputs=[];
  function knob(spec,voice){
   const label=document.createElement('label');label.className='knob-control';
   const name=document.createElement('span');name.className='knob-name';name.textContent=spec.name;
   const surface=document.createElement('span');surface.className='knob-surface';
   const dial=document.createElement('span');dial.className='knob-dial';dial.setAttribute('aria-hidden','true');dial.append(document.createElement('i'));
   const input=document.createElement('input');input.type='range';input.min=spec.min;input.max=spec.max;input.step=spec.step;input.dataset.knob='';input.dataset.performanceKey=spec.key;input.setAttribute('aria-label',spec.name);if(spec.log)input.dataset.knobScale='log';
   const output=document.createElement('output');surface.append(dial,input);label.append(name,surface,output);
   input.addEventListener('pointerdown',api.remember);input.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))api.remember();});
   input.addEventListener('input',()=>{const value=Number(input.value);api.change(spec.key,voice&&spec.key==='wave'?waves[value]:value,voice);render();});
   inputs.push({input,output,spec,voice});return label;
  }
  panel.querySelector('[data-voice-knobs]').replaceChildren(...voiceControls.map(spec=>knob(spec,true)));
  panel.querySelector('[data-effect-knobs]').replaceChildren(...effects.map(spec=>knob(spec,false)));
  for(const button of panel.querySelectorAll('[data-performance-voice]'))button.addEventListener('click',()=>{api.selectVoice(Number(button.dataset.performanceVoice));render();});
  function render(){
   const patch=api.get();
   for(const button of panel.querySelectorAll('[data-performance-voice]'))button.setAttribute('aria-pressed',String(Number(button.dataset.performanceVoice)===patch.selectedVoice));
   for(const {input,output,spec,voice} of inputs){
    let value=voice?patch.voices[patch.selectedVoice][spec.key]:patch[spec.key];if(spec.key==='wave')value=waves.indexOf(value);
    input.value=value;
    const text=spec.format?spec.format(value):spec.time?value<1?Math.round(value*1000)+' мс':value.toFixed(1)+' с':Math.round(value*100)+'%';
    output.textContent=text;input.setAttribute('aria-valuetext',text);window.SynthKnobs.update(input);
   }
  }
  window.SynthKnobs.init(panel);render();return {render};
 }
 window.PerformanceControls={mount};
})();

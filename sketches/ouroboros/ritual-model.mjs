export const CHANNEL_NAMES=['Бас','Напев','Барабаны'];
export const CREATURES=Object.freeze([
  {id:'bass-a',channel:0,part:0,name:'Корень',kind:'Тяжёлый земляной змей',rune:'ᛟ'},
  {id:'bass-b',channel:0,part:1,name:'Камень',kind:'Тёмный морской змей',rune:'ᛉ'},
  {id:'melody-a',channel:1,part:0,name:'Ветер',kind:'Тонкий гребенчатый змей',rune:'ᚨ'},
  {id:'melody-b',channel:1,part:1,name:'Нить',kind:'Рогатый змей напева',rune:'ᛇ'},
  {id:'drums-a',channel:2,part:0,name:'Кость',kind:'Панцирный змей',rune:'ᛏ'},
  {id:'drums-b',channel:2,part:1,name:'Кремень',kind:'Пластинчатый змей',rune:'ᚲ'}
]);
export const PHRASE_BEATS=[8,8];
export function phraseAt(phase,lengths=PHRASE_BEATS){
  const total=lengths.reduce((a,b)=>a+b,0),beat=((phase%1+1)%1)*total;
  let edge=0;for(let i=0;i<lengths.length;i++){edge+=lengths[i];if(beat<edge)return i;}return lengths.length-1;
}
export function resolveTarget(scope,selected='bass-a'){
  const creature=CREATURES.find(c=>c.id===selected)||CREATURES[0];
  return CREATURES.filter(c=>scope==='all'||(scope==='ring'?c.channel===creature.channel:c.id===creature.id)).map(c=>c.id);
}

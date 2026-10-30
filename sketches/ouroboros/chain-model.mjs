// Rings are growable chains of snake-phrases. A name summons one snake;
// the same name again adds another copy that starts with the same phrase
// and is edited separately afterwards. Each snake is one 8-beat phrase.
export const CELLS=8,MAX_SNAKES=4,PIPE=1,BASS=0,DRUMS=2;
export const RING_NAMES=['Бас','Волынка','Барабаны'];
export const SPECIES=Object.freeze([
  {id:'bass-a',channel:0,name:'Корень',kind:'Тяжёлый земляной змей',cells:['x','-','-','-','x','-','-','·']},
  {id:'bass-b',channel:0,name:'Камень',kind:'Тёмный морской змей',cells:['x','·','·','x','x','-','·','x']},
  {id:'melody-a',channel:1,name:'Ветер',kind:'Тонкий гребенчатый змей',cells:['1','2','3','4','3','2','1','-']},
  {id:'melody-b',channel:1,name:'Нить',kind:'Рогатый змей напева',cells:['5','4','3','-','2','1','·','1']},
  {id:'drums-a',channel:2,name:'Кость',kind:'Панцирный змей',cells:['1','3','2','3','1','3','2','3']},
  {id:'drums-b',channel:2,name:'Кремень',kind:'Пластинчатый змей',cells:['1','·','2','3','1','2','2','3']}
]);
// A mixolydian. Degree 8 is the tonic an octave higher.
export const MODE=[0,2,4,5,7,9,10];
export const ROOTS=[45,69,0];
export const degreePitch=(degree,root)=>root+MODE[(degree-1)%7]+12*Math.floor((degree-1)/7);
export const RUNES=Object.freeze({'1':'ᚠ','2':'ᚢ','3':'ᚦ','4':'ᚨ','5':'ᚱ','6':'ᚲ','7':'ᚷ','8':'ᚹ',x:'ᛟ','·':'·','-':'—'});
export const DRUM_RUNES=Object.freeze({'1':'ᛒ','2':'ᛞ','3':'ᛁ','·':'·'});
export const CYCLES=Object.freeze([['x','1','2','3','4','5','6','7','·','-'],['1','2','3','4','5','6','7','8','·','-'],['1','2','3','·']]);
export const runeFor=(channel,cell)=>(channel===2?DRUM_RUNES:RUNES)[cell]||cell;
export const cellLabel=(channel,cell)=>channel===2?({'1':'низ','2':'рама','3':'сухо','·':'пауза'})[cell]:cell==='x'?'ключ':cell==='·'?'пауза':cell==='-'?'тянуть':cell;
export const normalize=text=>String(text).normalize('NFC').trim().toLocaleLowerCase('ru').replace(/ё/g,'е');
export const findSpecies=name=>SPECIES.find(s=>normalize(s.name)===normalize(name));

export function parseCells(text,channel){
  const tokens=[...String(text).replace(/\s+/g,'')].map(t=>t==='.'||t==='•'?'·':/[–—_]/.test(t)?'-':t==='х'||t==='X'||t==='Х'?'x':t);
  if(!tokens.length||tokens.length>CELLS||!tokens.some(t=>/[0-9x]/.test(t)))return null;
  const allowed=CYCLES[channel];if(tokens.some(t=>!allowed.includes(t)))return null;
  if(tokens[0]==='-')tokens[0]='·';
  while(tokens.length<CELLS)tokens.push('·');
  return tokens;
}
export function nextCell(channel,cell,step=1){const cycle=CYCLES[channel],i=cycle.indexOf(cell);return cycle[((i<0?0:i)+step+cycle.length)%cycle.length];}

// Melodic cells → [beat, midi, durationBeats, velocity].
export function cellNotes(cells,root,velocity=.7){
  const notes=[];
  for(let i=0;i<cells.length;i++){
    const c=cells[i];if(!/^[1-8]$/.test(c))continue;let span=1;
    while(i+span<cells.length&&cells[i+span]==='-')span++;
    notes.push([i,degreePitch(Number(c),root),span,velocity*(i%4===0?1:.9)]);
  }
  return notes;
}
// The degree sounding at a cell, looking back across the phrase if needed.
export function keyDegree(cells,at){for(let k=0;k<cells.length;k++){const c=cells[(at-k+cells.length)%cells.length];if(/^[1-8]$/.test(c))return Number(c);}return 1;}
// Bass takes the key notes of the bagpipe: snake i follows bagpipe snake i mod n.
export function bassNotes(cells,pipeCells){
  const notes=[];
  for(let i=0;i<cells.length;i++){
    const c=cells[i];if(c==='·'||c==='-')continue;let span=1;
    while(i+span<cells.length&&cells[i+span]==='-')span++;
    const degree=c==='x'?(pipeCells?keyDegree(pipeCells,i):1):Number(c);
    notes.push([i,degreePitch(((degree-1)%7)+1,ROOTS[0]),span,i%4===0?.8:.62]);
  }
  return notes;
}

export class Chains {
  constructor(start=[['melody-a']]){this.serial=0;this.rings=[[],[],[]];this.versions=[0,0,0];for(const [id] of start)this.summon(id);}
  find(uid){for(const ring of this.rings){const s=ring.find(s=>s.uid===uid);if(s)return s;}return null;}
  get all(){return this.rings.flat();}
  summon(speciesId){
    const species=SPECIES.find(s=>s.id===speciesId);if(!species)return {ok:false,error:'Нет такой змеи'};
    const ring=this.rings[species.channel];if(ring.length>=MAX_SNAKES)return {ok:false,error:'В кольце уже '+MAX_SNAKES+' змеи'};
    const last=ring.filter(s=>s.id===species.id).pop(),snake={uid:species.id+'#'+(++this.serial),id:species.id,channel:species.channel,name:species.name,kind:species.kind,cells:[...(last?last.cells:species.cells)],born:this.serial};
    ring.push(snake);this.versions[species.channel]++;return {ok:true,snake,created:ring.length===1};
  }
  remove(speciesId){
    const species=SPECIES.find(s=>s.id===speciesId);if(!species)return {ok:false,error:'Нет такой змеи'};
    const ring=this.rings[species.channel],at=ring.map(s=>s.id).lastIndexOf(species.id);
    if(at<0)return {ok:false,error:species.name+' сейчас нет в круге'};
    const [snake]=ring.splice(at,1);this.versions[species.channel]++;return {ok:true,snake,emptied:ring.length===0};
  }
  write(uid,cells){const snake=this.find(uid);if(!snake||!Array.isArray(cells)||cells.length!==CELLS)return false;snake.cells=[...cells];this.versions[snake.channel]++;if(snake.channel===PIPE&&this.rings[BASS].length)this.versions[BASS]++;return true;}
  reset(){const fresh=new Chains();Object.assign(this,fresh);}
}

// One line of text: a snake name, "убрать <имя>", a spell (optionally with
// "кольцо" or "всё"), or a phrase written as degrees for the selected snake.
export function parseCommand(text,{spells=[],channel=-1}={}){
  const raw=normalize(text);if(!raw)return {type:'empty'};
  const removal=raw.match(/^(убрать|убери|прогнать)\s+(.+)$/);
  if(removal){const s=findSpecies(removal[2]);return s?{type:'remove',species:s}:{type:'unknown'};}
  const species=findSpecies(raw);if(species)return {type:'summon',species};
  const scoped=raw.match(/^(кольцо|всё|все|змея)\s+(.+)$/),word=scoped?scoped[2]:raw;
  const spell=spells.find(s=>normalize(s.word)===normalize(word));
  if(spell)return {type:'spell',spell,scope:scoped?({кольцо:'ring',все:'all',всё:'all',змея:'phrase'})[scoped[1]]:null};
  if(channel>=0){const cells=parseCells(text,channel);if(cells)return {type:'write',cells};}
  return {type:'unknown'};
}

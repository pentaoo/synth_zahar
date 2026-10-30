import {silentSpells} from './spell-rack.mjs?v=chains-2';
import {resolveTarget} from './ritual-model.mjs';
export const SPELLS=Object.freeze([
  {word:'Свод',key:'vault',rune:'ᛝ',description:'Длинное тёмное пространство',beats:16},
  {word:'Ярость',key:'rage',rune:'ᚦ',description:'Ломаное насыщение и узкий жар',beats:12},
  {word:'Расщепление',key:'split',rune:'ᛯ',description:'Расходящийся хор задержек',beats:16},
  {word:'Эхо',key:'echo',rune:'ᛖ',description:'Темнеющие повторы через полтакта',beats:16},
  {word:'Туман',key:'fog',rune:'ᛗ',description:'Звук тонет под закрывающимся фильтром',beats:16},
  {word:'Лёд',key:'ice',rune:'ᛇ',description:'Тонкий звенящий верх через настроенный гребень',beats:12},
  {word:'Дрожь',key:'tremble',rune:'ᛃ',description:'Пульсирующее тремоло в темпе',beats:12},
  {word:'Снять',key:'clear',rune:'ᛁ',description:'Плавно завершить воздействия',beats:0}
]);
export const SPELL_WORDS=SPELLS.map(s=>s.word).join(' · ');
export const normalizeWord=word=>String(word).normalize('NFC').trim().toLocaleLowerCase('ru').replace(/ё/g,'е');
export const findSpell=word=>SPELLS.find(s=>normalizeWord(s.word)===normalizeWord(word));
export class SpellBook {
  constructor(){this.effects=[];this.beat=0;this.serial=0;}
  // Explicit targets (snake uids) come from the chains; scope/selected is the older six-phrase form.
  cast(word,{scope='all',selected='bass-a',targets:explicit=null,voice=null}={}){
    const spell=findSpell(word);
    if(!spell)return {ok:false,error:'Неизвестное слово. '+SPELL_WORDS};
    const targets=Array.isArray(explicit)?[...explicit]:resolveTarget(scope,selected);if(explicit&&voice!==null)scope=voice?'all':'phrase';
    if(spell.key==='clear'){
      for(const effect of this.effects)if(effect.targets.some(id=>targets.includes(id))){
        // Split the remaining targets: clearing one phrase never clears its neighbour.
        const keep=effect.targets.filter(id=>!targets.includes(id));
        if(keep.length)this.effects.push({...effect,id:++this.serial,targets:keep});
        effect.targets=effect.targets.filter(id=>targets.includes(id));effect.voice=scope==='all'&&effect.voice;const strength=this.strength(effect);effect.release=this.beat;effect.releaseStrength=strength;
      }
    }else{
      // Renew the affected branches, keep other recipients of the same cast alive.
      for(const effect of this.effects)if(effect.key===spell.key)effect.targets=effect.targets.filter(id=>!targets.includes(id));
      this.effects.push({...spell,id:++this.serial,targets,voice:scope==='all',start:this.beat,end:this.beat+spell.beats,release:null});
    }
    return {ok:true,spell,targets,id:this.serial};
  }
  advance(heardBeats){if(Number.isFinite(heardBeats))this.beat=Math.max(this.beat,heardBeats);this.effects=this.effects.filter(e=>e.targets.length&&this.strength(e)>.0001||e.targets.length&&this.beat<=e.start+.01);}
  strength(e){
    const attack=Math.min(1,Math.max(0,(this.beat-e.start)/.35));
    if(e.release!==null)return (e.releaseStrength??attack)*Math.max(0,1-(this.beat-e.release)/1.5);
    return attack*Math.min(1,Math.max(0,(e.end-this.beat)/2));
  }
  values(id){const out=silentSpells();for(const e of this.effects)if(e.targets.includes(id))out[e.key]=Math.max(out[e.key]||0,this.strength(e));return out;}
  allVoiceValues(){const out=silentSpells();for(const e of this.effects)if(e.voice)out[e.key]=Math.max(out[e.key]||0,this.strength(e));return out;}
  reset(){this.effects=[];this.beat=0;}
}

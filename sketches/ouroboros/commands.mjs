// Every command the line understands, as a list to pick from instead of
// remembering it. Pure: the app renders the groups, tests check them.
import {SPECIES,CYCLES} from './chain-model.mjs?v=chains-2';
import {SPELLS} from './spell-book.mjs?v=chains-2';
const low=s=>String(s).toLowerCase().replace(/ё/g,'е');
const SCOPES=['кольцо','всё'];
// text: what is typed so far; present: names on the field; channel: the open
// ring's channel or -1. Items: {label, value, send} — send runs it at once,
// otherwise value is put into the line to be finished.
export function commandGroups(text='',{present=[],channel=-1}={}){
  const typed=low(text).replace(/^\s+/,''),groups=[];
  const add=(title,items)=>{if(items.length)groups.push({title,items});};
  const match=label=>low(label).startsWith(typed);
  const removal=typed.match(/^(убрать|убери)\s+(.*)$/),scoped=typed.match(/^(кольцо|всё|все|змея)\s+(.*)$/);
  if(removal){
    add('Убрать',present.filter(n=>low(n).startsWith(removal[2])).map(n=>({label:'убрать '+n,value:'убрать '+n,send:true})));
    return groups;
  }
  if(scoped){
    const scope=scoped[1]==='все'?'всё':scoped[1];
    add('Слова',SPELLS.filter(s=>low(s.word).startsWith(scoped[2])).map(s=>({label:scope+' '+s.word,value:scope+' '+s.word,send:true})));
    return groups;
  }
  add('Змеи',SPECIES.map(s=>s.name).filter(match).map(n=>({label:n,value:n,send:true})));
  if(present.length&&(!typed||'убрать '.startsWith(typed)))add('Убрать',present.map(n=>({label:'убрать '+n,value:'убрать '+n,send:true})));
  const scopes=[...SCOPES,...(channel>=0?['змея']:[])].filter(s=>!typed||(s+' ').startsWith(typed));
  add('Слова',[...SPELLS.map(s=>s.word).filter(match).map(w=>({label:w,value:w,send:true})),...scopes.map(s=>({label:s+' …',value:s+' ',send:false}))]);
  if(match('голос'))add('Голос',[{label:'голос',value:'голос',send:true}]);
  if(channel>=0){
    const cycle=CYCLES[channel],signs=[...typed.replace(/\s+/g,'')];
    if(!typed||signs.every(t=>cycle.includes(t==='—'||t==='–'?'-':t)))add('Руны',cycle.map(c=>({label:c==='-'?'—':c,value:c==='-'?'—':c,append:true})));
  }
  return groups;
}

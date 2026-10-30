// Native selection/text editing keeps its own keys. Range sliders can still
// pause the instrument, so changing a value never traps the only play control.
export function shortcut({code,key='',ctrlKey=false,metaKey=false,altKey=false,tag='',type='',dialog=false}){
  if(code==='Escape')return dialog?null:'back';
  if(ctrlKey||metaKey||altKey||dialog)return null;
  const native=tag==='SELECT'||tag==='TEXTAREA'||tag==='INPUT'&&type!=='range';
  if(native)return null;
  if(code==='Space')return tag==='BUTTON'?null:'play';
  if(tag==='INPUT')return null;
  if(code==='KeyI')return 'service';
  if(code==='Minus')return 'smaller';
  if(code==='Equal')return 'larger';
  if(/^[1-4]$/.test(key))return 'part:'+key;
  return null;
}

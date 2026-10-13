/* Selection geometry and shared parameter states, independent of DOM and audio. */
(() => {
  'use strict';
  const rect=(a,b)=>({left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)});
  const contains=(box,p)=>p.x>=box.left&&p.x<=box.right&&p.y>=box.top&&p.y<=box.bottom;
  const intersects=(a,b)=>a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top;
  function polygonIntersects(box,polygon) {
    if(!polygon.length)return false;
    if(polygon.some(p=>contains(box,p)))return true;
    const corners=[{x:box.left,y:box.top},{x:box.right,y:box.top},{x:box.right,y:box.bottom},{x:box.left,y:box.bottom}];
    const inside=p=>{let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;}return result;};
    if(corners.some(inside))return true;
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const crosses=(a,b,c,d)=>intersects(rect(a,b),rect(c,d))&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
    for(let i=0;i<polygon.length;i++)for(let j=0;j<4;j++)if(crosses(polygon[i],polygon[(i+1)%polygon.length],corners[j],corners[(j+1)%4]))return true;
    return false;
  }
  function common(values) {return {value:values[0],mixed:values.some(value=>value!==values[0])};}
  function stepState(items,step) {const count=items.filter(item=>item.steps.includes(step)).length;return !count?'false':count===items.length?'true':'mixed';}
  function toggleStep(items,step) {
    const enable=stepState(items,step)!=='true';
    for(const item of items)item.steps=enable?[...new Set([...item.steps,step])].sort((a,b)=>a-b):item.steps.filter(value=>value!==step);
    return enable;
  }
  const api={rect,contains,intersects,polygonIntersects,common,stepState,toggleStep};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.SelectionTools=api;
})();

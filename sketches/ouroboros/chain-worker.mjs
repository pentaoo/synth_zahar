import {renderRing} from './chain-score.mjs?v=chains-1';
self.onmessage=({data})=>{
  try{
    const ring=renderRing(data.sampleRate,data.channel,data.cells,{pipe:data.pipe,wave:data.wave});
    self.postMessage({id:data.id,...ring},[ring.pcm.buffer]);
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};

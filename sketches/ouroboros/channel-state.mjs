export const CHANNEL_RANGES=Object.freeze({brightness:[180,12000],level:[0,1.5],pan:[-1,1],saturation:[0,1],echo:[0,.5],reverb:[0,.6],punch:[0,1]});
export const channelDefaults=()=>[
  {wave:'triangle',brightness:2300,level:1,pan:-.08,saturation:.04,echo:.055,reverb:.065,punch:.35},
  {wave:'sine',brightness:5200,level:1,pan:.12,saturation:.04,echo:.055,reverb:.065,punch:.35},
  {wave:null,brightness:8000,level:1,pan:0,saturation:.04,echo:.025,reverb:.025,punch:.35}
];
export function channelValue(key,value){const range=CHANNEL_RANGES[key];return range&&Number.isFinite(value)?Math.max(range[0],Math.min(range[1],value)):null;}

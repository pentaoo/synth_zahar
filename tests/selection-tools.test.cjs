'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tools=require('../sketches/landscape/selection-tools.js');
test('marquee geometry works in either direction and intersects partially selected objects',()=>{
 const a={x:80,y:90},b={x:10,y:20};assert.deepEqual(tools.rect(a,b),tools.rect(b,a));
 assert.equal(tools.intersects(tools.rect(a,b),{left:79,top:89,right:100,bottom:120}),true);
 assert.equal(tools.intersects(tools.rect(a,b),{left:81,top:20,right:100,bottom:50}),false);
});
test('sector selection tests its shape, including enclosed rectangles, without selecting the empty inner hole',()=>{
 const points=[[0,0],[10,0],[10,10],[0,10],[0,7],[7,7],[7,3],[0,3]].map(([x,y])=>({x,y}));
 assert.equal(tools.polygonIntersects({left:1,top:4,right:2,bottom:6},points),false);
 assert.equal(tools.polygonIntersects({left:8,top:4,right:9,bottom:6},points),true);
 assert.equal(tools.polygonIntersects({left:6,top:4,right:11,bottom:6},points),true);
 assert.equal(tools.polygonIntersects({left:-5,top:4,right:15,bottom:6},points),true);
});
test('mixed rhythm clicks enable a beat for all, then disable it for all, retaining unrelated beats',()=>{
 const items=[{steps:[0,2,31]},{steps:[1,2]}];assert.equal(tools.stepState(items,0),'mixed');
 tools.toggleStep(items,0);assert.equal(tools.stepState(items,0),'true');assert.deepEqual(items[1].steps,[0,1,2]);
 tools.toggleStep(items,0);assert.equal(tools.stepState(items,0),'false');assert.deepEqual(items[0].steps,[2,31]);assert.deepEqual(items[1].steps,[1,2]);
});
test('common parameters distinguish zero, equal values and mixed values',()=>{
 assert.deepEqual(tools.common([0,0]),{value:0,mixed:false});assert.deepEqual(tools.common([0,.5]),{value:0,mixed:true});
});

const assert=require('node:assert/strict');
const {FocusTimer}=require('./desktop/focus-timer.cjs');
let now=0,completed=[];const timer=new FocusTimer(()=>now,s=>completed.push(s));
timer.command('start',1);now=15000;assert.equal(timer.tick().remaining,45);timer.command('pause');now=60000;assert.equal(timer.tick().remaining,45);timer.command('add');assert.equal(timer.snapshot().remaining,345);timer.command('start');now=405000;timer.tick();assert.equal(completed.length,1);assert.equal(completed[0].seconds,360);assert.equal(completed[0].completed,true);assert.equal(timer.snapshot().paused,false);
const idle=new FocusTimer(()=>now);idle.command('add');assert.equal(idle.command('start').remaining,1800);
const analytics=require('./analytics.js');for(const end of ['2026-03-31','2024-02-29','2026-12-31']){const keys=analytics.keys(end,'year');assert.equal(new Set(keys).size,12);assert.equal(keys.at(-1),end.slice(0,7));}const aggregate=analytics.aggregate({'2026-09-30':{Figma:60,Editor:120}},{},'2026-09-30','week',true);assert.equal(aggregate.total,180);assert.equal(aggregate.apps.Editor,120);
console.log('Focus pause, resume, extra time, completion and analytics boundaries passed.');

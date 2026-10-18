import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dayChanges,dayComplete,daySummary,datedDays,STUDY_DAYS} from '../assets/days.js';
import {renderDayWeek} from '../assets/day-view.js';
import {Store} from '../assets/db.js';
import initSqlJs from '../assets/vendor/sql-wasm.js';

const roadmap=JSON.parse(readFileSync(new URL('../data/roadmap.json',import.meta.url)));
const lessons=JSON.parse(readFileSync(new URL('../data/lessons.json',import.meta.url)));
const apply=(set,week,offset,complete)=>{const change=dayChanges(set,week,offset,complete);for(const key of change.remove)set.delete(key);for(const key of change.add)set.add(key);};

test('core task requires both sessions and optional days do not inflate weekly goals',()=>{
  const done=new Set();apply(done,1,0,true);
  assert.ok(dayComplete(done,1,0));assert.ok(!done.has('w1-core'));
  for(const offset of [1,2,4])apply(done,1,offset,true);
  assert.deepEqual(daySummary(done,1),{done:1,total:4,percent:25});
  apply(done,1,6,true);assert.ok(done.has('w1-core'));assert.ok(done.has('w1-soft'));assert.ok(done.has('w1-review'));
  apply(done,1,3,true);apply(done,1,5,true);
  assert.deepEqual(daySummary(done,1),{done:4,total:4,percent:100});
  assert.equal(roadmap.weeks[0].tasks.filter(t=>done.has(t.id)).length,5);
});
test('old task completions map into days; unchecking one session preserves the other and other weeks',()=>{
  const done=new Set(['w1-core','w1-ai','w1-project','w1-soft','w1-review','w2-core','setup-sdk']);
  assert.deepEqual(daySummary(done,1),{done:4,total:4,percent:100});
  apply(done,1,0,false);
  assert.equal(dayComplete(done,1,0),false);assert.equal(dayComplete(done,1,6),true);
  assert.ok(!done.has('w1-core'));assert.ok(done.has('w1-core-finish'));assert.ok(done.has('w2-core'));assert.ok(done.has('setup-sdk'));
  apply(done,1,0,true);assert.ok(done.has('w1-core'));
  apply(done,1,6,false);assert.ok(dayComplete(done,1,0));assert.ok(!done.has('w1-core'));assert.ok(!done.has('w1-soft'));
});
test('all 52 weeks have seven days, four study sessions, video choices and real PDFs',()=>{
  assert.equal(lessons.weeks.length,52);
  const videos=new Map(lessons.videos.map(v=>[v.id,v]));
  for(const week of lessons.weeks){
    assert.equal(week.days.length,7);assert.deepEqual(week.days.map(d=>d.offset),[0,1,2,3,4,5,6]);
    assert.deepEqual(week.days.filter(d=>!d.optional).map(d=>d.offset),STUDY_DAYS);
    assert.equal(week.days.filter(d=>!d.optional).reduce((n,d)=>n+d.minutes,0),330);
    const pdf=new URL('..'+week.pdf,import.meta.url);assert.ok(existsSync(pdf));
    assert.equal(readFileSync(pdf).subarray(0,5).toString(),'%PDF-');
    for(const day of week.days){
      assert.ok(day.pdfPage>=2&&day.pdfPage<=week.pages);
      assert.ok(day.videoIds.length>=2);assert.equal(new Set(day.videoIds).size,day.videoIds.length);
      for(const id of day.videoIds)assert.match(videos.get(id)?.url||'',/^https:\/\/www.youtube.com\/watch\?v=/);
      assert.ok(day.steps.length>=2);assert.ok(day.goal.length>20);
    }
    assert.ok(week.core.code.length>50);assert.ok(week.ai.explain.length>100);
  }
});
test('day dates follow confirmed start and month/year boundaries',()=>{
  const days=datedDays('2026-10-19',1,lessons.weeks[0].days,'2026-10-22');
  assert.equal(days[0].date,'2026-10-19');assert.equal(days[0].weekday,'понедельник');
  assert.equal(days[6].date,'2026-10-25');assert.equal(days[3].today,true);
  const crossing=datedDays('2026-12-28',1,lessons.weeks[0].days);
  assert.equal(crossing[6].date,'2027-01-03');
});
test('day view presents 7 cards and PDF section links, escapes personal notes and keeps old weekly notes',()=>{
  const html=renderDayWeek({week:roadmap.weeks[0],lesson:{...lessons.weeks[0],videos:lessons.videos},start:'2026-10-19',done:new Set(),note:id=>id==='week-1'?'Старая заметка':'</textarea><script>bad()</script>',schedule:roadmap.weeklySchedule,allTaskIds:roadmap.weeks.flatMap(w=>w.tasks.map(t=>t.id))});
  assert.equal((html.match(/data-day="[0-6]"/g)||[]).length,7);
  assert.equal((html.match(/week-01.pdf#page=/g)||[]).length,7);
  assert.equal((html.match(/class="day-video-option"/g)||[]).length,14);
  assert.ok(html.includes('Старая заметка'));assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));assert.ok(!html.includes('<script>bad()'));
});
test('day changes persist atomically in SQLite and roll back if server saving fails',async()=>{
  const SQL=await initSqlJs({wasmBinary:readFileSync(new URL('../assets/vendor/sql-wasm.wasm',import.meta.url))});
  let saved;const store=new Store(SQL,async bytes=>{saved=bytes;});store.load(readFileSync(new URL('../data/progress.sqlite',import.meta.url)));
  await store.toggle('w1-core',true);await store.saveNote('week-1','Существующая заметка');
  await store.toggleDay(1,0,false);
  const reopened=new Store(SQL,async()=>{});reopened.load(saved);
  assert.ok(!dayComplete(reopened.completed(),1,0));assert.ok(reopened.completed().has('w1-core-finish'));
  assert.equal(reopened.note('week-1'),'Существующая заметка');
  store.persist=async()=>{throw new Error('offline');};
  await assert.rejects(store.toggleDay(1,6,true),/offline/);
  assert.ok(!store.completed().has('w1-soft'));assert.ok(!store.completed().has('w1-review'));
});

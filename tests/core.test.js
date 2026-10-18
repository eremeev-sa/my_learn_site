import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {progress,weekNumber,level,escapeHtml,safeURL,calendarText} from '../assets/core.js';
import {pendingReminder} from '../scripts/remind.js';
const content=JSON.parse(readFileSync(new URL('../data/roadmap.json',import.meta.url)));
test('progress: empty, partial, complete and unrelated completions',()=>{
  assert.deepEqual(progress([],new Set()),{done:0,total:0,percent:0});
  assert.deepEqual(progress(['a','b','c'],new Set(['a','unrelated'])),{done:1,total:3,percent:33});
  assert.deepEqual(progress(['a','b'],new Set(['a','b'])),{done:2,total:2,percent:100});
  assert.equal(level(25),'Уверенный практик');assert.equal(level(100),'Маршрут пройден');
});
test('week calculation handles boundaries, future dates and end of roadmap',()=>{
  assert.equal(weekNumber('2026-10-19','2026-10-18'),1);
  assert.equal(weekNumber('2026-10-19','2026-10-25'),1);
  assert.equal(weekNumber('2026-10-19','2026-10-26'),2);
  assert.equal(weekNumber('2026-10-19','2030-01-01'),52);
});
test('all 52 weeks have unique tasks, valid phases and several actual YouTube links',()=>{
  assert.equal(content.weeks.length,52);
  const ids=content.weeks.flatMap(w=>w.tasks.map(t=>t.id));assert.equal(ids.length,260);assert.equal(new Set(ids).size,260);
  const phases=new Set(content.phases.map(p=>p.id));
  for(const [index,w] of content.weeks.entries()){
    assert.equal(w.number,index+1);assert.equal(w.tasks.length,5);assert.ok(w.deliverable);
    assert.ok(w.tasks.every(t=>phases.has(t.phase)));
    assert.ok(w.videos.length>=3);
    for(const id of w.videos){const v=content.videos.find(v=>v.id===id);assert.match(v.url,/^https:\/\/www.youtube.com\/watch\?v=[a-zA-Z0-9_-]{11}$/);}
  }
  for(const p of content.phases)for(const id of p.resources)assert.ok(content.resources.some(r=>r.id===id));
});
test('HTML escaping and HTTPS URL allowlist',()=>{assert.equal(escapeHtml('<b>"'), '&lt;b&gt;&quot;');assert.equal(safeURL('javascript:alert(1)'),'#');assert.equal(safeURL('https://example.com'),'https://example.com/');});
test('calendar contains four repeating sessions and correct first weekday',()=>{
  const ics=calendarText('2026-10-18',content.weeklySchedule);
  assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,4);
  assert.ok(ics.includes('DTSTART:20261019T220000'));
  assert.ok(ics.includes('DTSTART:20261018T170000'));
  assert.equal((ics.match(/COUNT=52/g)||[]).length,4);
});
test('MAX scheduled reminder respects Moscow timezone, start, end and delay window',()=>{
  const c=JSON.parse(readFileSync(new URL('../data/reminders.json',import.meta.url)));
  assert.equal(pendingReminder(c,new Date('2026-10-19T18:50:00Z')).week,1);
  assert.ok(pendingReminder(c,new Date('2026-10-19T19:10:00Z')));
  assert.equal(pendingReminder(c,new Date('2026-10-19T19:20:00Z')),null);
  assert.equal(pendingReminder(c,new Date('2026-10-12T18:50:00Z')),null);
  assert.equal(pendingReminder(c,new Date('2027-10-25T18:50:00Z')),null);
  assert.ok(pendingReminder(c,new Date('2026-10-20T07:00:00Z'),true));
});

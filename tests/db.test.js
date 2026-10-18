import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import initSqlJs from '../assets/vendor/sql-wasm.js';
import {Store} from '../assets/db.js';
const SQL=await initSqlJs({wasmBinary:readFileSync(new URL('../assets/vendor/sql-wasm.wasm',import.meta.url))});
const seed=readFileSync(new URL('../data/progress.sqlite',import.meta.url));
test('SQLite persists completed tasks, timestamps, notes and settings after reopen',async()=>{
  let bytes;const store=new Store(SQL,async data=>{bytes=data;});store.load(seed);
  await store.toggle('w1-core',true);await store.saveNote('week-1','Разобрался с LINQ');await store.set('theme','dark');
  const reopened=new Store(SQL,async()=>{});reopened.load(bytes);
  assert.ok(reopened.completed().has('w1-core'));assert.ok(reopened.dates()[0]);assert.equal(reopened.note('week-1'),'Разобрался с LINQ');assert.equal(reopened.get('theme'),'dark');
  await reopened.toggle('w1-core',false);assert.equal(reopened.completed().size,0);
});
test('writes are serialized; persistence failure rolls back in-memory state',async()=>{
  const store=new Store(SQL,async()=>{});store.load(seed);
  await Promise.all([store.toggle('a',true),store.toggle('b',true)]);assert.equal(store.completed().size,2);
  store.persist=async()=>{throw new Error('quota');};await assert.rejects(store.toggle('c',true),/quota/);assert.ok(!store.completed().has('c'));assert.equal(store.completed().size,2);
});
test('import replaces state, rejects malformed files and preserves current data on failure',async()=>{
  const store=new Store(SQL,async()=>{});store.load(seed);await store.toggle('a',true);
  const incoming=new Store(SQL,async()=>{});incoming.load(seed);await incoming.toggle('b',true);await incoming.set('selectedWeek',12);
  await store.import(incoming.db.export());assert.deepEqual([...store.completed()],['b']);assert.equal(store.get('selectedWeek'),12);
  await assert.rejects(store.import(new Uint8Array([1,2,3])));assert.ok(store.completed().has('b'));
  incoming.db.run('INSERT OR REPLACE INTO settings VALUES (?,?)',['selectedWeek','999']);
  await assert.rejects(store.import(incoming.db.export()),/Некорректная настройка/);assert.equal(store.get('selectedWeek'),12);
});
test('import copies records without retaining imported triggers',async()=>{
  const store=new Store(SQL,async()=>{});store.load(seed);
  const incoming=new SQL.Database(seed);incoming.run("CREATE TRIGGER injected AFTER INSERT ON progress BEGIN DELETE FROM notes; END;");
  await store.import(incoming.export());assert.equal(store.db.exec("SELECT name FROM sqlite_master WHERE type='trigger'").length,0);
});
test('start-date migration updates an old browser database without erasing progress or notes',async()=>{
  let saved;
  const store=new Store(SQL,async bytes=>{saved=bytes;});store.load(seed);
  await store.set('startDate','2026-10-12');await store.set('selectedWeek',8);
  await store.toggle('w1-core',true);await store.saveNote('week-1','Мои первые заметки');await store.set('favorites',['cs-ru']);
  assert.equal(await store.applyPlanStart('2026-10-19','start-2026-10-19-v1'),true);
  const reopened=new Store(SQL,async()=>{});reopened.load(saved);
  assert.equal(reopened.get('startDate'),'2026-10-19');assert.equal(reopened.get('selectedWeek'),1);
  assert.ok(reopened.completed().has('w1-core'));assert.equal(reopened.note('week-1'),'Мои первые заметки');assert.deepEqual(reopened.get('favorites'),['cs-ru']);
  // Once migrated, an intentional settings edit survives subsequent visits.
  await reopened.set('startDate','2026-11-02');await reopened.set('selectedWeek',4);
  assert.equal(await reopened.applyPlanStart('2026-10-19','start-2026-10-19-v1'),false);
  assert.equal(reopened.get('startDate'),'2026-11-02');assert.equal(reopened.get('selectedWeek'),4);
});
test('start-date migration rolls back all settings if persistent storage fails',async()=>{
  const store=new Store(SQL,async()=>{});store.load(seed);await store.set('startDate','2026-10-12');await store.set('selectedWeek',3);
  store.persist=async()=>{throw new Error('quota');};
  await assert.rejects(store.applyPlanStart('2026-10-19','start-2026-10-19-v1'),/quota/);
  assert.equal(store.get('startDate'),'2026-10-12');assert.equal(store.get('selectedWeek'),3);assert.equal(store.get('planStartVersion',null),null);
});
test('legacy backup imports learning data only and cannot install an account',async()=>{
  const store=new Store(SQL,async()=>{});store.load(seed);store.db.run('DROP TABLE users');
  const incoming=new SQL.Database(new Uint8Array(seed));
  incoming.run('INSERT INTO users VALUES (?,?,?,?,?)',['other-user','0'.repeat(32),'a'.repeat(64),100000,1]);
  incoming.run("INSERT INTO progress VALUES ('w1-core','2026-10-18T00:00:00Z')");
  await store.import(incoming.export());incoming.close();
  assert.ok(store.completed().has('w1-core'));
  assert.equal(store.db.exec("SELECT name FROM sqlite_master WHERE name='users'").length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Miniflare} from 'miniflare';

const ROOT=resolve(import.meta.dirname,'..');
const USER='test-owner',PASSWORD='only-a-synthetic-test-password-2026',SECRET='synthetic-test-session-secret-with-more-than-32-characters';
const CONFIG=JSON.parse(readFileSync(resolve(ROOT,'wrangler.jsonc'),'utf8'));
async function fixture(t,options={}) {
  const dataDir=mkdtempSync(join(tmpdir(),'dev-growth-worker-'));let mf,bindings={OWNER_USERNAME:USER,OWNER_PASSWORD:PASSWORD,SESSION_SECRET:SECRET,...options};
  const start=async()=>{
    mf=new Miniflare({modules:true,modulesRules:[{type:"ESModule",include:["**/*.js"]}],modulesRoot:ROOT,scriptPath:resolve(ROOT,'server/worker.js'),compatibilityDate:CONFIG.compatibility_date,
      bindings,d1Databases:{DB:'dev-growth-local-test'},d1Persist:dataDir,
      assets:{directory:resolve(ROOT,CONFIG.assets.directory),binding:CONFIG.assets.binding,routerConfig:{invoke_user_worker_ahead_of_assets:CONFIG.assets.run_worker_first,has_user_worker:true},assetConfig:{html_handling:CONFIG.assets.html_handling,not_found_handling:'none'}}});
    await mf.ready;
  };
  t.after(async()=>{try{if(mf)await mf.dispose();}finally{rmSync(dataDir,{recursive:true,force:true});}});
  await start();
  const db=()=>mf.getD1Database('DB');
  await(await db()).exec(readFileSync(resolve(ROOT,'migrations/0001_private_profile.sql'),'utf8').split('\n').filter(line=>!line.startsWith('--')).join(' '));
  const request=(path,{method='GET',cookie,body,origin,...rest}={})=>mf.dispatchFetch('https://personal.example'+path,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(['POST','PUT'].includes(method)?{'Content-Type':'application/json',Origin:origin||'https://personal.example'}:{}),...rest.headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const login=async(input={username:USER,password:PASSWORD})=>{
    const response=await request('/api/login',{method:'POST',body:input});
    return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  return {request,login,db,restart:async extra=>{await mf.dispose();bindings={...bindings,...extra};await start();}};
}

test('missing secrets and example values fail closed; assets always pass through the Worker',async t=>{
  assert.equal(CONFIG.assets.run_worker_first,true);assert.equal(CONFIG.assets.html_handling,'none');
  const f=await fixture(t,{OWNER_PASSWORD:''});
  assert.equal((await f.login()).response.status,503);
  assert.equal((await f.request('/')).status,303);
  await f.restart({OWNER_PASSWORD:'replace-with-your-own-password'});assert.equal((await f.login()).response.status,503);
  await f.restart({OWNER_PASSWORD:PASSWORD,SESSION_SECRET:'short'});assert.equal((await f.login()).response.status,503);
});
test('anonymous visitors see login only, including direct index and alternate HTML routes',async t=>{
  const {request}=await fixture(t);
  for(const path of ['/','/index.html','/login.html','/assets/app.js','/assets/auth.js','/data/roadmap.json','/data/progress.sqlite','/runtime/private.sqlite','/data/beginner-guide.md','/data/lessons.json','/data/lessons/week-01.pdf','/data/lessons/week-52.pdf']) {
    const response=await request(path);assert.equal(response.status,303,path);assert.equal(response.headers.get('location'),'/login');
  }
  for(const path of ['/api/state','/api/session','/api/register'])assert.equal((await request(path)).status,401);
  assert.equal((await request('/api/state',{method:'PUT',body:{}})).status,401);
  assert.equal((await request('/login')).status,200);
  assert.match(await(await request('/login')).text(),/Войди в свой профиль/);
  assert.equal((await request('/assets/login.js?v=4')).status,200);
});
test('password verification, CSRF, cookie flags, source restrictions and server-side logout',async t=>{
  const {request,login}=await fixture(t);
  assert.equal((await request('/api/login',{method:'POST',origin:'https://attacker.example',body:{username:USER,password:PASSWORD}})).status,403);
  assert.equal((await request('/api/login',{method:'POST',body:{},headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await login({username:USER,password:'wrong'})).response.status,401);
  assert.equal((await login({username:"' OR 1=1 --",password:PASSWORD})).response.status,401);
  const {response,cookie}=await login();assert.equal(response.status,200);
  const flags=response.headers.get('set-cookie');assert.match(flags,/__Host-devgrowth=/);assert.match(flags,/HttpOnly/);assert.match(flags,/SameSite=Strict/);assert.match(flags,/Secure/);assert.match(flags,/Max-Age=43200/);
  assert.deepEqual(await response.json(),{username:USER});
  assert.equal((await request('/',{cookie})).status,200);
  assert.equal((await request('/data/roadmap.json',{cookie})).status,200);
  const pdf=await request('/data/lessons/week-01.pdf',{cookie});
  assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/application\/pdf/);
  assert.match(pdf.headers.get('cache-control'),/no-store/);
  assert.equal(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0,5)),'%PDF-');
  assert.equal((await request('/data/lessons/week-00.pdf',{cookie})).status,404);
  for(const path of ['/.dev.vars','/server/worker.js','/migrations/0001_private_profile.sql','/README.md','/.git/config','/wrangler.jsonc','/api/register','/assets/%2e%2e%2fserver/worker.js'])assert.equal((await request(path,{cookie})).status,404,path);
  assert.equal((await request('/api/state',{method:'PUT',cookie,origin:'https://attacker.example',body:{}})).status,403);
  assert.match((await request('/api/state',{cookie})).headers.get('cache-control'),/no-store/);
  assert.equal((await request('/api/logout',{method:'POST',cookie,body:{}})).status,200);
  assert.equal((await request('/api/session',{cookie})).status,401);
});
test('D1 state is shared and survives a new Worker instance; malformed and concurrent writes cannot overwrite it',async t=>{
  const f=await fixture(t),a=(await f.login()).cookie,b=(await f.login()).cookie;
  const initial=await(await f.request('/api/state',{cookie:a})).json();
  const state={progress:[['w1-core','2026-10-19T10:00:00Z']],notes:[['week-1','Привет с компьютера','2026-10-19T10:00:00Z']],settings:[['startDate','"2026-10-19"']]};
  // Two real concurrent requests must never both succeed for one revision.
  const simultaneous=await Promise.all([a,b].map(cookie=>f.request('/api/state',{cookie,method:'PUT',body:{revision:initial.revision,state}})));
  assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);
  const saved=await(await f.request('/api/state',{cookie:b})).json();assert.deepEqual(saved.state,state);assert.equal(saved.revision,initial.revision+1);
  for(const invalid of [{...state,owner:[]},{...state,settings:[['selectedWeek','999']]},{...state,notes:[['week-1','note','bad-date']]},{...state,progress:[...state.progress,...state.progress]}])assert.equal((await f.request('/api/state',{cookie:a,method:'PUT',body:{revision:saved.revision,state:invalid}})).status,400);
  const tooLarge={progress:[],settings:[],notes:Array.from({length:100},(_,i)=>['note-'+i,'x'.repeat(16000),'2026-10-19T10:00:00Z'])};
  assert.equal((await f.request('/api/state',{cookie:a,method:'PUT',body:{revision:saved.revision,state:tooLarge}})).status,413);
  await f.restart();
  assert.deepEqual((await(await f.request('/api/state',{cookie:a})).json()).state,state);
  // Reapplying a migration cannot erase progress.
  await(await f.db()).exec(readFileSync(resolve(ROOT,'migrations/0001_private_profile.sql'),'utf8').split('\n').filter(line=>!line.startsWith('--')).join(' '));
  assert.deepEqual((await(await f.request('/api/state',{cookie:a})).json()).state,state);
  assert.ok(!JSON.stringify(saved).includes('SESSION_SECRET'));assert.ok(!JSON.stringify(saved).includes('credential_tag'));
});
test('expired sessions, changed password and rotated secret immediately revoke prior access',async t=>{
  const f=await fixture(t),old=(await f.login()).cookie;
  await(await f.db()).prepare('UPDATE sessions SET expires=0').run();assert.equal((await f.request('/api/session',{cookie:old})).status,401);
  const next=(await f.login()).cookie;
  await f.restart({OWNER_PASSWORD:PASSWORD+'changed'});
  assert.equal((await f.request('/api/session',{cookie:next})).status,401);
  assert.equal((await f.login()).response.status,401);
  const changed=await f.login({username:USER,password:PASSWORD+'changed'});assert.equal(changed.response.status,200);
  await f.restart({SESSION_SECRET:SECRET+'rotated'});assert.equal((await f.request('/api/session',{cookie:changed.cookie})).status,401);
});
test('concurrent password guesses are limited in D1 and cannot reset by restarting the Worker',async t=>{
  const f=await fixture(t);
  const guesses=await Promise.all(Array.from({length:12},()=>f.login({username:USER,password:'incorrect'})));
  assert.equal(guesses.filter(x=>x.response.status===401).length,8);assert.equal(guesses.filter(x=>x.response.status===429).length,4);
  await f.restart();assert.equal((await f.login()).response.status,429);
  await(await f.db()).prepare('UPDATE attempts SET expires=0').run();
  assert.equal((await f.login()).response.status,200);
});

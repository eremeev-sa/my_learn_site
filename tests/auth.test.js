import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/index.js';

const USER='test-owner',PASSWORD='only-a-synthetic-test-password-2026';
async function fixture(t,options={}) {
  const dataDir=mkdtempSync(join(tmpdir(),'dev-growth-auth-'));
  let server,base;
  const start=async extra=>{
    server=createApp({dataDir,username:USER,password:PASSWORD,...options,...extra});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  };
  const stop=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  await start();
  t.after(async()=>{await stop();rmSync(dataDir,{recursive:true,force:true});});
  const request=(path,{method='GET',cookie,body,origin,...rest}={})=>fetch(base+path,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(['POST','PUT'].includes(method)?{'Content-Type':'application/json',Origin:origin||options.origin||base}:{}),...rest.headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const login=async(input={username:USER,password:PASSWORD})=>{
    const response=await request('/api/login',{method:'POST',body:input});
    return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  return {request,login,restart:async extra=>{await stop();await start(extra);}};
}

test('missing private configuration fails closed before listening',()=>{
  assert.throws(()=>createApp({username:USER,password:undefined}),/OWNER_PASSWORD/);
  assert.throws(()=>createApp({username:USER,password:PASSWORD,secure:true,origin:'http://example.com'}),/HTTPS/);
});
test('anonymous visitors see login only; files, APIs and source are guarded',async t=>{
  const {request}=await fixture(t);
  for(const path of ['/','/index.html','/assets/app.js','/data/roadmap.json','/data/progress.sqlite','/runtime/private.sqlite']) {
    const response=await request(path);assert.equal(response.status,303,path);assert.equal(response.headers.get('location'),'/login');
  }
  for(const path of ['/api/state','/api/session','/api/register'])assert.equal((await request(path)).status,401);
  assert.equal((await request('/api/state',{method:'PUT',body:{}})).status,401);
  assert.equal((await request('/login')).status,200);
  assert.equal((await request('/assets/login.js?v=4')).status,200);
  assert.equal((await request('/healthz')).status,200);
});
test('password checks, CSRF protections, cookie flags, no registration, and logout revocation',async t=>{
  const {request,login}=await fixture(t,{secure:true,origin:'https://personal.example'});
  assert.equal((await request('/api/login',{method:'POST',origin:'https://attacker.example',body:{username:USER,password:PASSWORD}})).status,403);
  assert.equal((await request('/api/login',{method:'POST',body:{},headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await login({username:USER,password:'wrong'})).response.status,401);
  assert.equal((await login({username:"' OR 1=1 --",password:PASSWORD})).response.status,401);
  const {response,cookie}=await login();assert.equal(response.status,200);
  const flags=response.headers.get('set-cookie');assert.match(flags,/__Host-devgrowth=/);assert.match(flags,/HttpOnly/);assert.match(flags,/SameSite=Strict/);assert.match(flags,/Secure/);assert.match(flags,/Max-Age=43200/);
  assert.deepEqual(await response.json(),{username:USER});
  assert.equal((await request('/',{cookie})).status,200);
  assert.equal((await request('/data/roadmap.json',{cookie})).status,200);
  for(const path of ['/.env','/server/index.js','/runtime/private.sqlite','/README.md','/.git/config','/assets/../server/index.js','/assets/%2e%2e%2fserver/index.js','/api/register'])assert.equal((await request(path,{cookie})).status,404,path);
  assert.equal((await request('/api/state',{method:'PUT',cookie,origin:'https://attacker.example',body:{}})).status,403);
  const state=await request('/api/state',{cookie});assert.match(state.headers.get('cache-control'),/no-store/);
  assert.equal((await request('/api/logout',{method:'POST',cookie,body:{}})).status,200);
  assert.equal((await request('/api/session',{cookie})).status,401);
  assert.equal((await request('/api/state',{cookie})).status,401);
});
test('server state is shared across devices, persists across restart, and rejects stale or malformed writes',async t=>{
  const f=await fixture(t),a=(await f.login()).cookie,b=(await f.login()).cookie;
  let initial=await (await f.request('/api/state',{cookie:a})).json();
  const state={progress:[['w1-core','2026-10-19T10:00:00Z']],notes:[['week-1','Привет с компьютера','2026-10-19T10:00:00Z']],settings:[['startDate','"2026-10-19"']]};
  const put=await f.request('/api/state',{cookie:a,method:'PUT',body:{revision:initial.revision,state}});assert.equal(put.status,200);
  let saved=await(await f.request('/api/state',{cookie:b})).json();assert.deepEqual(saved.state,state);assert.equal(saved.revision,initial.revision+1);
  assert.equal((await f.request('/api/state',{cookie:b,method:'PUT',body:{revision:initial.revision,state:{progress:[],notes:[],settings:[]}}})).status,409);
  for(const invalid of [{...state,owner:[]},{...state,settings:[['selectedWeek','999']]},{...state,notes:[['week-1','too long'.repeat(3000),'bad-date']]},{...state,progress:[...state.progress,...state.progress]}])assert.equal((await f.request('/api/state',{cookie:a,method:'PUT',body:{revision:saved.revision,state:invalid}})).status,400);
  assert.deepEqual((await(await f.request('/api/state',{cookie:b})).json()).state,state);
  await f.restart();
  assert.equal((await f.request('/api/session',{cookie:a})).status,200);
  assert.deepEqual((await(await f.request('/api/state',{cookie:a})).json()).state,state);
  assert.equal((await f.request('/api/state',{cookie:a})).headers.get('content-type'),'application/json; charset=utf-8');
  assert.ok(!JSON.stringify(saved).includes('verifier'));assert.ok(!JSON.stringify(saved).includes('sessions'));
});
test('session expiration and server-side password change revoke access without removing progress',async t=>{
  let clock=1000000;const f=await fixture(t,{now:()=>clock});
  const {cookie}=await f.login();
  clock+=12*60*60*1000;assert.equal((await f.request('/api/session',{cookie})).status,401);
  const next=(await f.login()).cookie;
  await f.restart({password:PASSWORD+'changed'});
  assert.equal((await f.request('/api/session',{cookie:next})).status,401);
  assert.equal((await f.login()).response.status,401);
  assert.equal((await f.login({username:USER,password:PASSWORD+'changed'})).response.status,200);
});
test('login throttling survives restarts and expires after 15 minutes',async t=>{
  let clock=1000000;const f=await fixture(t,{now:()=>clock});
  for(let i=0;i<8;i++)assert.equal((await f.login({username:USER,password:'incorrect'})).response.status,401);
  assert.equal((await f.login()).response.status,429);
  await f.restart();assert.equal((await f.login()).response.status,429);
  clock+=15*60*1000;
  assert.equal((await f.login()).response.status,200);
});

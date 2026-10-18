import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordHash,verifyPassword,createAccount,createSession,validSession,SESSION_DURATION} from '../assets/auth.js';
import {readFileSync} from 'node:fs';
import initSqlJs from '../assets/vendor/sql-wasm.js';

test('PBKDF2 verifies a matching password and rejects incorrect passwords',async()=>{
  const account={username:'test-user',salt:'00112233445566778899aabbccddeeff',iterations:100000,revision:1};
  account.password_hash=await passwordHash('example-test-password',account.salt,account.iterations);
  assert.equal(account.password_hash.length,64);
  assert.equal(await verifyPassword('example-test-password',account),true);
  assert.equal(await verifyPassword('wrong-password',account),false);
});

test('local session expires and cannot be reused for a different account or credential revision',()=>{
  const account={username:'test-user',revision:1};
  const now=1000000,session=createSession(account,now);
  assert.equal(validSession(JSON.stringify(session),account,now),true);
  assert.equal(validSession(session,account,now+SESSION_DURATION),false);
  assert.equal(validSession(session,{...account,username:'other-user'},now),false);
  assert.equal(validSession(session,{...account,revision:2},now),false);
  assert.equal(validSession('{broken-json',account,now),false);
  assert.equal(validSession({...session,expiresAt:now+SESSION_DURATION+1},account,now),false);
});
test('public seed has no account and local account creation generates a private salted verifier',async()=>{
  const SQL=await initSqlJs({wasmBinary:readFileSync(new URL('../assets/vendor/sql-wasm.wasm',import.meta.url))});
  const seed=new SQL.Database(new Uint8Array(readFileSync(new URL('../data/progress.sqlite',import.meta.url))));
  assert.equal(seed.exec('SELECT COUNT(*) FROM users')[0].values[0][0],0);seed.close();
  const account=await createAccount('example-user','test-password-only');
  assert.match(account.salt,/^[a-f0-9]{32}$/);assert.equal(account.iterations,600000);
  assert.equal('password' in account,false);assert.equal(await verifyPassword('test-password-only',account),true);
  await assert.rejects(createAccount('example-user','short'),/8 до 200/);
});

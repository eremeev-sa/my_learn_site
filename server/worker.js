import {validateState} from './state.js';

const TTL=12*60*60*1000, WINDOW=15*60*1000;
const LIMIT=1500000; // D1 limits each row to 2 MB; leave room for encoding/metadata.
const PUBLIC=new Map([['/login','/login.html'],['/assets/login.js','/assets/login.js'],['/assets/style.css','/assets/style.css'],['/assets/icon.svg','/assets/icon.svg']]);
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const error=(status,message)=>Object.assign(new Error(message),{status});
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}});
const redirect=()=>new Response(null,{status:303,headers:{Location:'/login'}});
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));

function configuration(env) {
  if(typeof env.OWNER_USERNAME!=='string'||!env.OWNER_USERNAME||env.OWNER_USERNAME.length>100||
    typeof env.OWNER_PASSWORD!=='string'||env.OWNER_PASSWORD.length<12||env.OWNER_PASSWORD.length>200||env.OWNER_PASSWORD.startsWith('replace-')||
    typeof env.SESSION_SECRET!=='string'||env.SESSION_SECRET.length<32||env.SESSION_SECRET.length>200||env.SESSION_SECRET.startsWith('replace-')||!env.DB) {
    throw error(503,'Владелец должен настроить базу и секреты OWNER_PASSWORD и SESSION_SECRET в Cloudflare.');
  }
}

// A single password is held only in Cloudflare Secrets. HMAC uses a separate
// secret; no slow password KDF or password verifier is published to the browser.
async function credentials(env) {
  configuration(env);
  const key=await crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(JSON.stringify([env.OWNER_USERNAME,env.OWNER_PASSWORD])));
  return {key,signature,tag:hex(signature)};
}

async function session(request,env,secure,now) {
  const name=secure?'__Host-devgrowth':'devgrowth';
  const token=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const {tag}=await credentials(env);
  const hash=await digest(token);
  // Read from primary: a logged-out or changed-password session must not revive
  // on a lagging D1 replica. Never cache successful authorization decisions.
  const row=await env.DB.withSession('first-primary').prepare('SELECT expires FROM sessions WHERE token_hash=? AND credential_tag=? AND expires>?').bind(hash,tag,now).first();
  return row?{hash,expires:row.expires}:null;
}

async function input(request) {
  if(Number(request.headers.get('Content-Length'))>LIMIT)throw error(413,'Учебные данные больше 1,5 МБ. Сократи заметки перед импортом.');
  if(!request.body)throw error(400,'Нужен JSON');
  const reader=request.body.getReader(),chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>LIMIT){await reader.cancel();throw error(413,'Учебные данные больше 1,5 МБ. Сократи заметки перед импортом.');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw error(400,'Некорректный JSON');}
}

async function handle(request,env,now) {
  const url=new URL(request.url),path=url.pathname;
  const local=url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  const secure=!local;
  if(url.protocol!=='https:'&&!local)throw error(400,'Открой сайт по HTTPS');
  if(!['GET','HEAD','POST','PUT'].includes(request.method))throw error(405,'Метод не поддерживается');
  if(['POST','PUT'].includes(request.method)) {
    if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')throw error(403,'Запрос с другого сайта запрещён');
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))throw error(415,'Нужен application/json');
  }
  const cookie=(token,age)=>`${secure?'__Host-devgrowth':'devgrowth'}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
  if(path==='/healthz'&&request.method==='GET')return json({ok:true});
  if(path==='/api/login'&&request.method==='POST') {
    const auth=await credentials(env);
    const values=await input(request);
    if(!values||typeof values.username!=='string'||typeof values.password!=='string'||values.username.length>100||values.password.length>200)throw error(400,'Укажи логин и пароль');
    // Reserve an attempt atomically BEFORE verification, including concurrent
    // requests on different isolates. A restart cannot reset this limit.
    const reserved=await env.DB.prepare(`INSERT INTO attempts VALUES(1,1,?) ON CONFLICT(id) DO UPDATE SET
      count=CASE WHEN attempts.expires<=? THEN 1 ELSE attempts.count+1 END,
      expires=CASE WHEN attempts.expires<=? THEN excluded.expires ELSE attempts.expires END
      WHERE attempts.expires<=? OR attempts.count<8 RETURNING count`).bind(now+WINDOW,now,now,now).first();
    if(!reserved)return json({error:'Слишком много попыток. Попробуй через 15 минут.'},429,{'Retry-After':'900'});
    const valid=await crypto.subtle.verify('HMAC',auth.key,auth.signature,encoder.encode(JSON.stringify([values.username,values.password])));
    if(!valid)throw error(401,'Неверный логин или пароль');
    const token=hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires<=? OR credential_tag<>?').bind(now,auth.tag),
      env.DB.prepare('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions ORDER BY expires DESC LIMIT -1 OFFSET 19)'),
      env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest(token),auth.tag,now+TTL),
      env.DB.prepare('DELETE FROM attempts WHERE id=1')
    ]);
    return json({username:env.OWNER_USERNAME},200,{'Set-Cookie':cookie(token,TTL/1000)});
  }
  const active=await session(request,env,secure,now);
  if(!active&&!PUBLIC.has(path)) {
    if(path.startsWith('/api/'))throw error(401,'Войди в свой профиль');
    return redirect();
  }
  if(path==='/api/session'&&request.method==='GET')return json({username:env.OWNER_USERNAME,expiresAt:active.expires});
  if(path==='/api/logout'&&request.method==='POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(active.hash).run();
    return json({ok:true},200,{'Set-Cookie':cookie('',0)});
  }
  if(path==='/api/state'&&request.method==='GET') {
    const row=await env.DB.withSession('first-primary').prepare('SELECT revision,body FROM learning WHERE id=1').first();
    if(!row)throw error(503,'Сначала примени миграции базы Cloudflare.');
    return json({revision:row.revision,state:JSON.parse(row.body)});
  }
  if(path==='/api/state'&&request.method==='PUT') {
    const values=await input(request);
    if(!values||!Number.isSafeInteger(values.revision)||values.revision<0)throw error(400,'Некорректная версия');
    try{validateState(values.state);}catch{throw error(400,'Некорректная база. Изменения не сохранены.');}
    const saved=await env.DB.prepare('UPDATE learning SET body=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING revision').bind(JSON.stringify(values.state),values.revision).first();
    if(!saved)throw error(409,'Прогресс изменён на другом устройстве. Обнови страницу перед продолжением.');
    return json({revision:saved.revision});
  }
  if(path.startsWith('/api/'))throw error(404,'Не найдено');
  if(!['GET','HEAD'].includes(request.method))throw error(405,'Метод не поддерживается');
  if(path==='/login'&&active)return new Response(null,{status:303,headers:{Location:'/'}});
  // Deliberately omit /login.html as an anonymous alias. Every alternate asset
  // route passes through this allowlist, including /index.html and downloads.
  let file=PUBLIC.get(path);
  if(!file&&(path==='/'||path==='/index.html'))file='/index.html';
  if(!file&&/^\/assets\/(?:[a-zA-Z0-9_-]+\.(?:js|css|svg)|vendor\/(?:sql-wasm\.js|sql-wasm\.wasm|SQLJS-LICENSE\.txt))$/.test(path))file=path;
  if(!file&&/^\/data\/(?:roadmap\.json|guide\.json|beginner-guide\.md|progress\.sqlite)$/.test(path))file=path;
  if(!file)throw error(404,'Не найдено');
  const assetURL=new URL(file,url); // Drop user query parameters on internal asset lookup.
  return env.ASSETS.fetch(new Request(assetURL,{method:request.method}));
}

export default {
  async fetch(request,env) {
    let response;
    try{response=await handle(request,env,Date.now());}
    catch(e){response=json({error:e.status?e.message:'Ошибка сервера. Проверь настройки и миграции базы в Cloudflare.'},e.status||500);}
    const result=new Response(response.body,response);
    result.headers.set('Cache-Control','no-store, private');
    result.headers.set('X-Content-Type-Options','nosniff');
    result.headers.set('X-Frame-Options','DENY');
    result.headers.set('Referrer-Policy','same-origin');
    result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(new URL(request.url).protocol==='https:')result.headers.set('Strict-Transport-Security','max-age=31536000');
    return result;
  }
};

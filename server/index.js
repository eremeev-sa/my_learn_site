import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateState} from './state.js';

const ROOT=resolve(import.meta.dirname,'..');
const TTL=12*60*60*1000, WINDOW=15*60*1000;
const digest=value=>createHash('sha256').update(value).digest('hex');
const hash=(password,salt)=>scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm','.md':'text/markdown; charset=utf-8','.sqlite':'application/vnd.sqlite3'};
const error=(status,message)=>Object.assign(new Error(message),{status});

export function createApp({dataDir=process.env.DATA_DIR||resolve(ROOT,'runtime'),username=process.env.OWNER_USERNAME,password=process.env.OWNER_PASSWORD,origin=process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL,secure=process.env.NODE_ENV==='production',now=Date.now}={}) {
  if (!username || username.length>100 || !password || password.length<12 || password.length>200) throw new Error('Задай OWNER_USERNAME и OWNER_PASSWORD (12–200 символов) в закрытых переменных сервера.');
  if (secure && (!origin || !/^https:\/\/[^/]+$/.test(origin))) throw new Error('В production APP_ORIGIN должен быть точным HTTPS-адресом без завершающего /.');
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  const db=new DatabaseSync(resolve(dataDir,'private.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY CHECK(id=1),username TEXT NOT NULL,salt TEXT NOT NULL,verifier TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS revision(id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL);
    INSERT OR IGNORE INTO revision VALUES(1,0);
    CREATE TABLE IF NOT EXISTS progress(id TEXT PRIMARY KEY,completed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,body TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  const owner=db.prepare('SELECT * FROM owner WHERE id=1').get();
  if (!owner || owner.username!==username || !timingSafeEqual(hash(password,owner.salt),Buffer.from(owner.verifier,'hex'))) {
    const salt=randomBytes(16).toString('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT OR REPLACE INTO owner VALUES(1,?,?,?)').run(username,salt,hash(password,salt).toString('hex'));
      db.exec('DELETE FROM sessions; DELETE FROM attempts; COMMIT');
    } catch(e) {db.exec('ROLLBACK');db.close();throw e;}
  }
  password=null;
  const account=db.prepare('SELECT * FROM owner WHERE id=1').get();
  const cookieName=secure?'__Host-devgrowth':'devgrowth';
  const cookie=(token,age)=>`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
  const session=req=>{
    const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row=db.prepare('SELECT expires FROM sessions WHERE token_hash=? AND expires>?').get(digest(token),now());
    return row?{hash:digest(token),expires:row.expires}:null;
  };
  const respond=(res,status,value,headers={})=>{
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});
    res.end(value===null?'':JSON.stringify(value));
  };
  const body=async req=>{
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)throw error(413,'Запрос больше 8 МБ');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw error(400,'Некорректный JSON');}
  };
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store, private');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      // Never trust Host or arbitrary forwarded IP headers for CSRF or throttling.
      const path=new URL(req.url,'http://localhost').pathname;
      if (!['GET','HEAD','POST','PUT'].includes(req.method)) throw error(405,'Метод не поддерживается');
      if (['POST','PUT'].includes(req.method)) {
        const expected=origin||`http://127.0.0.1:${server.address().port}`;
        if (req.headers.origin!==expected || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site']!=='same-origin')) throw error(403,'Запрос с другого сайта запрещён');
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) throw error(415,'Нужен application/json');
      }
      const active=session(req);
      if (path==='/healthz' && req.method==='GET') return respond(res,200,{ok:true});
      if (path==='/api/login' && req.method==='POST') {
        // A persistent global limit suits a single-owner service and cannot be bypassed by changing IP.
        db.prepare('DELETE FROM attempts WHERE expires<=?').run(now());
        const attempts=db.prepare("SELECT count FROM attempts WHERE bucket='owner'").get()?.count||0;
        if(attempts>=8)return respond(res,429,{error:'Слишком много попыток. Попробуй через 15 минут.'},{'Retry-After':'900'});
        const input=await body(req);
        if(!input || typeof input.username!=='string' || typeof input.password!=='string' || input.username.length>100 || input.password.length>200)throw error(400,'Укажи логин и пароль');
        const matches=timingSafeEqual(hash(input.password,account.salt),Buffer.from(account.verifier,'hex'));
        if(!matches || input.username!==account.username){
          db.prepare("INSERT INTO attempts VALUES('owner',1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1").run(now()+WINDOW);
          throw error(401,'Неверный логин или пароль');
        }
        db.exec("DELETE FROM attempts WHERE bucket='owner'");
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(now());
        // Keep at most 20 active devices/sessions.
        db.exec('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions ORDER BY expires DESC LIMIT -1 OFFSET 19)');
        const token=randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES(?,?)').run(digest(token),now()+TTL);
        return respond(res,200,{username:account.username},{'Set-Cookie':cookie(token,TTL/1000)});
      }
      const publicFiles=new Map([['/login','login.html'],['/assets/login.js','assets/login.js'],['/assets/style.css','assets/style.css'],['/assets/icon.svg','assets/icon.svg']]);
      if (!active && !publicFiles.has(path)) {
        if(path.startsWith('/api/'))throw error(401,'Войди в свой профиль');
        res.writeHead(303,{Location:'/login'});return res.end();
      }
      if (path==='/api/session' && req.method==='GET') return respond(res,200,{username:account.username,expiresAt:active.expires});
      if (path==='/api/logout' && req.method==='POST') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(active.hash);
        return respond(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
      }
      if (path==='/api/state' && req.method==='GET') {
        const rows=table=>db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().map(row=>Object.values(row));
        return respond(res,200,{revision:db.prepare('SELECT value FROM revision').get().value,state:{progress:rows('progress'),notes:rows('notes'),settings:rows('settings')}});
      }
      if (path==='/api/state' && req.method==='PUT') {
        const input=await body(req);
        if(!input || !Number.isSafeInteger(input.revision))throw error(400,'Некорректная версия');
        try{validateState(input.state);}catch{throw error(400,'Некорректная база. Изменения не сохранены.');}
        db.exec('BEGIN IMMEDIATE');
        try {
          const current=db.prepare('SELECT value FROM revision').get().value;
          if(current!==input.revision)throw error(409,'Прогресс изменён на другом устройстве. Обнови страницу перед продолжением.');
          db.exec('DELETE FROM progress; DELETE FROM notes; DELETE FROM settings');
          for(const table of ['progress','notes','settings']) {
            const insert=db.prepare(`INSERT INTO ${table} VALUES(${table==='notes'?'?,?,?':'?,?'})`);
            for(const row of input.state[table])insert.run(...row);
          }
          db.prepare('UPDATE revision SET value=value+1 WHERE id=1').run();db.exec('COMMIT');
          return respond(res,200,{revision:current+1});
        }catch(e){db.exec('ROLLBACK');throw e;}
      }
      if(path.startsWith('/api/'))throw error(404,'Не найдено');
      if(!['GET','HEAD'].includes(req.method))throw error(405,'Метод не поддерживается');
      if(path==='/login' && active){res.writeHead(303,{Location:'/'});return res.end();}
      // Strict static allowlist: never serve source, .env, runtime database, or Git files.
      let file=publicFiles.get(path);
      if(!file && (path==='/'||path==='/index.html'))file='index.html';
      if(!file && /^\/assets\/(?:[a-zA-Z0-9_-]+\.(?:js|css|svg)|vendor\/(?:sql-wasm\.js|sql-wasm\.wasm|LICENSE))$/.test(path))file=path.slice(1);
      if(!file && /^\/data\/(?:roadmap\.json|guide\.json|beginner-guide\.md|progress\.sqlite)$/.test(path))file=path.slice(1);
      if(!file || !existsSync(resolve(ROOT,file)) || !statSync(resolve(ROOT,file)).isFile())throw error(404,'Не найдено');
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'text/plain; charset=utf-8'});
      res.end(req.method==='HEAD'?undefined:readFileSync(resolve(ROOT,file)));
    } catch(e) {
      if(!res.headersSent)respond(res,e.status||500,{error:e.status?e.message:'Ошибка сервера. Попробуй ещё раз.'});else res.end();
      if(!e.status)console.error('Request failed:',e.code||e.name);
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.on('close',()=>db.close());
  return server;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createApp();
  server.listen(Number(process.env.PORT||8080),process.env.HOST||'0.0.0.0',()=>console.log('Dev Growth server is ready'));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}

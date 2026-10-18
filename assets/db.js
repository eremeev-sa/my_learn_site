import {dayChanges} from './days.js';

export function validateSetting(key,value){
  const valid={
    startDate:v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='2020-01-01'&&v<='2100-12-31'&&!isNaN(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().startsWith(v),
    selectedWeek:v=>Number.isInteger(v)&&v>=1&&v<=52,
    theme:v=>['light','dark'].includes(v),
    planStartVersion:v=>typeof v==='string'&&v.length<=100,
    onboardingDone:v=>typeof v==='boolean',
    weeklyHours:v=>typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=40,
    favorites:v=>Array.isArray(v)&&v.length<=1000&&v.every(id=>typeof id==='string'&&id.length<100),
    schedule:v=>Array.isArray(v)&&v.length===7&&v.every(s=>s&&['day','time','activity','kind'].every(k=>typeof s[k]==='string'&&s[k].length<=1000)&&(!/^\d/.test(s.time)||/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(s.time)&&s.time.slice(0,5)<s.time.slice(6)))
  };
  if(valid[key]&&!valid[key](value))throw new Error('Некорректная настройка: '+key);
}
export class Store {
  constructor(SQL, persist) { this.SQL=SQL; this.persist=persist; this.queue=Promise.resolve(); }
  load(bytes) { this.db=new this.SQL.Database(new Uint8Array(bytes)); this.validate(this.db); }
  validate(db) {
    if (db.exec('PRAGMA integrity_check')[0]?.values[0][0] !== 'ok') throw new Error('База повреждена');
    if (db.exec("SELECT version FROM app_meta WHERE app='dev-growth'")[0]?.values[0][0] !== 1) throw new Error('Это не база Dev Growth версии 1');
    db.exec('SELECT id, completed_at FROM progress; SELECT id, body FROM notes; SELECT key, value FROM settings;');
    for (const [key,value] of db.exec('SELECT key,value FROM settings')[0]?.values || []) validateSetting(key,JSON.parse(value));
    for (const [id,body] of db.exec('SELECT id,body FROM notes')[0]?.values || []) if(typeof id!=='string'||typeof body!=='string'||body.length>20000)throw new Error('Некорректные заметки');
    for (const [id,date] of db.exec('SELECT id,completed_at FROM progress')[0]?.values || []) if(typeof id!=='string'||typeof date!=='string'||isNaN(Date.parse(date)))throw new Error('Некорректный прогресс');
  }
  get(key, fallback) { const result=this.db.exec('SELECT value FROM settings WHERE key = ?', [key]); return result.length ? JSON.parse(result[0].values[0][0]) : fallback; }
  completed() { return new Set((this.db.exec('SELECT id FROM progress')[0]?.values || []).map(row=>row[0])); }
  note(id) { return this.db.exec('SELECT body FROM notes WHERE id = ?', [id])[0]?.values[0][0] || ''; }
  dates() { return (this.db.exec('SELECT completed_at FROM progress')[0]?.values || []).map(row=>row[0]); }
  mutate(action) {
    const operation=this.queue.then(async()=>{
      const before=this.db.export();
      try { action(); await this.persist(this.db.export()); }
      catch(error) { this.db.close(); this.db=new this.SQL.Database(before); throw error; }
    });
    this.queue=operation.catch(()=>{}); return operation;
  }
  set(key,value) { validateSetting(key,value);return this.mutate(()=>this.db.run('INSERT OR REPLACE INTO settings VALUES (?,?)',[key,JSON.stringify(value)])); }
  applyPlanStart(date,version) {
    validateSetting('startDate',date);validateSetting('planStartVersion',version);
    if(this.get('planStartVersion',null)===version)return Promise.resolve(false);
    return this.mutate(()=>{
      this.db.run('BEGIN');
      for(const [key,value] of [['startDate',date],['selectedWeek',1],['planStartVersion',version]])this.db.run('INSERT OR REPLACE INTO settings VALUES (?,?)',[key,JSON.stringify(value)]);
      this.db.run('COMMIT');
    }).then(()=>true);
  }
  toggle(id, done) { return this.mutate(()=>done ? this.db.run('INSERT OR REPLACE INTO progress VALUES (?,?)',[id,new Date().toISOString()]) : this.db.run('DELETE FROM progress WHERE id = ?',[id])); }
  toggleDay(week,offset,complete) {
    return this.mutate(()=>{
      const changes=dayChanges(this.completed(),week,offset,complete);
      this.db.run('BEGIN');
      for(const key of changes.add)this.db.run('INSERT OR REPLACE INTO progress VALUES (?,?)',[key,new Date().toISOString()]);
      for(const key of changes.remove)this.db.run('DELETE FROM progress WHERE id=?',[key]);
      this.db.run('COMMIT');
    });
  }
  saveNote(id,body) { return this.mutate(()=>this.db.run('INSERT OR REPLACE INTO notes VALUES (?,?,?)',[id,body,new Date().toISOString()])); }
  async import(bytes) {
    const candidate=new this.SQL.Database(new Uint8Array(bytes));
    try {
      this.validate(candidate);
      const state={progress:candidate.exec('SELECT id, completed_at FROM progress')[0]?.values || [],notes:candidate.exec('SELECT id, body, updated_at FROM notes')[0]?.values || [],settings:candidate.exec('SELECT key, value FROM settings')[0]?.values || []};
      // Copy only known data into the existing schema. Never retain imported triggers or views.
      await this.mutate(()=>{
        this.db.run('BEGIN');
        this.db.run('DELETE FROM progress; DELETE FROM notes; DELETE FROM settings;');
        for(const row of state.progress) this.db.run('INSERT INTO progress VALUES (?,?)',row);
        for(const row of state.notes) this.db.run('INSERT INTO notes VALUES (?,?,?)',row);
        for(const row of state.settings) this.db.run('INSERT INTO settings VALUES (?,?)',row);
        this.db.run('COMMIT');
      });
    } finally { candidate.close(); }
  }
}

// Session cookies are issued and verified by the server, never by browser storage.
export async function api(path,options={}) {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  const result=await response.json();
  if(response.status===401){location.replace('/login');throw new Error('Войди снова');}
  if(!response.ok)throw new Error(result.error||'Не удалось связаться с сервером');
  return result;
}

export async function serverStorage(SQL) {
  let revision;
  const stateOf=db=>Object.fromEntries(['progress','notes','settings'].map(table=>[table,db.exec('SELECT * FROM '+table)[0]?.values||[]]));
  return {
    async read(){
      const result=await api('/api/state');revision=result.revision;
      const response=await fetch('/data/progress.sqlite',{cache:'no-store'});
      if(!response.ok)throw new Error('Не удалось открыть SQLite');
      const db=new SQL.Database(new Uint8Array(await response.arrayBuffer()));
      try{
        db.run('DELETE FROM progress; DELETE FROM notes; DELETE FROM settings; DROP TABLE IF EXISTS users;');
        for(const table of ['progress','notes','settings'])for(const row of result.state[table])db.run(`INSERT INTO ${table} VALUES(${table==='notes'?'?,?,?':'?,?'})`,row);
        return db.export();
      }finally{db.close();}
    },
    async write(bytes){
      const db=new SQL.Database(new Uint8Array(bytes));
      try{
        const result=await api('/api/state',{method:'PUT',body:JSON.stringify({revision,state:stateOf(db)})});
        revision=result.revision;
      }finally{db.close();}
    }
  };
}

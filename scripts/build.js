import {execFileSync} from 'node:child_process';
import {readdirSync,existsSync,cpSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
for(const folder of ['server','assets'])for(const file of readdirSync(resolve(root,folder)))if(file.endsWith('.js'))execFileSync(process.execPath,['--check',resolve(root,folder,file)]);
for(const file of ['index.html','login.html','data/progress.sqlite','assets/vendor/sql-wasm.wasm'])if(!existsSync(resolve(root,file)))throw new Error('Missing '+file);
JSON.parse(readFileSync(resolve(root,'data/tools.json'),'utf8'));
const lessons=JSON.parse(readFileSync(resolve(root,'data/lessons.json'),'utf8'));
if(lessons.weeks.length!==52)throw new Error('Expected 52 authored lesson manuals');
for(const week of lessons.weeks){
  if(!/^\/data\/lessons\/week-(?:0[1-9]|[1-4][0-9]|5[0-2])\.pdf$/.test(week.pdf))throw new Error('Invalid PDF path');
  if(readFileSync(resolve(root,'.'+week.pdf)).subarray(0,5).toString()!=='%PDF-')throw new Error('Missing PDF '+week.number);
}
const config=JSON.parse(readFileSync(resolve(root,'wrangler.jsonc'),'utf8'));
if(config.assets?.run_worker_first!==true||config.assets?.html_handling!=='none')throw new Error('All assets must pass server authorization first');
rmSync(resolve(root,'dist'),{recursive:true,force:true});mkdirSync(resolve(root,'dist'));
for(const file of ['index.html','login.html','assets','data'])cpSync(resolve(root,file),resolve(root,'dist',file),{recursive:true});
console.log('Cloudflare assets prepared in dist/. Deploy the Worker too: static hosting alone does not protect access.');

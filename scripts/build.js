import {execFileSync} from 'node:child_process';
import {readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
for(const folder of ['server','assets'])for(const file of readdirSync(resolve(root,folder)))if(file.endsWith('.js'))execFileSync(process.execPath,['--check',resolve(root,folder,file)]);
for(const file of ['index.html','login.html','data/progress.sqlite','assets/vendor/sql-wasm.wasm'])if(!existsSync(resolve(root,file)))throw new Error('Missing '+file);
console.log('Server and frontend validated. Start with npm start; static hosting is not supported.');

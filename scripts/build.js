import {cpSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
rmSync(resolve(root,'dist'),{recursive:true,force:true});
mkdirSync(resolve(root,'dist'));
for(const path of ['index.html','assets','data'])cpSync(resolve(root,path),resolve(root,'dist',path),{recursive:true});
console.log('Статический сайт готов в dist/');

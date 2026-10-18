import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DATA} from './config.js';
const run=promisify(execFile);
export async function importMigration(req,store){
 if(process.env.MIGRATION_IMPORT_ENABLED!=='true'||store.list().length)throw Error('Migration import is disabled or the persistent store is already populated');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wintech-migration-')),archive=path.join(dir,'state.tgz');let bytes=0;
 try{
  await pipeline(req,new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;callback(bytes>1024*1024*1024?Error('Migration exceeds 1GB'):null,chunk);}}),fs.createWriteStream(archive,{mode:0o600}));
  const {stdout}=await run('tar',['-tzf',archive],{maxBuffer:16*1024*1024,timeout:30000});
  const names=stdout.trim().split('\n').map(n=>n.replace(/^\.\//,''));
  if(!names.includes('studio.sqlite')||names.some(n=>n.includes('..')||n.startsWith('/')||n.includes('\\')||! /^(studio\.sqlite|previews\/|model-results\/|public-sites\/)/.test(n)))throw Error('Migration archive contains unexpected paths');
  store.db.close();
  await run('tar',['-xzf',archive,'-C',DATA,'--no-same-owner'],{timeout:60000});
  return {ok:true,bytes,restartRequired:true};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}

import fs from 'node:fs';import path from 'node:path';import {DATA} from './config.js';
export function normalizeRetainedAssets(job,site,assets,root=DATA){
 const known=new Map();
 for(const asset of assets){const m=String(asset.src).match(/^\/p\/([a-f0-9]{48})\/assets\/([a-f0-9]{16}\.(?:webp|png|jpg))$/);if(!m)continue;
  const to=path.join(root,'previews',job.token,'assets',m[2]),original=path.join(root,'previews',m[1],'assets',m[2]);
  if(m[1]!==job.token&&!fs.existsSync(to)){let source=original;if(!fs.existsSync(source)){const publicRoot=path.join(root,'public-sites');source=fs.existsSync(publicRoot)?fs.readdirSync(publicRoot).map(n=>path.join(publicRoot,n,'assets',m[2])).find(p=>fs.existsSync(p)):null;}if(!source)throw Error('Retained asset is unavailable: '+m[2]);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(source,to);}
  asset.src='/p/'+job.token+'/assets/'+m[2];known.set(m[2],asset.src);
 }
 const rewrite=text=>String(text||'').replace(/\/p\/[a-f0-9]{48}\/assets\/([a-f0-9]{16}\.(?:webp|png|jpg))/g,(src,name)=>known.get(name)||src);
 site.css=rewrite(site.css);for(const page of site.pages)page.body=rewrite(page.body);
}

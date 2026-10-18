import fs from 'node:fs';import path from 'node:path';
import {DATA} from './config.js';
import {renderSite} from './render-site.js';
import {scanSite} from './checks.js';
export async function verifySavedDraft(store,job){
 const started=Date.now(),before=store.budget(job.id).accounted,dir=path.join(DATA,'previews',job.token);
 const names=fs.readdirSync(dir).filter(n=>/^candidate-\d+\.json$/.test(n)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]));
 const candidates=[...new Set([...names,'candidate-free-verified.json',job.repairCandidate].filter(n=>n&&/^candidate-[a-z0-9-]+\.json$/.test(n)&&fs.existsSync(path.join(dir,n))))];
 const selected=candidates.sort((a,b)=>fs.statSync(path.join(dir,b)).mtimeMs-fs.statSync(path.join(dir,a)).mtimeMs)[0];if(!selected)throw Error('No saved candidate');
 const site=JSON.parse(fs.readFileSync(path.join(dir,selected),'utf8'));
 site.responsiveFoundation=true;let rendered=renderSite(job,site,job.assets),scan=await scanSite(job,rendered);
 const groups=new Map();for(const check of scan.browser?.checks||[])for(const item of check.metrics?.contrast||[]){if(!item.selector||!item.correctedColor)continue;const key=check.page+'|'+item.selector,g=groups.get(key)||{page:check.page,selector:item.selector,colors:new Set()};g.colors.add(item.correctedColor);groups.set(key,g);}
 site.contrastCorrections=[...(site.contrastCorrections||[]),...[...groups.values()].filter(g=>g.colors.size===1).map(g=>({page:g.page,selector:g.selector,color:[...g.colors][0]}))];
 site.fontSizeCorrections=[...(site.fontSizeCorrections||[]),...[...new Map((scan.browser?.checks||[]).flatMap(c=>(c.metrics?.smallTextDetails||[]).filter(f=>f.selector).map(f=>[c.page+'|'+f.selector,{page:c.page,...f}]))).values()]];
 site.readingGutterCorrections=[...(site.readingGutterCorrections||[]),...[...new Map((scan.browser?.checks||[]).flatMap(c=>(c.metrics?.textGutters||[]).filter(f=>f.selector).map(f=>[c.page+'|'+f.selector,{page:c.page,...f}]))).values()]];
 if(scan.issues.length){rendered=renderSite(job,site,job.assets);scan=await scanSite(job,rendered);}
 fs.writeFileSync(path.join(dir,'candidate-free-verified.json'),JSON.stringify(site));job.repairCandidate='candidate-free-verified.json';job.latestScan=scan;job.freeVerification={at:new Date().toISOString(),durationMs:Date.now()-started,issues:scan.issues,paidCalls:0,views:scan.browser?.checks?.length||0};
 if(store.budget(job.id).accounted!==before)throw Error('Cost ledger changed during free verification');store.save(job);return job.freeVerification;
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT,DATA,PREVIEW_ORIGIN} from './config.js';
import {CONTENT_CONTRACT_VERSION} from './content-contract.js';
const run=promisify(execFile);
export const PREVIEW_CONTROLS="document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();let message=form.querySelector('[role=\"status\"]');if(!message){message=document.createElement('p');message.setAttribute('role','status');form.appendChild(message);}message.textContent='Preview only. No information was sent or stored. Please use the original company website to get in touch.';}));";
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').replace(/\s+/g,' ').toLowerCase();
export function publicOrigin(value=process.env.PUBLIC_SITE_ORIGIN){const u=new URL(value||PREVIEW_ORIGIN);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('PUBLIC_SITE_ORIGIN must be an origin without a path or credentials');return u.origin;}
export function verifiedLocation(job){
 const p=job.profile||{};if(p.location?.city&&p.location?.state)return {city:p.location.city,state:p.location.state};
 for(const f of p.facts||[]){const match=String(f.text).match(/(?:based|located|headquartered)\s+(?:in|at)\s+([^,.]+),\s*([A-Za-z ]+?)(?:[.;]|$)/i);if(match&&norm(f.quote).includes(norm(match[1]))&&norm(f.quote).includes(norm(match[2])))return {city:match[1].trim(),state:match[2].trim()};}
 return {city:'',state:''};
}
export function catalogRows(store,origin=publicOrigin(),previous=[]){return store.list().map(job=>{const slug=store.publicSlug(job.id),old=previous.find(r=>r.slug===slug);return {slug,partner:job.profile?.name||new URL(job.url).hostname, ...verifiedLocation(job),currentUrl:job.profile?.sourceUrl||job.url,newUrl:origin+'/ws/'+slug,status:['published','draft'].includes(old?.status)?old.status:'preparing'};}).sort((a,b)=>a.partner.localeCompare(b.partner));}
const csp="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; script-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'";
const head=(title)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="Content-Security-Policy" content="${escape(csp)}"><title>${escape(title)}</title><style>body{margin:0;background:#f5f6f8;color:#172136;font:16px/1.6 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:48px 24px}h1{font-size:clamp(30px,4vw,48px);letter-spacing:-.04em;line-height:1.1;margin:10px 0 18px}a{color:#174d9b;text-underline-offset:3px}input{font:inherit;padding:12px 16px;border:1px solid #b9c2d1;border-radius:8px;min-width:260px}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;padding:18px 20px;border-bottom:1px solid #dee3eb;vertical-align:top}th{font-size:13px;text-transform:uppercase;letter-spacing:.04em;background:#e9eef5}small{display:block;color:#526177}.table-wrap{overflow:auto;border:1px solid #dee3eb;border-radius:12px;margin-top:24px}.label{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#526177}a:focus-visible,input:focus-visible{outline:3px solid #c65f21;outline-offset:3px}</style></head><body>`;
export function directoryHTML(rows){return head('Partner website previews | WinTech Partners')+`<main><p class="label">WinTech Partners · Website Studio</p><h1>Partner website previews</h1><p>${rows.length} partners. Current websites and proposed redesigns.</p><label for="filter">Find a partner, city or state</label><br><input id="filter" type="search" placeholder="Search partners" autocomplete="off"><div class="table-wrap"><table><thead><tr><th scope="col">Partner</th><th scope="col">City</th><th scope="col">State</th><th scope="col">Current URL</th><th scope="col">New URL</th></tr></thead><tbody>${rows.map(r=>`<tr data-partner-row><th scope="row">${escape(r.partner)}</th><td>${escape(r.city||'—')}</td><td>${escape(r.state||'—')}</td><td><a href="${escape(r.currentUrl)}" target="_blank" rel="noopener noreferrer">${escape(r.currentUrl)}</a></td><td><a href="${escape(r.newUrl)}">${escape(r.newUrl)}</a>${r.status==='published'?'':r.status==='draft'?'<small>Concept preview</small>':'<small>Preview being prepared</small>'}</td></tr>`).join('')}</tbody></table></div><p><small>Independent redesign concepts. Location is left blank where source evidence is unavailable.</small></p></main><script src="/ws/assets/list.js" defer></script></body></html>`;}
export const ready=job=>job.contentCoverage?.version===CONTENT_CONTRACT_VERSION&&job.contentCoverage.passed===true&&['ready','provisional'].includes(job.state)&&job.visualReview?.passed===true&&job.claimAudit&&!job.claimAudit.unsupportedClaims.length&&!job.claimAudit.voiceIssues.length&&!(job.claimAudit.contentIssues||[]).length&&job.latestScan?.issues?.length===0;
function write(file,body){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',body);fs.renameSync(file+'.tmp',file);}
function exportSnapshot(job,slug,destination,origin,draft=false){
 const checked=job.claimAudit&&!job.claimAudit.unsupportedClaims.length&&!job.claimAudit.voiceIssues.length&&!(job.claimAudit.contentIssues||[]).length&&job.latestScan?.issues?.length===0;
 const selectedDraft=job.draftPublicationApproval?.kind==='user-selected-draft'&&job.draftPublicationApproval.fingerprint===draftFingerprint(job)&&job.latestScan?.issues?.length===0&&job.latestScan?.browser?.checks?.length>=6&&job.latestScan?.report?.scores?.overall>=80;
 if(!(draft?(checked||selectedDraft):ready(job)))throw new Error('Public publication requires passed browser, source and visual gates, or explicit approval of this exact checked draft');
 const source=path.join(DATA,'previews',job.token),target=path.join(destination,slug);let version=crypto.createHash('sha256');
 const rewrite=text=>text.replace(/https?:\/\/(?:localhost|127\.0\.0\.1):4174/g,origin).replaceAll(PREVIEW_ORIGIN,origin).replace(/\/p\/[a-f0-9]{48}\//g,'/ws/'+slug+'/').replace(/\/fonts\//g,'/ws/assets/fonts/').replaceAll('/preview-controls.js','/ws/assets/preview-controls.js');
 for(const name of ['index.html','services.html','about.html','privacy.html','terms.html','favicon.svg','sitemap.xml','llms.txt']){
  const file=path.join(source,name);if(!fs.existsSync(file))throw new Error('Missing checked preview file '+name);let text=fs.readFileSync(file,'utf8');
  for(const match of text.matchAll(/\/p\/([a-f0-9]{48})\/assets\/([a-f0-9]{16}\.(?:webp|png|jpg))/g)){const asset=path.join(DATA,'previews',match[1],'assets',match[2]);write(path.join(target,'assets',match[2]),fs.readFileSync(asset));}
  text=rewrite(text);if(draft&&name.endsWith('.html'))text=text.replace('<body>','<body><div style="background:#fff3cd;color:#382b07;padding:10px 20px;text-align:center;font:14px/1.5 system-ui" role="note">Independent redesign concept. <a href="/ws/list">All partner previews</a></div>');if(name.endsWith('.html'))text=text.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+escape(csp)+'">');version.update(text);write(path.join(target,name),text);
 }
 const hash=version.digest('hex').slice(0,20);for(const name of ['index.html','services.html','about.html']){const file=path.join(target,name);write(file,fs.readFileSync(file,'utf8').replace('<head>','<head><meta name="wintech-preview-version" content="'+hash+'">'));}return hash;
}
export function draftFingerprint(job){const hash=crypto.createHash('sha256');for(const name of ['index.html','services.html','about.html','privacy.html','terms.html'])hash.update(fs.readFileSync(path.join(DATA,'previews',job.token,name)));return hash.digest('hex');}
export function stagePublicCatalog(store,{destination=path.join(DATA,'public-sites'),origin=publicOrigin(),publishJob=null,draft=false}={}){
 destination=path.resolve(destination);fs.mkdirSync(destination,{recursive:true});const previousFile=path.join(destination,'entries.json');let previous=[];try{previous=JSON.parse(fs.readFileSync(previousFile));}catch{}
 const rows=catalogRows(store,origin,previous);let version=null;
 if(publishJob){const slug=store.publicSlug(publishJob.id);version=exportSnapshot(publishJob,slug,destination,origin,draft);rows.find(r=>r.slug===slug).status=draft?'draft':'published';}
 for(const row of rows){const home=path.join(destination,row.slug,'index.html');if(!['published','draft'].includes(row.status))write(home,head(row.partner+' | Preview in preparation')+`<main><p class="label">WinTech Partners · Website Studio</p><h1>${escape(row.partner)}</h1><p>This website preview is being prepared.</p><p><a href="${escape(row.currentUrl)}">Visit the current company website</a></p><p><a href="/ws/list">All partner previews</a></p></main></body></html>`);}
 write(path.join(destination,'entries.json'),JSON.stringify(rows,null,2));write(path.join(destination,'list','index.html'),directoryHTML(rows));
 write(path.join(destination,'assets','list.js'),"document.querySelector('#filter').addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();document.querySelectorAll('[data-partner-row]').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(q));});");write(path.join(destination,'assets','preview-controls.js'),PREVIEW_CONTROLS);
 for(const name of fs.readdirSync(path.join(ROOT,'public','fonts')).filter(n=>/\.(?:woff2|txt)$/i.test(n)))write(path.join(destination,'assets','fonts',name),fs.readFileSync(path.join(ROOT,'public','fonts',name)));
 return {destination,rows,version};
}
export function configureStaticHost(publicDirectory,rows){
 const file=path.join(publicDirectory,'serve.json');if(!fs.existsSync(file))throw new Error('Expected the existing website public/serve.json');const config=JSON.parse(fs.readFileSync(file));
 const routes=[{source:'/ws/list',destination:'/ws/list/index.html'},...rows.flatMap(r=>[{source:'/ws/'+r.slug,destination:'/ws/'+r.slug+'/index.html'},...['services','about','privacy','terms'].map(page=>({source:'/ws/'+r.slug+'/'+page,destination:'/ws/'+r.slug+'/'+page+'.html'}))])];
 config.rewrites=[...routes,...(config.rewrites||[]).filter(r=>!r.source.startsWith('/ws/'))];config.headers=[...(config.headers||[]).filter(r=>r.source!=='ws/**'),{source:'ws/**',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'},{key:'Content-Security-Policy',value:csp+"; frame-ancestors 'none'"}]}];write(file,JSON.stringify(config,null,2)+'\n');
 const app=path.dirname(publicDirectory),pkgFile=path.join(app,'package.json');if(fs.existsSync(pkgFile)){const pkg=JSON.parse(fs.readFileSync(pkgFile));if(!pkg.dependencies?.['serve-handler'])throw new Error('Install serve-handler in the public website app');write(path.join(app,'server.mjs'),fs.readFileSync(path.join(ROOT,'hosting','static-server.mjs')));pkg.scripts.start='node server.mjs';write(pkgFile,JSON.stringify(pkg,null,2)+'\n');}
}

export async function publishApproved(store,job){
 if(process.env.PUBLIC_PUBLISH_ENABLED!=='true')return null;
 if(!ready(job))throw new Error('Public quality gates have not passed');
 job.publication={...job.publication,state:'pending',url:publicOrigin()+'/ws/'+store.publicSlug(job.id)};
 store.save(job); // The restart-safe publisher owns uploads; generation never repeats for a deploy.
 return null;
}

function snapshotHash(directory){
 const hash=crypto.createHash('sha256');
 const walk=(dir)=>{for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name);if(fs.statSync(file).isDirectory())walk(file);else if(name!=='deployment.json'&&!name.endsWith('.tmp')){hash.update(path.relative(directory,file).replaceAll('\\','/'));hash.update(fs.readFileSync(file));}}};
 walk(directory);return hash.digest('hex');
}

export class PublicPublisher{
 constructor(store,options={}){
  this.store=store;this.busy=false;this.enabled=options.enabled??process.env.PUBLIC_PUBLISH_ENABLED==='true';
  this.checkout=options.checkout||process.env.PUBLIC_SITE_CHECKOUT;this.origin=options.origin||publicOrigin();this.fetch=options.fetch||fetch;
  this.upload=options.upload||(async()=>{
   const script=process.env.PUBLIC_RAILWAY_SCRIPT;
   if(!script||!fs.existsSync(script))throw new Error('Configure PUBLIC_RAILWAY_SCRIPT');
   for(const key of ['PUBLIC_RAILWAY_PROJECT','PUBLIC_RAILWAY_SERVICE','PUBLIC_RAILWAY_ENVIRONMENT'])if(!/^[a-f0-9-]{36}$/.test(process.env[key]||''))throw new Error('Missing '+key);
   const result=await run(process.execPath,[script,'up','--detach','--project',process.env.PUBLIC_RAILWAY_PROJECT,'--service',process.env.PUBLIC_RAILWAY_SERVICE,'--environment',process.env.PUBLIC_RAILWAY_ENVIRONMENT,'--message','Publish WinTech partner preview catalog'],{cwd:this.checkout,windowsHide:true,timeout:120000,maxBuffer:256000});
   return result.stdout;
  });
 }
 async tick(){
  if(!this.enabled||this.busy)return;this.busy=true;
  try{
   if(process.env.PUBLIC_PUBLISH_MODE==='gateway'){
    let staged=stagePublicCatalog(this.store,{origin:this.origin});
    for(const job of this.store.list().filter(ready)){staged=stagePublicCatalog(this.store,{origin:this.origin,publishJob:job});job.publication={state:'live',kind:'checked',url:this.origin+'/ws/'+this.store.publicSlug(job.id),publishedAt:new Date().toISOString()};this.store.save(job);}
    for(const job of this.store.list().filter(j=>j.publication?.state==='pending'&&j.publication.kind==='draft')){
      try{const r=await this.fetch(job.publication.url,{signal:AbortSignal.timeout(8000)});if(r.ok&&(await r.text()).includes('content="'+job.publication.version+'"')){job.publication={...job.publication,state:'live',publishedAt:new Date().toISOString()};job.error=null;this.store.event(job,'Public preview ready',job.publication.url);}}catch{}
    }
    this.store.setting('publicPublicationError','');return;
   }
   if(!this.checkout||!fs.existsSync(path.join(this.checkout,'app','public','serve.json')))throw new Error('Configure PUBLIC_SITE_CHECKOUT to the verified website checkout');
   const publicDirectory=path.join(this.checkout,'app','public'),destination=path.join(publicDirectory,'ws');
   let staged=stagePublicCatalog(this.store,{destination,origin:this.origin});
   for(const job of this.store.list().filter(ready))staged=stagePublicCatalog(this.store,{destination,origin:this.origin,publishJob:job});
   configureStaticHost(publicDirectory,staged.rows);this.store.setting('publicPublicationError','');
   const version=snapshotHash(destination);let state=JSON.parse(this.store.setting('publicPublication')||'{}');
   if(state.version!==version)state={version,state:'pending',attempts:0};
   if(state.state==='live')return;
   // Verify an uncertain previous upload before considering another submission.
   if(state.uploadedAt||state.state==='deploying'){
    try{const r=await this.fetch(this.origin+'/ws/deployment.json?v='+version,{signal:AbortSignal.timeout(10000),cache:'no-store'});if(r.ok&&(await r.json()).version===version){state={...state,state:'live',publishedAt:new Date().toISOString(),error:null};this.store.setting('publicPublication',JSON.stringify(state));for(const job of this.store.list().filter(j=>ready(j)||staged.rows.some(r=>r.slug===this.store.publicSlug(j.id)&&r.status==='draft'))){job.publication={...job.publication,state:'live',kind:ready(job)?'checked':'draft',url:this.origin+'/ws/'+this.store.publicSlug(job.id),publishedAt:state.publishedAt};this.store.event(job,'Public preview ready',job.publication.url);}return;}}catch{}
   }
   if(Date.now()<Number(state.retryAt||0))return;
   write(path.join(destination,'deployment.json'),JSON.stringify({version}));
   state={...state,state:'deploying',attempts:(state.attempts||0)+1,uploadedAt:new Date().toISOString(),retryAt:Date.now()+300000};this.store.setting('publicPublication',JSON.stringify(state));
   try{const result=await this.upload();state.uploadReceipt=String(result||'').slice(-3000);state.error=null;}
   catch(error){state.state='pending';state.error=String(error.message).slice(0,1000);state.retryAt=Date.now()+Math.min(1800000,60000*2**Math.min(state.attempts,5));}
   this.store.setting('publicPublication',JSON.stringify(state));
  }catch(error){this.store.setting('publicPublicationError',String(error.message).slice(0,1000));}
  finally{this.busy=false;}
 }
}

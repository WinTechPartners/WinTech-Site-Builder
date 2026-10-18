import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT,DATA,MODELS,HOST,PORT,PREVIEW_PORT,PREVIEW_ORIGIN } from './config.js';
import { Store } from './store.js';
import { Router } from './openrouter.js';
import { Worker,shuffledModels } from './worker.js';
import { normalizeTarget } from './network.js';
import { securityHeaders,closeBrowser } from './checks.js';
import {verifySavedDraft} from './free-verifier.js';
import {draftFingerprint} from './public-site.js';
import {importMigration} from './migration.js';
import {verifyFontAssets} from './font-assets.js';
import {stagePublicCatalog,PREVIEW_CONTROLS,publicOrigin,PublicPublisher} from './public-site.js';

const MIME={'.woff2':'font/woff2','.json':'application/json; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'};
function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(typeof body==='object'&&!Buffer.isBuffer(body)?JSON.stringify(body):body);}
async function readBody(req,max=20000){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>max)throw new Error('Request too large');}return JSON.parse(body||'{}');}
export function createServers(options={}){
  verifyFontAssets();
  const store=options.store||new Store();store.recover();
  const localTokenFile=path.join(DATA,'management.token');
  let localAdminToken=process.env.ADMIN_TOKEN;
  if(!localAdminToken){
    if(fs.existsSync(localTokenFile))localAdminToken=fs.readFileSync(localTokenFile,'utf8').trim();
    else{localAdminToken=crypto.randomBytes(32).toString('hex');fs.writeFileSync(localTokenFile,localAdminToken,{mode:0o600});}
    if(!/^[a-f0-9]{64}$/.test(localAdminToken))throw new Error('Local management token file is invalid');
  }
  if(HOST!=='127.0.0.1'&&!process.env.ADMIN_TOKEN)throw new Error('ADMIN_TOKEN must be configured before exposing the management server');
  let sessionKey=process.env.OPENROUTER_API_KEY||'';
  const readKey=()=>{
    if(sessionKey)return sessionKey;
    const envPath=path.join(ROOT,'.env');
    if(!fs.existsSync(envPath))return '';
    const match=fs.readFileSync(envPath,'utf8').match(/^OPENROUTER_API_KEY\s*=\s*([^\r\n]*)/m);
    return (match?.[1]||'').trim().replace(/^["']|["']$/g,'').trim();
  };
  const router=options.router||new Router(store,readKey);
  const worker=options.worker||new Worker(store,router);
  const publisher=options.publisher||new PublicPublisher(store);
  let migrationActive=false;
  function permittedHost(req){const host=String(req.headers.host||'').split(':')[0];return ['localhost','127.0.0.1','[::1]'].includes(host)||HOST!=='127.0.0.1';}
  const admin=http.createServer(async(req,res)=>{
    try{
      if(!permittedHost(req))return send(res,403,{error:'Host not permitted'});
      const u=new URL(req.url,'http://localhost');
      if(u.pathname==='/ws'||u.pathname.startsWith('/ws/')||u.pathname.startsWith('/p/')||u.pathname.startsWith('/fonts/')||u.pathname==='/preview-controls.js')return preview.emit('request',req,res);
      if(u.pathname==='/api/health')return send(res,200,{ok:true,keyConfigured:!!router.getKey(),budgetCap:0.5,previewOrigin:PREVIEW_ORIGIN,publicPreview:/^https:\/\//.test(PREVIEW_ORIGIN),models:MODELS,publicSiteOrigin:publicOrigin(),publicPublishing:process.env.PUBLIC_PUBLISH_ENABLED==='true'});
      if(u.pathname.startsWith('/api/')){
        if(req.headers.authorization!==`Bearer ${localAdminToken}`)return send(res,401,{error:'Management access required'});
        if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}` && req.headers.origin!==`https://${req.headers.host}`)return send(res,403,{error:'Cross-origin management request blocked'});
        if(req.method==='POST'&&u.pathname==='/api/migration'){migrationActive=true;try{const result=await importMigration(req,store);send(res,200,result);setTimeout(()=>process.exit(0),1000);return;}catch(error){migrationActive=false;throw error;}}
        if(req.method==='GET'&&u.pathname==='/api/migration-manifest'){
          const dir=path.join(DATA,'model-results');const paidResponses=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>n.endsWith('.json')).map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')})):[];
          return send(res,200,{jobs:store.list().map(j=>({id:j.id,url:j.url,budget:store.budget(j.id).accounted,cap:store.budget(j.id).cap})),calls:store.db.prepare('SELECT count(*) n,sum(charged) charged FROM calls').get(),paidResponses,paidCallsEnabled:process.env.MODEL_CALLS_ENABLED!=='false'});
        }
        if(req.method==='GET'&&u.pathname==='/api/publication')return send(res,200,{...JSON.parse(store.setting('publicPublication')||'{}'),configurationError:store.setting('publicPublicationError')||null});
        if(req.method==='GET'&&u.pathname==='/api/jobs')return send(res,200,store.list().map(j=>publicJob(j,store)));
        if(req.method==='POST'&&u.pathname==='/api/settings/key'){
          const body=await readBody(req);if(typeof body.key!=='string'||body.key.length<20||body.key.length>400||/[\r\n]/.test(body.key))return send(res,400,{error:'Enter a valid OpenRouter key'});
          sessionKey=body.key.trim();
          if(body.persist){
            if(HOST!=='127.0.0.1')return send(res,400,{error:'Set hosted credentials through environment variables; local file persistence is disabled remotely'});
            const envPath=path.join(ROOT,'.env');
            if(fs.existsSync(envPath)&&fs.lstatSync(envPath).isSymbolicLink())throw new Error('Refusing to write through a symlink');
            const existing=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8'):'';
            const line=`OPENROUTER_API_KEY=${sessionKey}`;
            const updated=/^OPENROUTER_API_KEY=.*$/m.test(existing)?existing.replace(/^OPENROUTER_API_KEY=.*$/m,line):existing+'\n'+line+'\n';
            fs.writeFileSync(envPath+'.tmp',updated,{mode:0o600});fs.renameSync(envPath+'.tmp',envPath);
          }
          return send(res,200,{ok:true,persistence:body.persist?'saved to ignored project .env':'session only; not saved to disk'});
        }
        if(req.method==='POST'&&u.pathname==='/api/jobs'){
          const body=await readBody(req);const url=normalizeTarget(body.url);
          let bag=JSON.parse(store.setting('modelBag')||'[]').filter(id=>MODELS.some(m=>m.id===id));if(!bag.length)bag=shuffledModels();const first=bag.shift();store.setting('modelBag',JSON.stringify(bag));
          const order=[first,...shuffledModels().filter(m=>m!==first)];const job=store.create(url,order);worker.tick();return send(res,202,publicJob(job,store));
        }
        const match=u.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)(\/(?:retry|stop|verify|publish-draft))?$/);
        if(match){const job=store.get(match[1]);if(!job)return send(res,404,{error:'Job not found'});
          if(req.method==='POST'&&match[2]==='/verify'){
            if(job.freeVerification?.state==='running')return send(res,202,job.freeVerification);
            job.freeVerification={state:'running',at:new Date().toISOString(),paidCalls:0};store.save(job);
            verifySavedDraft(store,job).then(result=>{job.freeVerification={...result,state:'complete'};store.save(job);}).catch(error=>{job.freeVerification={state:'failed',error:String(error.message),paidCalls:0};store.save(job);});
            return send(res,202,{state:'running',paidCalls:0});
          }
          if(req.method==='POST'&&match[2]==='/publish-draft'){
            const body=await readBody(req);if(body.confirm!=='publish-current-draft')return send(res,400,{error:'Explicit current-draft publication confirmation required'});
            job.draftPublicationApproval={kind:'user-selected-draft',fingerprint:draftFingerprint(job),at:new Date().toISOString(),reason:'User explicitly requested this existing demo published without new model calls'};
            const staged=stagePublicCatalog(store,{origin:publicOrigin(),publishJob:job,draft:true});job.publication={state:'pending',kind:'draft',url:publicOrigin()+'/ws/'+store.publicSlug(job.id),version:staged.version};store.save(job);return send(res,200,job.publication);
          }
          if(req.method==='GET'&&!match[2])return send(res,200,publicJob(job,store));
          if(req.method==='POST'&&match[2]==='/stop'){if(!['queued','awaiting_key','awaiting_images','researching','generating','checking','repairing'].includes(job.state))return send(res,409,{error:'This job is not running'});return send(res,202,publicJob(worker.cancel(job.id),store));}
          if(req.method==='POST'&&match[2]==='/retry'){
            if(!['failed','cancelled'].includes(job.state))return send(res,409,{error:'Only a stopped job can be retried'});
            if(store.budget(job.id).remaining<0.015)return send(res,409,{error:'Remaining prospect budget is too small for another attempt'});
            job.state='queued';job.error=null;store.save(job);worker.tick();return send(res,202,publicJob(job,store));
          }
        }
        return send(res,404,{error:'API route not found'});
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Method not allowed'});
      if(u.pathname==='/'){
        let html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
        // Remote mode never embeds the admin token; the user signs in with their configured token.
        html=html.replace('__LOCAL_TOKEN__',HOST==='127.0.0.1'?JSON.stringify(localAdminToken):'null');
        return send(res,200,html,MIME['.html']);
      }
      if(['/app.js','/style.css'].includes(u.pathname))return send(res,200,fs.readFileSync(path.join(ROOT,'public',u.pathname.slice(1))),MIME[path.extname(u.pathname)]);
      return send(res,404,'Not found','text/plain');
    }catch(e){return send(res,400,{error:e.message});}
  });
  const preview=http.createServer((req,res)=>{
    for(const[k,v]of Object.entries(securityHeaders))res.setHeader(k,v);
    try{
      if(!['GET','HEAD'].includes(req.method))return send(res,405,'Preview forms do not send or store submissions.','text/plain');
      const u=new URL(req.url,'http://localhost');
      if(u.pathname==='/ws'||u.pathname==='/ws/'){res.writeHead(302,{Location:'/ws/list'});return res.end();}
      if(u.pathname.startsWith('/ws/')){
        const staged=stagePublicCatalog(store,{origin:publicOrigin()});let relative=decodeURIComponent(u.pathname.slice(4));
        if(relative==='list'||relative==='list/')relative='list/index.html';else if(/^[a-z0-9-]{1,48}\/?$/.test(relative))relative=relative.replace(/\/$/,'')+'/index.html';else if(/^[a-z0-9-]{1,48}\/(services|about|privacy|terms)\/?$/.test(relative))relative=relative.replace(/\/$/,'')+'.html';
        if(!/^(?:list\/index\.html|entries\.json|[a-z0-9-]{1,48}\/(?:index|services|about|privacy|terms)\.html|[a-z0-9-]{1,48}\/(?:favicon\.svg|sitemap\.xml|llms\.txt)|[a-z0-9-]{1,48}\/assets\/[a-f0-9]{16}\.(?:webp|png|jpg)|assets\/(?:list|preview-controls)\.js|assets\/fonts\/[a-z0-9-]+\.(?:woff2|txt))$/.test(relative))return send(res,404,'Not found','text/plain');
        const file=path.join(staged.destination,relative);if(!fs.existsSync(file))return send(res,404,'Preview is not ready','text/plain');return send(res,200,req.method==='HEAD'?'':fs.readFileSync(file),MIME[path.extname(file)]||'application/octet-stream');
      }
      if(u.pathname==='/robots.txt')return send(res,200,'User-agent: *\nDisallow: /\n','text/plain');
      if(u.pathname==='/llms.txt')return send(res,200,'# WinTech private previews\n\nUnapproved redesign concepts. These previews are not authoritative company websites and must not be indexed.\n','text/plain');
      if(u.pathname==='/sitemap.xml')return send(res,200,'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',MIME['.xml']);
      if(u.pathname==='/.well-known/security.txt')return send(res,200,`Contact: ${PREVIEW_ORIGIN}/security\nExpires: ${new Date(Date.now()+180*86400000).toISOString()}\n`,'text/plain');
      if(u.pathname==='/security')return send(res,200,'Security reports: contact the operator who supplied this preview link. Do not submit secrets to preview forms.','text/plain');
      if(/^\/fonts\/(manrope|space-grotesk|instrument-serif-italic)\.woff2$/.test(u.pathname))return send(res,200,fs.readFileSync(path.join(ROOT,'public',u.pathname)),'font/woff2');
      if(u.pathname==='/favicon.svg')return send(res,200,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#173d38"/><path d="M12 18l8 28h7l5-17 5 17h7l8-28h-8l-4 17-5-17h-7l-5 17-4-17z" fill="#eff6d1"/></svg>',MIME['.svg']);
      if(u.pathname==='/preview-controls.js')return send(res,200,`document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();let message=form.querySelector('[role="status"]');if(!message){message=document.createElement('p');message.setAttribute('role','status');form.appendChild(message);}message.textContent='Preview only. No information was sent or stored. Please use the original company website to get in touch.';}));` ,MIME['.js']);
      const m=u.pathname.match(/^\/p\/([a-f0-9]{48})(?:\/(.*))?$/);if(!m)return send(res,404,'Preview not found','text/plain');
      const relative=decodeURIComponent(m[2]||'');
      if(relative.includes('..')||relative.includes('\\')||relative.includes('\0'))return send(res,400,'Invalid path','text/plain');
      let name=relative.replace(/\/$/,'');
      if(!name)name='index.html';else if(['services','about','privacy','terms'].includes(name))name+='.html';
      if(!/^(index|services|about|privacy|terms)\.html$|^(home|services|about)-(390|768|1440)\.png$|^(sitemap\.xml|llms\.txt|favicon\.svg)$|^assets\/[a-f0-9]{16}\.(png|jpg|webp)$/.test(name))return send(res,404,'Not found','text/plain');
      const filename=path.join(DATA,'previews',m[1],name);if(!fs.existsSync(filename))return send(res,404,'Preview is not ready','text/plain');
      send(res,200,req.method==='HEAD'?'':fs.readFileSync(filename),MIME[path.extname(name)]||'application/octet-stream');
    }catch{return send(res,400,'Invalid preview request','text/plain');}
  });
  const timer=setInterval(()=>{if(!migrationActive)worker.tick();},1500);timer.unref();
  const publishTimer=setInterval(()=>{if(!migrationActive)publisher.tick();},30000);publishTimer.unref();publisher.tick();
  return {admin,preview,store,worker,token:localAdminToken,close:async()=>{clearInterval(timer);clearInterval(publishTimer);await closeBrowser();await Promise.all([new Promise(r=>admin.close(r)),new Promise(r=>preview.close(r))]);store.db.close();}};
}
function publicJob(job,store){const{designCss,...rest}=job;if(rest.preview)rest.preview=`${PREVIEW_ORIGIN}/p/${job.token}/`;const draftPreview=fs.existsSync(path.join(DATA,'previews',job.token,'index.html'))?`${PREVIEW_ORIGIN}/p/${job.token}/`:null;return {...rest,draftPreview,publicSlug:store.publicSlug(job.id),publicUrl:publicOrigin()+'/ws/'+store.publicSlug(job.id),budget:store.budget(job.id)};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createServers();app.preview.listen(PREVIEW_PORT,HOST,()=>console.log(`Preview server: ${PREVIEW_ORIGIN}`));app.admin.listen(PORT,HOST,()=>console.log(`WinTech Preview Studio: http://localhost:${PORT}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}

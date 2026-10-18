import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Router } from '../src/openrouter.js';
import { Worker } from '../src/worker.js';
import { createServers } from '../src/server.js';
import { getBrowser } from '../src/checks.js';
import { MODELS,PREVIEW_PORT,PREVIEW_ORIGIN,DESIGN_REVIEW_MODELS } from '../src/config.js';
import { DATA } from '../src/config.js';
import fs from 'node:fs';
import path from 'node:path';
import { profile,researchFixture,siteFixture } from './fixtures.js';

test('URL to real rendered preview with native scanner, isolated server, form and ledger',async t=>{
 const store=new Store(':memory:');let requests=0;
 const router=new Router(store,()=> 'fixture-key-never-sent',async(_url,opts)=>{
   requests++;const body=JSON.parse(opts.body), system=body.messages[0].content;
   const answer=system.includes('company researcher')?profile:system.includes('factual copy reviewer')?{unsupportedClaims:[],voiceIssues:[],contentIssues:[]}:system.includes('creative director')?{concept:'Fixture concept',hero:'Fixture graphic',sections:['Services']}:system.includes('website art director')?{scores:{composition:9,typography:9,distinctiveness:9,polish:9,mobile:9},issues:[],strengths:['Fixture assessment']}:structuredClone(siteFixture);
   if(answer.pages){const assets=JSON.parse(body.messages[1].content).assets;answer.css+='.brand-kicker{font-size:12px}.type-probe{font-size:23px}\n.skip{position:absolute;left:-9999px}.skip:focus{left:0}';for(const p of answer.pages){p.body=p.body.replace('<main id="main">','<main id="main"><p class="brand-kicker">FIXTURE LABEL</p>');p.body=p.body.replace('<p>','<p class="type-probe">');p.body='<a class="skip" href="#main">Skip to main content</a>'+p.body;p.body=p.body.replace('</main>',`<img src="${assets[0].src}" width="40" height="40" loading="lazy" alt="Synthetic test image"></main>`);}}
   return {ok:true,status:200,json:async()=>({id:`fixture-${requests}`,usage:{cost:.00001},choices:[{message:{content:JSON.stringify(answer)},finish_reason:'stop'}]})};
 });
 const worker=new Worker(store,router,{research:async()=>researchFixture,assets:async(job)=>{
   const page=await(await getBrowser()).newPage();const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=40;const x=c.getContext('2d');x.fillStyle='#254f42';x.fillRect(0,0,40,40);return c.toDataURL('image/png').split(',')[1];});await page.close();
   const dir=path.join(DATA,'previews',job.token,'assets');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'1111111111111111.png'),Buffer.from(data,'base64'));return [{src:`/p/${job.token}/assets/1111111111111111.png`,alt:'Synthetic test image'}];
 }});
 const app=createServers({store,router,worker});
 await new Promise(r=>app.admin.listen(0,'127.0.0.1',r));await new Promise(r=>app.preview.listen(PREVIEW_PORT,'127.0.0.1',r));t.after(()=>app.close());
 const origin=`http://127.0.0.1:${app.admin.address().port}`;
 assert.equal((await fetch(origin+'/api/jobs')).status,401);
 const submitted=await fetch(origin+'/api/jobs',{method:'POST',headers:{Authorization:`Bearer ${app.token}`,'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.org/'})});assert.equal(submitted.status,202);
 const data=await submitted.json();
 for(let i=0;i<900;i++){const j=store.get(data.id);if(['failed','provisional','ready'].includes(j.state))break;await new Promise(r=>setTimeout(r,200));}
 const job=store.get(data.id);assert.equal(job.state,'provisional',job.error||job.phase);assert.equal(job.attempts,1);assert.equal(job.latestScan.report.verified,false);assert.equal(job.firstPass.scores.overall,job.latestScan.report.scores.overall);assert.equal(job.latestScan.browser.screenshots.length,9);assert.equal(store.budget(job.id).calls.length,4+DESIGN_REVIEW_MODELS.length);assert.ok(store.budget(job.id).accounted<.5);assert.ok(job.preview);
 const response=await fetch(job.preview);assert.equal(response.status,200);assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.match(response.headers.get('content-security-policy'),/form-action 'none'/);assert.ok(!(await response.text()).includes('fixture-key'));
 assert.equal((await fetch(`${PREVIEW_ORIGIN}/api/jobs`)).status,404);
 assert.equal((await fetch(job.preview+'services')).status,200);
 const page=await(await getBrowser()).newPage();await page.goto(job.preview);assert.equal(await page.$eval('.type-probe',e=>getComputedStyle(e).fontSize),'23px','renderer must preserve the designer typography');assert.equal(await page.$eval('.brand-kicker',e=>getComputedStyle(e).fontSize),'12px','utility labels retain their intentional hierarchy');await page.type('#name','Fixture Person');await page.type('#email','fixture@example.org');await page.click('button[type="submit"]');await page.waitForSelector('[role="status"]');assert.match(await page.$eval('[role="status"]',e=>e.textContent),/No information was sent/);await page.close();
 const duplicate=await(await fetch(origin+'/api/jobs',{method:'POST',headers:{Authorization:`Bearer ${app.token}`,'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.org/'})})).json();assert.equal(duplicate.id,job.id);assert.equal(requests,4+DESIGN_REVIEW_MODELS.length);
});



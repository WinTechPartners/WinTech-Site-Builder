import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {Worker} from '../src/worker.js';
import {MODELS} from '../src/config.js';
import {profile,researchFixture,siteFixture} from './fixtures.js';

test('a dropped source service is repaired automatically before any visual approval or publication',async()=>{
 const store=new Store(':memory:'),job=store.create('https://example.org/',MODELS.map(m=>m.id));
 job.research={...researchFixture,version:4,sources:researchFixture.sources.map(s=>({...s,emails:[],phones:[]}))};
 job.profile={...profile,services:[{name:'managed IT',sourceUrl:'https://example.org/',quote:'We provide managed IT services for local businesses.'}]};job.assets=[];
 let builds=0,reviews=0,audits=0;
 const router={getKey:()=>true,call:async(id,model,purpose,messages)=>{if(builds++===0){const missing=structuredClone(siteFixture);for(const p of missing.pages)p.body=p.body.replace(/managed IT/gi,'other technology');return missing;}assert.match(messages[1].content,/Missing source-listed services: managed IT/);return {patches:[{page:'',selector:'main',action:'append',html:'<section><h2>Managed IT</h2><p>We provide managed IT services for local businesses. Bring your device list and ask which support responsibilities are included.</p><a href="/#contact">Discuss managed IT with the team</a></section>'}],changes:['Restored source service with buyer guidance']};}};
 const worker=new Worker(store,router,{direct:async()=>({version:3,concept:'Specific concept',hero:'Hero',sections:[]}),scan:async()=>({report:{scores:{overall:90},verified:false},issues:[]}),audit:async()=>{audits++;return {unsupportedClaims:[],voiceIssues:[],contentIssues:[]};},review:async()=>{reviews++;return {passed:true,score:9,issues:[],scores:{composition:9}};}});
 await worker.run(job);assert.equal(builds,2);assert.equal(reviews,1);assert.equal(audits,1,'Known omissions must be repaired before buying a copy audit');assert.equal(job.contentCoverage.passed,true);assert.equal(job.state,'provisional');store.db.close();
});

test('a scanner-passing ordinary design is automatically repaired within the original ledger',async()=>{
 const store=new Store(':memory:'),job=store.create('https://example.org/',MODELS.map(m=>m.id));
 store.reserve(job.id,MODELS[0].id,'Earlier work',127468);
 job.research={...researchFixture,version:4,sources:researchFixture.sources.map(s=>({...s,emails:[],phones:[]}))};job.profile=profile;job.assets=[];
 let builds=0,reviews=0;
 const router={getKey:()=>true,call:async(id,model,purpose,messages)=>{
   if(builds++)assert.match(messages[1].content,/Hero looks like a generic brochure/);
   const call=store.reserve(id,model,purpose,1000);store.settle(call,.0005,{});return builds===1?structuredClone(siteFixture):{changes:['Improved hero hierarchy'],patches:[{page:'',selector:'h1',action:'text',text:'Technology with people in mind'}]};
 }};
 const worker=new Worker(store,router,{
   direct:async()=>({version:2,concept:'Distinctive company concept',hero:'Composed hero',sections:[]}),
   scan:async()=>({report:{scores:{overall:80},verified:false},issues:[]}),
   audit:async()=>({unsupportedClaims:[],voiceIssues:[],contentIssues:[]}),
   review:async()=>++reviews===1?{passed:false,score:6,scores:{composition:6},issues:['Hero looks like a generic brochure']}:{passed:true,score:8.5,scores:{composition:9},issues:[]}
 });
 await worker.run(job);
 assert.equal(job.state,'provisional');assert.equal(builds,2);assert.equal(reviews,2);
 assert.equal(store.budget(job.id).accounted,.128468);assert.equal(job.firstPass.scores.overall,80);
 assert.ok(job.events.some(e=>e.detail.includes('generic brochure')));store.db.close();
});

test('stalled visual repairs stop after two structural cycles without deleting prior costs',async()=>{
 const store=new Store(':memory:'),job=store.create('https://stalled.example/',MODELS.map(m=>m.id));
 job.conceptRefresh={stage:'done'};job.homeReconstructed=true;
 job.research={...researchFixture,version:4,sources:researchFixture.sources.map(s=>({...s,emails:[],phones:[]}))};job.profile=profile;job.assets=[];
 let calls=0;const router={getKey:()=>true,call:async(id,model,purpose)=>{
   const reservation=store.reserve(id,model,purpose,1000);store.settle(reservation,.0005,{});
   return ++calls===1?structuredClone(siteFixture):{patches:[{page:'',selector:'h1',action:'text',text:'Technology with people in mind'}]};
 }};
 const worker=new Worker(store,router,{direct:async()=>({version:3,concept:'Specific concept',hero:'Hero',sections:[]}),scan:async()=>({report:{scores:{overall:80},verified:false},issues:[]}),audit:async()=>({unsupportedClaims:[],voiceIssues:[],contentIssues:[]}),review:async()=>({passed:false,score:6.5,scores:{composition:6.5},issues:['Empty grid rows weaken composition']})});
 await assert.rejects(worker.run(job),/DESIGN_STALLED/);
 assert.equal(calls,6);assert.equal(job.visualStalls,2);assert.equal(store.budget(job.id).accounted,.003);assert.ok(job.events.some(e=>e.detail.includes('STRUCTURAL REDESIGN')));store.db.close();
});

test('creative reset is journaled once and retains verified research and old ledger',async()=>{
 const store=new Store(':memory:'),job=store.create('https://reset.example/',MODELS.map(m=>m.id));
 job.assets=[];job.profile=profile;job.research=researchFixture;job.repairFeedback=['Visual scores: composition 6'];
 const reservation=store.reserve(job.id,MODELS[0].id,'Earlier work',10000);store.settle(reservation,.005,{});
 let directions=0;const worker=new Worker(store,{getKey:()=>true},{direct:async()=>{directions++;return{version:3,concept:'A new material study',hero:'Substantial sculptural image',sections:[]};}});
 await worker.refreshConcept(job);await worker.refreshConcept(job);
 assert.equal(directions,1);assert.equal(job.conceptRefresh.stage,'done');assert.equal(job.profile,profile);assert.equal(job.research,researchFixture);assert.equal(store.budget(job.id).accounted,.005);assert.match(job.repairFeedback.at(-1),/NEW art direction/);store.db.close();
});

test('CSS-only repairs reuse factual review while changed copy is audited again',async()=>{
 const store=new Store(':memory:'),job=store.create('https://css-only.example/',MODELS.map(m=>m.id));
 job.research={...researchFixture,version:4,sources:researchFixture.sources.map(s=>({...s,emails:[],phones:[]}))};job.profile=profile;job.assets=[];
 let builds=0,audits=0,reviews=0;
 const router={getKey:()=>true,call:async()=>++builds===1?structuredClone(siteFixture):{changes:['Refined layout'],css:siteFixture.css+'\nmain{padding:32px}',patches:[]}};
 const worker=new Worker(store,router,{direct:async()=>({version:3,concept:'Specific concept',hero:'Hero',sections:[]}),scan:async()=>({report:{scores:{overall:80},verified:false},issues:[]}),audit:async()=>{audits++;return{unsupportedClaims:[],voiceIssues:[],contentIssues:[]};},review:async()=>++reviews===1?{passed:false,score:7,scores:{composition:7},issues:['Improve layout'],strengths:[]}:{passed:true,score:9,scores:{composition:9},issues:[]}});
 await worker.run(job);assert.equal(job.state,'provisional');assert.equal(builds,2);assert.equal(audits,1);assert.ok(job.events.some(e=>e.phase==='Reusing verified copy'));store.db.close();
});


test('unchanged candidates retain negative visual grades without paid resampling',async()=>{
 const store=new Store(':memory:'),job=store.create('https://unchanged.example/',MODELS.map(m=>m.id));job.conceptRefresh={stage:'done'};job.homeReconstructed=true;job.assets=[];job.profile=profile;job.research={...researchFixture,version:4,sources:researchFixture.sources.map(s=>({...s,emails:[],phones:[]}))};let builds=0,reviews=0;
 const worker=new Worker(store,{getKey:()=>true,call:async()=>++builds===1?structuredClone(siteFixture):{patches:[],css:'',changes:[]}},{direct:async()=>({version:3,concept:'Concept',hero:'Hero',sections:[]}),scan:async()=>({report:{scores:{overall:80},verified:false},issues:[]}),audit:async()=>({unsupportedClaims:[],voiceIssues:[],contentIssues:[]}),review:async()=>{reviews++;return {passed:false,score:7,scores:{composition:7},issues:['Improve actual composition']};}});
 await assert.rejects(worker.run(job),/DESIGN_STALLED|Quality checks/);assert.equal(reviews,1);assert.ok(job.events.some(e=>e.phase==='Reusing unchanged visual assessment'));store.db.close();
});

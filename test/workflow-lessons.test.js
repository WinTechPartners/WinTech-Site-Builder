import test from 'node:test';import assert from 'node:assert/strict';
import {Store}from'../src/store.js';import {Router}from'../src/openrouter.js';import {MODELS}from'../src/config.js';import{Worker}from'../src/worker.js';
import{readCompanyPage,parseSource}from'../src/research.js';import{contentPlan}from'../src/content-plan.js';import{profile,researchFixture}from'./fixtures.js';import{buildMessages,validateProfile}from'../src/generate.js';
test('inner company pages receive the same client-rendered source extraction as the homepage',async()=>{
 let renders=0;const result=await readCompanyPage({url:'https://example.org/services',text:'<title>Company</title><body><script src="app.js"></script></body>'},null,async()=>{renders++;return parseSource('<title>Company</title><body><section><h2>Our services</h2><article><h3>Cloud Phone Systems</h3><p>We provide number porting and hardware provisioning.</p></article></section></body>','https://example.org/services');});
 assert.equal(renders,1);assert.equal(result.rendered,true);assert.equal(result.services[0].name,'Cloud Phone Systems');
});
test('first-build space scales with the real inventory and retains company-specific story guidance',()=>{
 const p={...profile,services:Array.from({length:15},(_,i)=>({name:'Service '+i})),industries:[{name:'Education'},{name:'Non-Profit'}],sourceInventory:[{url:'https://example.org/about',outline:[{heading:'Cooperative purchasing',context:'Verified purchasing information'}]}]};
 const plan=contentPlan(p);assert.ok(plan.maxJSONCharacters>42000);assert.equal(plan.services.length,15);assert.equal(plan.aboutThemes.length,1);const prompt=buildMessages(p,{},[])[1].content;assert.doesNotMatch(prompt,/300–450 words each/);assert.match(prompt,/service-specific buyer questions/);
});
test('unread essential source pages stop the workflow before any model or artwork call',async()=>{
 const store=new Store(':memory:'),job=store.create('https://example.org/',MODELS.map(m=>m.id));job.research={...researchFixture,version:4,sources:researchFixture.sources.map(s=>({...s,emails:[]})),corePages:[{url:'https://example.org/services',essential:true,read:false}]};
 const worker=new Worker(store,{getKey:()=>true,call:async()=>{throw Error('Must not call provider');}});await assert.rejects(worker.run(job),/SOURCE_COVERAGE_INCOMPLETE/);assert.equal(store.budget(job.id).accounted,0);store.db.close();
});
test('an existing original logo must download before paid design work starts',async()=>{
 const store=new Store(':memory:'),job=store.create('https://example.org/',MODELS.map(m=>m.id));job.research={...researchFixture,version:4,sources:researchFixture.sources.map(s=>({...s,emails:[]})),images:[{role:'logo',url:'https://example.org/logo.png'}]};job.profile=profile;job.assets=[];
 await assert.rejects(new Worker(store,{getKey:()=>true,call:async()=>{throw Error('Must not call provider');}},{assets:async()=>[]}).run(job),/ORIGINAL_LOGO_UNAVAILABLE/);assert.equal(store.budget(job.id).accounted,0);store.db.close();
});
test('a repeated exact paid response is reused after restart; changed inputs still create a new request',async()=>{
 const store=new Store(':memory:'),job=store.create('https://example.org/',MODELS.map(m=>m.id));let calls=0;const transport=async()=>{calls++;return{ok:true,status:200,json:async()=>({id:'fixture',usage:{cost:.001},choices:[{finish_reason:'stop',message:{content:'{"value":1}'}}]})};};
 const input=[{role:'user',content:'Exact cached input'}];await new Router(store,()=> 'fixture-key',transport).call(job.id,MODELS[0].id,'fixture',input,1000);
 assert.deepEqual(await new Router(store,()=> 'fixture-key',transport).call(job.id,MODELS[0].id,'fixture',input,1000),{value:1});assert.equal(calls,1);assert.equal(store.budget(job.id).accounted,.001);
 await new Router(store,()=> 'fixture-key',transport).call(job.id,MODELS[0].id,'fixture',[{role:'user',content:'Changed input'}],1000);assert.equal(calls,2);assert.equal(store.budget(job.id).accounted,.002);store.db.close();
});
test('verified location evidence survives profile validation without dropping the public-list city',()=>{
 const research={...researchFixture,sources:researchFixture.sources.map(s=>({...s,text:s.text+' Based in Russellville, Arkansas.'}))};
 const brief={...profile,location:{city:'Russellville',state:'Arkansas',sourceUrl:'https://example.org/',quote:'Based in Russellville, Arkansas.'}};const first=validateProfile(brief,research);assert.equal(validateProfile(first,research).location.city,'Russellville');
});

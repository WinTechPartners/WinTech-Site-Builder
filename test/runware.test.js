import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {generateHero} from '../src/runware.js';

function setup(t){
 const settings={MODEL_CALLS_ENABLED:'true',PAID_GENERATION_NEW_URLS_AFTER:'',RUNWARE_ENABLED:'true',RUNWARE_API_KEY:'fixture-not-a-real-key',RUNWARE_MODEL_ID:'fixture:hero@1',RUNWARE_IMAGE_MAX_USD:'.04',RUNWARE_IMAGE_PARAMS_JSON:'{"width":1536,"height":1024,"steps":16}'};
 const previous=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings);
 t.after(()=>{for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;});
 const store=new Store(':memory:'),job=store.create('https://example.org/',[]);job.artDirection={imagePrompt:'An original conceptual technology illustration with detailed materials, disciplined lighting and negative space, without text or invented company facilities.'};
 t.after(()=>store.db.close());return {store,job};
}
const download=async()=>({type:'image/webp',bytes:Buffer.from('fixture-image-bytes')});
test('Runware uses the exact configured model, reserves original ledger and reuses the image',async t=>{
 const {store,job}=setup(t);store.reserve(job.id,'earlier','Earlier model work',254967);let requests=0;
 const transport=async(_url,options)=>{requests++;const [task]=JSON.parse(options.body);assert.ok(store.budget(job.id).accounted<=.5);
  if(task.taskType==='imageInference'){assert.equal(task.model,'fixture:hero@1');assert.equal(task.numberResults,1);assert.equal(task.steps,16);assert.equal(task.includeCost,true);return {ok:true,json:async()=>({data:[{taskUUID:task.taskUUID,status:'processing'}]})};}
  assert.equal(task.taskType,'getResponse');return {ok:true,json:async()=>({data:[{taskUUID:job.runwareTask.taskUUID,imageURL:'https://im.runware.ai/fixture.webp',cost:.0089}]})};
 };
 const asset=await generateHero(store,job,transport,download);assert.equal(asset.synthetic,true);assert.equal(asset.role,'hero');assert.equal(store.budget(job.id).accounted,.263867);
 assert.deepEqual(await generateHero(store,job,transport,download),asset);assert.equal(requests,2);
});
test('uncertain Runware submission retains reservation and retry polls the same UUID',async t=>{
 const {store,job}=setup(t);await assert.rejects(generateHero(store,job,async()=>{throw Error('Connection lost');},download),/Connection lost/);
 const uuid=job.runwareTask.taskUUID;assert.equal(store.budget(job.id).accounted,.04);assert.equal(store.budget(job.id).calls[0].state,'uncertain');
 await generateHero(store,job,async(_url,options)=>{const [task]=JSON.parse(options.body);assert.equal(task.taskType,'getResponse');assert.equal(task.taskUUID,uuid);return {ok:true,json:async()=>({data:[{taskUUID:uuid,imageURL:'https://im.runware.ai/fixture.webp',cost:.006}]})};},download);
 assert.equal(store.budget(job.id).calls.length,1);assert.equal(store.budget(job.id).accounted,.006);
});
test('Runware never calls the provider when the existing prospect allowance is insufficient',async t=>{
 const {store,job}=setup(t);store.reserve(job.id,'earlier','Earlier model work',480000);let calls=0;
 await assert.rejects(generateHero(store,job,async()=>{calls++;},download),/BUDGET_CAP/);assert.equal(calls,0);
});

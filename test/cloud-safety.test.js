import test from 'node:test';import assert from 'node:assert/strict';
import {Store} from '../src/store.js';import {Router} from '../src/openrouter.js';import {MODELS} from '../src/config.js';
test('disabled paid calls cannot reserve money or contact a provider',async()=>{
 const before=process.env.MODEL_CALLS_ENABLED;process.env.MODEL_CALLS_ENABLED='false';
 try{const store=new Store(':memory:'),job=store.create('https://example.org/',[MODELS[0].id]);let called=false;const router=new Router(store,()=> 'fixture-key',async()=>{called=true;throw Error('unexpected provider request');});
 await assert.rejects(router.call(job.id,MODELS[0].id,'Fixture',[{role:'user',content:'test'}],100),/MODEL_CALLS_DISABLED/);assert.equal(called,false);assert.equal(store.budget(job.id).accounted,0);assert.equal(store.budget(job.id).calls.length,0);
 }finally{if(before===undefined)delete process.env.MODEL_CALLS_ENABLED;else process.env.MODEL_CALLS_ENABLED=before;}
});

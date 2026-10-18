import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../src/store.js';
test('activation protects existing URLs, permits new URLs, and retains cumulative caps',t=>{
 const before=process.env.PAID_GENERATION_NEW_URLS_AFTER;process.env.PAID_GENERATION_NEW_URLS_AFTER='2026-10-18T12:43:05Z';t.after(()=>{if(before===undefined)delete process.env.PAID_GENERATION_NEW_URLS_AFTER;else process.env.PAID_GENERATION_NEW_URLS_AFTER=before;});
 const store=new Store(':memory:');t.after(()=>store.db.close());const old=store.create('https://existing.example/',[]);old.created='2026-10-17T00:00:00Z';store.save(old);assert.equal(store.paidEligible(old),false);assert.throws(()=>store.reserve(old.id,'provider/model','retry',1000),/EXISTING_PROSPECT_PROTECTED/);assert.equal(store.budget(old.id).accounted,0);
 assert.equal(store.create('https://www.existing.example/services',[]).id,old.id);
 const fresh=store.create('https://new.example/',[]);fresh.created='2026-10-18T12:43:06Z';store.save(fresh);assert.equal(store.paidEligible(fresh),true);store.reserve(fresh.id,'provider/model','build',490000);assert.throws(()=>store.reserve(fresh.id,'runware/model','image',20000),/BUDGET_CAP/);assert.equal(store.budget(fresh.id).accounted,.49);
});

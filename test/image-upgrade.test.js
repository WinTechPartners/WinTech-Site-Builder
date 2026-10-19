import test from 'node:test';import assert from 'node:assert/strict';
import {Store} from '../src/store.js';import {serviceImagePrompt} from '../src/image-upgrade.js';
test('image-only authorization cannot enable text calls, repeated reservations, or exceed the original cap',t=>{
 const old=process.env.PAID_GENERATION_NEW_URLS_AFTER;process.env.PAID_GENERATION_NEW_URLS_AFTER='2099-01-01';t.after(()=>{if(old===undefined)delete process.env.PAID_GENERATION_NEW_URLS_AFTER;else process.env.PAID_GENERATION_NEW_URLS_AFTER=old;});
 const s=new Store(':memory:'),j=s.create('https://example.com',[]);t.after(()=>s.db.close());
 j.imageUpgrade={state:'running',model:'bfl:flux@3-image-klein'};s.save(j);
 assert.throws(()=>s.reserve(j.id,'text/model','Build',1000,true),/PROTECTED/);
 assert.throws(()=>s.reserve(j.id,'runware/bfl:flux@3-image-klein','Original Runware hero image',41000,true),/PROTECTED/);
 j.imageUpgrade.call=s.reserve(j.id,'runware/bfl:flux@3-image-klein','Original Runware hero image',40000,true);s.save(j);
 assert.throws(()=>s.reserve(j.id,'runware/bfl:flux@3-image-klein','Original Runware hero image',40000,true),/PROTECTED/);
 assert.equal(s.budget(j.id).accounted,.04);
});
test('new image direction is deterministic and grounded in actual services',()=>{
 const j={url:'https://example.com',profile:{services:[{name:'Cybersecurity consulting'}]}};
 const p=serviceImagePrompt(j);assert.equal(serviceImagePrompt(j),p);assert.match(p,/Cybersecurity consulting/);assert.match(p,/not a photograph of the company's actual premises/);assert.match(p,/No floating objects/);
});

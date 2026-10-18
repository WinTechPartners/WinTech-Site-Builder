import test from 'node:test';
import assert from 'node:assert/strict';
import {auditClaims} from '../src/generate.js';
import {directDesign} from '../src/design.js';
import {COPY_AUDIT_FALLBACK_MODEL,MODELS,DESIGN_AUDIT_FALLBACK_MODEL} from '../src/config.js';
import {profile,researchFixture,siteFixture} from './fixtures.js';
test('copy audit falls back on provider failure but never on a factual rejection or budget stop',async()=>{
 const primary=MODELS.find(m=>m.id!==COPY_AUDIT_FALLBACK_MODEL).id;let calls=[];const job={id:'fixture',assets:[],research:researchFixture};
 const router={call:async(id,model)=>{calls.push(model);if(model===primary)throw new Error('OpenRouter 429');return {unsupportedClaims:[],voiceIssues:[],contentIssues:[],coverage:[]};}};
 assert.deepEqual(await auditClaims(router,job,siteFixture,profile,primary),{unsupportedClaims:[],voiceIssues:[],contentIssues:[],coverage:[]});assert.deepEqual(calls,[primary,COPY_AUDIT_FALLBACK_MODEL]);
 calls=[];router.call=async(id,model)=>{calls.push(model);throw new Error('BUDGET_CAP');};await assert.rejects(auditClaims(router,job,siteFixture,profile,primary),/BUDGET_CAP/);assert.equal(calls.length,1);
});

test('a report citing only nonexistent copy uses the configured fallback, while a real rejection is preserved',async()=>{
 const primary=MODELS.find(m=>m.id!==COPY_AUDIT_FALLBACK_MODEL).id,job={id:'fixture',assets:[],research:researchFixture};let calls=[];
 const clean={unsupportedClaims:[],voiceIssues:[],contentIssues:[],coverage:[]};const router={call:async(id,model)=>{calls.push(model);return model===primary?{...clean,unsupportedClaims:[{page:'about',quote:'Invented wording absent from every generated page',reason:'Invalid source-page citation',unsupported:true}]}:clean;}};
 assert.deepEqual(await auditClaims(router,job,siteFixture,profile,primary),clean);assert.deepEqual(calls,[primary,COPY_AUDIT_FALLBACK_MODEL]);calls=[];
 router.call=async(id,model)=>{calls.push(model);return {...clean,unsupportedClaims:[{page:'',quote:'We provide managed IT services for local businesses.',reason:'Fixture represents a real reviewer rejection',unsupported:true}]};};
 const negative=await auditClaims(router,job,siteFixture,profile,primary);assert.equal(negative.unsupportedClaims.length,1);assert.deepEqual(calls,[primary]);
});
test('art direction uses one bounded fallback on provider cooldown',async()=>{const primary=MODELS.find(m=>m.id!==DESIGN_AUDIT_FALLBACK_MODEL).id;const calls=[];const result=await directDesign({call:async(id,model)=>{calls.push(model);if(model===primary)throw new Error('Provider cooldown');return {concept:'Material computing',hero:'A rich engineering study',sections:['Hero'],imagePrompt:'Original engineering artwork with layered glass and metal surfaces and a clear focal structure. No text, logos or people.'};}},{id:'fixture',profile,assets:[],modelOrder:[primary]});assert.equal(result.version,3);assert.deepEqual(calls,[primary,DESIGN_AUDIT_FALLBACK_MODEL]);});

test('an explicitly supported observation is not treated as an unsupported claim',async()=>{const result=await auditClaims({call:async()=>({unsupportedClaims:[{page:'',quote:'Neutral supported framing',reason:'Not flagged',unsupported:false}],voiceIssues:[],contentIssues:[],coverage:[]})},{id:'fixture',assets:[],research:researchFixture},siteFixture,profile);assert.deepEqual(result,{unsupportedClaims:[],voiceIssues:[],contentIssues:[],coverage:[]});});

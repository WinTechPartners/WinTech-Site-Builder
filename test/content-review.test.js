import test from 'node:test';import assert from 'node:assert/strict';import {verifyContentFindings} from '../src/content-review.js';
const review={unsupportedClaims:[],voiceIssues:[],coverage:[{useful:true}],contentIssues:['Guidance is useful and differentiated.','Procurement information is missing.']};
test('contradictory content reports retain confirmed blockers and archive positive observations',async()=>{
 let calls=0;const result=await verifyContentFindings({call:async()=>{calls++;return {findings:[{index:0,blocking:false,reason:'Positive observation.',page:'',evidence:'Useful buyer guidance'},{index:1,blocking:true,reason:'No procurement details exist.',page:'about',evidence:'Only a company biography'}]};}},{id:'fixture'},review,[]);
 assert.equal(calls,1);assert.equal(result.contentIssues.length,1);assert.match(result.contentIssues[0],/Procurement/);assert.deepEqual(result.originalContentFindings,review.contentIssues);
});
test('verified coverage failures and negative per-offering grades cannot be cleared by a consistency call',async()=>{
 const router={call:async()=>{throw Error('Must not call');}};assert.equal(await verifyContentFindings(router,{id:'fixture'},review,[],['Missing real action']),null);assert.equal(await verifyContentFindings(router,{id:'fixture'},{...review,coverage:[{useful:false}]},[]),null);
});
test('incomplete finding verification fails closed without dropping original failures',async()=>{
 await assert.rejects(verifyContentFindings({call:async()=>({findings:[{index:0,blocking:false,reason:'Positive'}]})},{id:'fixture'},review,[]),/no findings cleared/);assert.equal(review.contentIssues.length,2);
});

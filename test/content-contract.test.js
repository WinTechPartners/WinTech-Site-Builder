import test from 'node:test';import assert from 'node:assert/strict';
import {sourceInventory,coverageCheck,validateUsefulCoverage} from '../src/content-contract.js';
import {parseSource} from '../src/research.js';import {ready} from '../src/public-site.js';
const url='https://example.org/';
const source=parseSource('<title>Example IT</title><body><section><h2>Our services</h2><article><h3>Disaster recovery</h3><p>We offer disaster recovery.</p></article></section><section><h2>Industries</h2><article><h3>Manufacturing</h3><p>We serve manufacturing organizations.</p></article></section></body>',url);
test('research retains separate service and industry inventories with verifiable quotes',()=>{
 const inventory=sourceInventory({sources:[source]},{services:[{name:'Invented SOC',quote:'Invented SOC services',sourceUrl:url}]});
 assert.deepEqual(inventory.services.map(x=>x.name),['Disaster recovery']);assert.deepEqual(inventory.industries.map(x=>x.name),['Manufacturing']);
});
test('missing original logo, service and industry block coverage even if unrelated text is long',()=>{
 const job={research:{sources:[source],images:[{role:'logo'}]},profile:{},assets:[]};
 const result=coverageCheck(job,{pages:[{slug:'',body:'<header>Fake wordmark</header><main><p>Other text.</p><aside hidden>Disaster recovery Manufacturing</aside></main>'}]});
 assert.equal(result.passed,false);assert.equal(result.issues.length,3);
 job.assets=[{role:'logo',src:'/actual.webp'}];const kept=coverageCheck(job,{pages:[{slug:'',body:'<header><img src="/actual.webp"></header><main><h2>Disaster recovery</h2><h2>Manufacturing</h2></main>'}]});assert.equal(kept.passed,true);
});
test('presence alone cannot pass usefulness and reviewer quotes must exist on the detail page',()=>{
 const profile={services:[{name:'Disaster recovery'}],industries:[{name:'Manufacturing'}]},pages=[{page:'services',body:'Disaster recovery. Manufacturing. Contact us.'}];
 assert.equal(validateUsefulCoverage({coverage:[]},profile,pages).length,2);
 const row={kind:'services',name:'Disaster recovery',page:'services',explanationQuote:'Invented substantial explanation',buyerGuidanceQuote:'Invented practical buyer questions',nextActionQuote:'Invented relevant next action',useful:true};
 assert.equal(validateUsefulCoverage({coverage:[row]},profile,pages).length,2);
 const text='Recover useful work after a disruption. Bring your critical applications and ask who tests restores. Discuss your recovery priorities with our team.';
 const good={...row,explanationQuote:'Recover useful work after a disruption.',buyerGuidanceQuote:'Bring your critical applications and ask who tests restores.',nextActionQuote:'Discuss your recovery priorities with our team.'};
 assert.deepEqual(validateUsefulCoverage({coverage:[good]},{services:profile.services},[{page:'services',body:text}]),[]);
 assert.match(validateUsefulCoverage({coverage:[{...good,useful:false,reason:'Interchangeable filler'}]},{services:profile.services},[{page:'services',body:text}])[0],/Interchangeable filler/);
 assert.match(validateUsefulCoverage({coverage:[good]},{services:profile.services},[{page:'services',body:text}],{pages:[{slug:'services',body:'<p>'+text+'</p>'}]})[0],/usable next-action link/);
 assert.deepEqual(validateUsefulCoverage({coverage:[good]},{services:profile.services},[{page:'services',body:text}],{pages:[{slug:'services',body:'<p>'+text+'</p><a href="/#contact">'+good.nextActionQuote+'</a>'}]}),[]);
});
test('an old approval cannot bypass the current content contract',()=>{
 const job={state:'provisional',visualReview:{passed:true},claimAudit:{unsupportedClaims:[],voiceIssues:[],contentIssues:[]},latestScan:{issues:[]}};
 assert.equal(ready(job),false);job.contentCoverage={version:2,passed:true};assert.equal(ready(job),false);job.contentCoverage={version:3,passed:false};assert.equal(ready(job),false);job.contentCoverage.passed=true;assert.equal(ready(job),true);
});

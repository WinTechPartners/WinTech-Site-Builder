import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeHeadings} from '../src/semantic-foundation.js';
import {localReadiness} from '../src/readiness.js';
import {scanner} from '../src/checks.js';
test('saved retry FAQ blocks collapse without losing distinct answers',()=>{
 const faq='<details><summary>Prepare for review?</summary><p>Bring the existing assessment.</p></details>';
 const site={css:'',pages:[{body:'<main><h1>Company</h1><section class="studio-faq"><h2>Questions</h2><section class="studio-faq"><h2>Questions</h2>'+faq+faq+'</section></section><section class="studio-faq"><h2>Questions</h2>'+faq+'<details><summary>Next step?</summary><p>Contact the team.</p></details></section></main>'}]};
 normalizeHeadings(site);const once=site.pages[0].body;assert.equal((once.match(/Prepare for review/g)||[]).length,1);assert.match(once,/Next step/);assert.match(once,/Bring the existing assessment/);normalizeHeadings(site);assert.equal(site.pages[0].body,once);
});
test('semantic foundation fixes skipped headings and retains original selector styling',()=>{
 const site={css:'.card h3{font-size:23px}@media(max-width:700px){h2.title{color:red}}',pages:[{body:'<main><h1>Company</h1><h3 class="title">Services</h3><h5>Detail</h5><h2>About</h2></main>'}]};
 normalizeHeadings(site);assert.match(site.pages[0].body,/<h2 class="title studio-original-h3">Services/);assert.match(site.pages[0].body,/<h3 class="studio-original-h5">Detail/);assert.match(site.css,/\.card \.studio-original-h3/);assert.equal(scanner.extractHtmlSignals(site.pages[0].body,'http://localhost/').seo.headingHierarchy,true);
 const css=site.css;normalizeHeadings(site);assert.equal(site.css,css);
});
test('local readiness separates pending hosting and inapplicable tracking from real omissions',()=>{
 const scores={categories:Object.fromEntries(Object.entries({seo:97,aeo:75,performance:65,security:85,accessibility:100,content:75,trust:85,bestPractices:65,privacy:60,i18n:55,analytics:0}).map(([k,score])=>[k,{score,name:k}]))};
 const result=localReadiness({seo:{wordCount:700},aeo:{jsonLd:{exists:true},organizationSchema:true,faqSchema:true},analytics:{hasAny:false}},scores);
 assert.equal(result.categories.bestPractices.score,100);assert.equal(result.categories.privacy.score,100);assert.equal(result.categories.aeo.score,100);assert.equal(result.categories.content.score,100);assert.equal(result.categories.performance,undefined);assert.equal(scores.categories.bestPractices.score,65);assert.equal(result.pending.length,2);assert.equal(result.passMark,80);
 const missing=structuredClone(scores);missing.categories.privacy.score=40;assert.equal(localReadiness({seo:{wordCount:700},aeo:{},analytics:{hasAny:false}},missing).categories.privacy.score,67);
});

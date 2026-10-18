import test from 'node:test';
import assert from 'node:assert/strict';
import {applyReconstruction,reconstructionMessages} from '../src/reconstruct.js';
import {siteFixture,profile} from './fixtures.js';
test('fresh homepage reconstruction preserves inner page content and introduces a shared scoped identity',()=>{
 const job={token:'a'.repeat(48),profile,assets:[],artDirection:{},visualReview:{score:6}};
 const result={body:'<div class="edition-aaaaaaaa"><header>New navigation</header><main><h1>Practical business technology</h1></main><footer>Contact</footer></div>',css:'.edition-aaaaaaaa{background:#101017;color:#fafafa}',faq:[],changes:['Fresh composition']};
 const original=structuredClone(siteFixture),site=applyReconstruction(original,result,job);
 assert.equal(site.pages[0].body,result.body);assert.ok(site.css.startsWith(original.css));assert.ok(site.pages[1].body.includes(original.pages[1].body));assert.match(site.pages[2].body,/edition-aaaaaaaa/);assert.deepEqual(original,siteFixture);
 const messages=reconstructionMessages(job,original,{views:[]});assert.ok(!messages[1].content.includes(original.css));assert.match(messages[0].content,/first principles/);
 assert.throws(()=>applyReconstruction(original,{...result,body:'<main>No scoped shell</main>'},job),/scoped header/);
});

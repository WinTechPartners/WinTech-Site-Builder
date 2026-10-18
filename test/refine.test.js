import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRefinement,refinementMessages} from '../src/refine.js';
import {siteFixture} from './fixtures.js';

test('targeted refinement retains unaffected pages, CSS and the original candidate',()=>{
 const before=structuredClone(siteFixture),original=JSON.stringify(before);
 const after=applyRefinement(before,{changes:['Expanded useful service explanation'],patches:[{page:'',selector:'main',action:'append',html:'<section><h2>Choosing support</h2><p>Discuss the systems your team relies on.</p></section>'}]});
 assert.equal(JSON.stringify(before),original);assert.equal(after.css,before.css);assert.deepEqual(after.pages.slice(1),before.pages.slice(1));assert.match(after.pages[0].body,/Choosing support/);assert.equal(after.changes.length,1);
});

test('visual repairs receive actual screenshots and measured layout with structural instructions',()=>{
 const views=[{type:'image_url',image_url:{url:'data:image/jpeg;base64,/9j/',detail:'low'}}];
 const geometry=[{width:1280,elements:[{selector:'.intro',gridColumn:'1 / 13'}]}];
 const messages=refinementMessages({}, {}, [], ['Visual scores: composition 6'],siteFixture,{views,geometry});
 assert.equal(messages[2].content,views);assert.deepEqual(JSON.parse(messages[1].content).measuredLayout,geometry);assert.match(messages[0].content,/explicit grid placement/);
});
test('refinement rejects missing selectors and unsafe heading operations',()=>{
 assert.throws(()=>applyRefinement(siteFixture,{patches:[{page:'',selector:'.missing-target',action:'text',text:'Missing'}]}),/did not match/);
 assert.throws(()=>applyRefinement(siteFixture,{patches:[{page:'',selector:'h1',action:'rename',tag:'script'}]}),/safe semantic/);
});

test('empty optional stylesheet never erases a working design during a copy-only patch',()=>{
 const site=applyRefinement(siteFixture,{css:'',patches:[{page:'',selector:'h1',action:'text',text:'Practical technology support'}]});
 assert.equal(site.css,siteFixture.css);assert.match(site.pages[0].body,/Practical technology support/);
});

test('small CSS overrides retain existing layout rules instead of replacing the stylesheet',()=>{
 const site=applyRefinement(siteFixture,{css:'h1{letter-spacing:-.02em}',patches:[]});
 assert.ok(site.css.startsWith(siteFixture.css));assert.ok(site.css.endsWith('h1{letter-spacing:-.02em}'));
});


test('child-content replacements preserve semantic and actively styled layout wrappers',()=>{const site=structuredClone(siteFixture);site.pages[0].body='<header>Brand</header><main><section class="hero"><h1>Technology</h1><p>Original</p></section></main>';const fixed=applyRefinement(site,{css:'.hero{display:grid}',patches:[{page:'',selector:'.hero',action:'replace',html:'<div class="hero-copy"><h1>Technology</h1><p>Repaired structure</p></div>'}]});assert.match(fixed.pages[0].body,/<section class="hero"><div class="hero-copy">/);assert.ok(fixed.refinementWarnings.length);assert.deepEqual(fixed.pages.slice(1),site.pages.slice(1));const intentional=applyRefinement(site,{css:'.hero-new{display:grid}',patches:[{page:'',selector:'.hero',action:'replace',html:'<section class="hero-new"><h1>Technology</h1></section>'}]});assert.ok(!intentional.pages[0].body.includes('class="hero"'));assert.ok(intentional.pages[0].body.includes('class="hero-new"'));});

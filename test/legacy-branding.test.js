import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSource} from '../src/research.js';
import {preserveVendors} from '../src/vendors.js';
import {refinementMessages} from '../src/refine.js';
test('legacy home link identifies original logo and image-only partner board',()=>{
 const s=parseSource('<title>Example</title><div id="logo"><a rel="home" href="https://example.com/"><img src="/website_logo.png"></a></div><main><h1>Business Partners</h1><img src="/partners_4.jpg"></main>','https://example.com/business_partners/');
 assert.equal(s.images[0].role,'logo');assert.equal(s.images[1].role,'vendor_board');
 const html=preserveVendors('<main><h1>Hello</h1></main>',{research:{sources:[]},profile:{name:'Example'}},[{role:'vendor_board',src:'/board.jpg',width:640,height:320}]);
 assert.match(html,/board.jpg/);assert.equal((preserveVendors(html,{research:{sources:[]}},[{role:'vendor_board',src:'/board.jpg'}]).match(/class="studio-partner-board"/g)||[]).length,1);
});
test('repair retains profile offering evidence without duplicate source inventory',()=>{
 const m=refinementMessages({name:'Example',services:[{name:'Security',quote:'Security assessment'}],sourceInventory:{services:[{name:'Security',quote:'x'.repeat(30000)}]}},{},[],['services: fix'],{css:'',pages:[{slug:'services',body:'<main>Security</main>'}]});
 const p=JSON.parse(m[1].content);assert.equal(p.profile.services[0].quote,'Security assessment');assert.equal(p.profile.sourceInventory,undefined);
});

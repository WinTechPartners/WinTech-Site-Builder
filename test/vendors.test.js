import test from 'node:test';import assert from 'node:assert/strict';
import {parseSource} from '../src/research.js';import {verifiedVendors,preserveVendors} from '../src/vendors.js';
test('partner logos without H3 cards remain vendors and the company header logo does not',()=>{
 const source=parseSource('<title>Example IT</title><body><header><img alt="Example IT logo" src="/own.png"></header><section><p>Our Partners</p><h2>Trusted vendor relationships</h2><div><img alt="Cloud Phone logo" src="/cloud.png"><span>Cloud Phone</span></div><div><img alt="Security Co logo" src="/security.png"><span>Security Co</span></div></section></body>','https://example.org/');
 assert.deepEqual(verifiedVendors({sources:[source]}).map(v=>v.name),['Cloud Phone','Security Co']);
});
test('vendor names in source logo labels survive research and omitted generated sections',()=>{
 const source=parseSource('<html><title>Example IT</title><body><header><img alt="Example IT logo" src="/own.png"></header><section><h2>Our Partners</h2><article><img alt="Acme Networks logo" src="/acme.png"><h3>Wireless networks</h3><p>Source-listed technology.</p></article><article><img alt="Device Co logo" src="/device.png"><h3>End-user hardware</h3></article></section></body></html>','https://example.org/');
 const research={sources:[source]},vendors=verifiedVendors(research);assert.deepEqual(vendors.map(v=>v.name),['Acme Networks','Device Co']);assert.match(source.text,/Acme Networks logo/);
 const job={research,profile:{name:'Example IT'}};const result=preserveVendors('<main><section><h1>Example</h1></section></main>',job,[{vendorName:'Acme Networks',src:'/p/token/assets/logo.webp'}]);
 assert.match(result,/Technology partners/);assert.match(result,/Wireless networks/);assert.match(result,/logo.webp/);assert.equal((preserveVendors(result,job,[]).match(/id="studio-vendors-heading"/g)||[]).length,1);
 assert.equal(verifiedVendors({sources:[{...source,vendors:[{...vendors[0],quote:'Invented gold partnership'}]}]}).length,0);
});

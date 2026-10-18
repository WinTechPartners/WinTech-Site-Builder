import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Router,upperBound,readCompletion,parseModelJSON } from '../src/openrouter.js';
import { MODELS,parseModels } from '../src/config.js';
import { normalizeTarget,publicIP,safeFetch } from '../src/network.js';
import { validateProfile,validateSite,creativeDirection,buildMessages } from '../src/generate.js';
import { sanitizeBody } from '../src/render-site.js';
import { profile,researchFixture,siteFixture } from './fixtures.js';
import { parseSource } from '../src/research.js';
import { validateVisualReview } from '../src/design.js';
import {responseFormat} from '../src/output-schema.js';

test('creative and repair calls request required production fields with strict schemas',()=>{
 const brief=responseFormat('Structural creative reset'),repair=responseFormat('Targeted code refinement');
 assert.equal(brief.type,'json_schema');assert.equal(brief.json_schema.strict,true);assert.ok(brief.json_schema.schema.required.includes('imagePrompt'));assert.ok(brief.json_schema.schema.required.includes('sections'));
 assert.ok(repair.json_schema.schema.required.includes('patches'));assert.ok(repair.json_schema.schema.required.includes('css'));assert.equal(repair.json_schema.schema.additionalProperties,false);assert.equal(responseFormat('test').type,'json_object');
});

test('the first builder sees the actual artwork and treats craft benchmarks as a separate company',()=>{
 const views=[{type:'image_url',image_url:{url:'data:image/jpeg;base64,YQ==',detail:'low'}}];
 const messages=buildMessages(profile,{},[],null,null,{}, {views});
 assert.equal(messages[2].content,views);assert.match(messages[0].content,/actual supplied artwork/);assert.match(messages[0].content,/never their text, brand, composition or imagery/);
});

test('paid JSON wrapped in a single fenced block is recovered without evaluating prose',()=>{
 assert.deepEqual(parseModelJSON('Here is the complete specification.\n```json\n{"concept":"Keystone","sections":[]}\n```'),{concept:'Keystone',sections:[]});
 assert.throws(()=>parseModelJSON('```json\n{}\n```\n```json\n{}\n```'),/invalid JSON/);
 assert.throws(()=>parseModelJSON('Text with no JSON document'),/invalid JSON/);
});

test('visual gate rejects ordinary and incomplete designs and requires actionable issues resolved',()=>{
 const scores={composition:9,typography:9,distinctiveness:9,polish:9,mobile:9};
 assert.equal(validateVisualReview({scores,issues:[]}).passed,true);
 assert.equal(validateVisualReview({scores:{...scores,composition:6},issues:[]}).passed,false);
 assert.equal(validateVisualReview({scores,issues:['Mobile heading clips']}).passed,false);
 assert.throws(()=>validateVisualReview({scores:{composition:10},issues:[]}),/incomplete/);
});

test('visual input reserves image tokens and rejects remote or unbounded images before network use',()=>{
 const model=MODELS[0],text=[{role:'user',content:'hello'}];
 const image=[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,YQ==',detail:'low'}}]}];
 assert.ok(upperBound(image,model,1000)>upperBound(text,model,1000)+4096*model.input);
 assert.throws(()=>upperBound([{role:'user',content:[{type:'image_url',image_url:{url:'https://example.org/a.jpg',detail:'low'}}]}],model,1000),/bounded/);
});

test('bounded screenshots do not consume base64 transport bytes as text context',()=>{
 const images=Array.from({length:3},()=>({type:'image_url',image_url:{url:'data:image/jpeg;base64,'+'YQ=='.repeat(6500),detail:'low'}}));
 const messages=[{role:'user',content:'x'.repeat(47000)},{role:'user',content:images}];
 assert.ok(upperBound(messages,MODELS[0],12000)>0);
 assert.throws(()=>upperBound([{role:'user',content:'x'.repeat(70000)},{role:'user',content:images}],MODELS[0],12000),/too large/);
});

test('static vector artwork survives while SVG scripts and external resource primitives are removed',()=>{
 const job={token:'a'.repeat(48),profile:{...profile,sourceUrl:'https://example.org/',socialLinks:[]}};
 const html=sanitizeBody('<svg viewBox="0 0 100 100" aria-hidden="true" onload="alert(1)"><defs><linearGradient id="light"><stop offset="0" stop-color="#00ccff"/></linearGradient></defs><path d="M0 0L100 100" fill="url(#light)"/><image href="https://evil.example/a"/><use href="https://evil.example/icon"/><foreignObject><iframe src="https://evil.example"></iframe></foreignObject><script>alert(1)</script></svg>',job,[],['']);
 assert.match(html,/<svg/);assert.match(html,/viewBox="0 0 100 100"/);assert.match(html,/<path/);assert.match(html,/url\(#light\)/);
 assert.doesNotMatch(html,/onload|evil\.example|foreignObject|<script|<image|<use|<iframe/i);
});
test('hero CSS accepts only supplied image paths and removes an empty background resource',()=>{
 const src='/p/'+ 'a'.repeat(48)+'/assets/'+ 'b'.repeat(16)+'.webp';
 const site=structuredClone(siteFixture);site.css+=` .hero{background-image:url('${src}')} .empty{background:url('')}`;
 assert.match(validateSite(site,[{src}]).css,/background:none/);
 assert.throws(()=>validateSite(structuredClone(siteFixtureWithURL('https://unapproved.example/hero.jpg')),[]),/unapproved resource/);
 function siteFixtureWithURL(url){const value=structuredClone(siteFixture);value.css+=` .hero{background:url('${url}')}`;return value;}
});

test('generated font faces cannot shadow the verified local fonts and demo buttons submit safely',()=>{
 const site=structuredClone(siteFixture);site.css+="@font-face{font-family:Manrope;src:local('Manrope');font-weight:400 800}";
 assert.doesNotMatch(validateSite(site).css,/@font-face/);
 const job={token:'a'.repeat(48),profile:{...profile,sourceUrl:'https://example.org/',socialLinks:[]}};
 const html=sanitizeBody('<main><form><button type="button">Request support</button><button type="reset">Clear</button></form></main>',job,[],['']);
 assert.match(html,/<button type="submit">Request support/);assert.match(html,/<button type="reset">Clear/);
});
test('FAQs supplied as metadata become visible, auditable content without duplication',()=>{
 const site=structuredClone(siteFixture);site.pages[0].faq=[{question:'Can I discuss my network requirements?',answer:'Contact the business to discuss its network services.'}];
 const once=validateSite(site);assert.match(once.pages[0].body,/Can I discuss my network requirements\?/);assert.match(once.pages[0].body,/Contact the business to discuss its network services\./);
 const body=once.pages[0].body;assert.equal(validateSite(once).pages[0].body,body);
});

test('source text preserves boundaries and contact links do not merge into adjacent copy',()=>{
 const source=parseSource('<title>Example</title><body><p>Complete integrity.</p><a href="mailto:info@example.org">info@example.org</a><a href="tel:855-880-0930">855-880-0930</a><p>First contact</p></body>','https://example.org/');
 assert.match(source.text,/integrity\. info@example\.org 855-880-0930 First/);
 assert.deepEqual(source.emails,['info@example.org']);assert.deepEqual(source.phones,['855-880-0930']);
 const facts=[1,2,3].map(()=>({text:'Contact',quote:'Complete integrity.',sourceUrl:source.url}));
 const brief=validateProfile({name:'Example',facts},{sourceUrl:source.url,sources:[source],profiles:[],socialLinks:[]});
 assert.equal(brief.email,'info@example.org');assert.equal(brief.phone,'855-880-0930');
});

function setup(){const store=new Store(':memory:');const job=store.create('https://example.org/',MODELS.map(m=>m.id));return{store,job};}
test('explicit prospect allowance increase retains prior charges and leaves other prospects at fifty cents',()=>{
 const {store,job}=setup();store.reserve(job.id,MODELS[0].id,'Earlier work',254967);job.budgetCapMicro=750000;store.save(job);
 assert.equal(store.budget(job.id).cap,.75);store.reserve(job.id,MODELS[0].id,'Remaining work',495033);assert.equal(store.budget(job.id).accounted,.75);
 assert.throws(()=>store.reserve(job.id,MODELS[0].id,'Over cap',1),/BUDGET_CAP/);assert.equal(store.budget(store.create('https://another.example/',[]).id).cap,.5);store.db.close();
});
test('stop aborts upstream inference and prevents further calls while retaining uncertain charges',async()=>{
 const {store,job}=setup();let started;const ready=new Promise(r=>started=r);let calls=0;
 const router=new Router(store,()=> 'fixture-key',async(_url,options)=>{calls++;started();return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));});
 const pending=router.call(job.id,MODELS[0].id,'Build',[{role:'user',content:'hello'}],1000);await ready;router.cancel(job.id);await assert.rejects(pending,/CANCELLED/);
 assert.equal(store.budget(job.id).calls[0].state,'uncertain');assert.ok(store.budget(job.id).accounted>0);await assert.rejects(router.call(job.id,MODELS[0].id,'Do not start',[{role:'user',content:'hello'}],1000),/CANCELLED/);assert.equal(calls,1);store.db.close();
});
test('hard cap is enforced transactionally and duplicate company submissions share a ledger',()=>{
 const{store,job}=setup();store.reserve(job.id,MODELS[0].id,'a',300000);store.reserve(job.id,MODELS[1].id,'b',200000);
 assert.throws(()=>store.reserve(job.id,MODELS[0].id,'c',1),/BUDGET_CAP/);assert.equal(store.budget(job.id).accounted,.5);
 assert.equal(store.create(job.url,[]).id,job.id);assert.equal(store.create('https://www.example.org/about',[]).id,job.id);store.db.close();
});
test('uncertain requests and restart recovery keep their complete reservation',()=>{
 const{store,job}=setup();store.reserve(job.id,MODELS[0].id,'timeout',50000);job.state='generating';store.save(job);store.recover();
 assert.equal(store.budget(job.id).accounted,.05);assert.equal(store.budget(job.id).calls[0].state,'uncertain');assert.equal(store.get(job.id).state,'failed');store.db.close();
});
test('request constrains price, output, plugins and fallback; reported actual cost settles reservation',async()=>{
 const{store,job}=setup();let payload;
 const router=new Router(store,()=> 'test-key-not-real',async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({id:'fixture',usage:{cost:.001},choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]})};});
 assert.deepEqual(await router.call(job.id,MODELS[0].id,'test',[{role:'user',content:'hello'}],1000),{ok:true});
 assert.equal(payload.provider.max_price.prompt,MODELS[0].input);assert.equal(payload.provider.max_price.request,0);assert.equal(payload.provider.allow_fallbacks,false);assert.deepEqual(payload.plugins,[]);assert.deepEqual(payload.reasoning,MODELS[0].reasoning);assert.equal(payload.max_tokens,1000);assert.equal(store.budget(job.id).accounted,.001);store.db.close();
});
test('timeout charges conservatively and budget rejection never calls the network',async()=>{
 const{store,job}=setup();let requests=0;const router=new Router(store,()=> 'test-key',async()=>{requests++;throw new Error('timeout');});
 await assert.rejects(router.call(job.id,MODELS[0].id,'timeout',[{role:'user',content:'hello'}],1000),/timeout/);const amount=store.budget(job.id).accounted;assert.ok(amount>0);assert.equal(store.budget(job.id).calls[0].state,'uncertain');
 store.reserve(job.id,MODELS[0].id,'fill',500000-Math.round(amount*1e6));await assert.rejects(router.call(job.id,MODELS[0].id,'blocked',[{role:'user',content:'hello'}],1000),/BUDGET_CAP/);assert.equal(requests,1);store.db.close();
});

test('rate-limited providers cool down before another reservation or network call',async()=>{
 const{store,job}=setup();let requests=0;
 const router=new Router(store,()=> 'fixture-key',async()=>{requests++;return{ok:false,status:429,json:async()=>({error:{message:'Rate limited'}})};});
 await assert.rejects(router.call(job.id,MODELS[0].id,'rate limit',[],1000),/429/);const cost=store.budget(job.id).accounted;
 await assert.rejects(router.call(job.id,MODELS[0].id,'retry',[],1000),/cooldown/);assert.equal(requests,1);assert.equal(store.budget(job.id).accounted,cost);assert.equal(store.budget(job.id).calls.length,1);store.db.close();
});
test('missing cost keeps reservation and billing anomaly stops further work',()=>{
 const{store,job}=setup();let id=store.reserve(job.id,MODELS[0].id,'missing cost',2000);store.settle(id,null,{});assert.equal(store.budget(job.id).accounted,.002);
 id=store.reserve(job.id,MODELS[0].id,'anomaly',2000);assert.throws(()=>store.settle(id,.003,{}),/BILLING_ANOMALY/);store.db.close();
});
test('model pool and low-cost context cannot be bypassed',async()=>{
 const{store,job}=setup();const router=new Router(store,()=> 'test',()=>{throw new Error('must not call');});
 await assert.rejects(router.call(job.id,'openai/gpt-6-astra','x',[],1000),/approved/);assert.throws(()=>upperBound([{role:'user',content:'x'.repeat(100000)}],MODELS[0],20000),/too large/);store.db.close();
});
test('SSRF defense rejects private, reserved, mapped and credential-bearing targets',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(publicIP(ip),false,ip);
 for(const url of ['http://127.0.0.1','http://[::1]','https://user:pass@example.org','http://localhost','https://example.org:2222','http://2130706433'])assert.throws(()=>normalizeTarget(url));
 assert.equal(normalizeTarget('example.org'),'https://example.org/');assert.equal(publicIP('8.8.8.8'),true);await assert.rejects(safeFetch('http://127.0.0.1'),/Private/);
});
test('company facts require real exact supporting source passages',()=>{
 assert.equal(validateProfile(profile,researchFixture).facts.length,3);
 assert.throws(()=>validateProfile({...profile,facts:[...profile.facts.map(f=>({...f,quote:'invented certification text'}))]},researchFixture),/Insufficient/);
});
test('preview sanitizer strips executable markup, unsafe links and unapproved assets',()=>{
 const body=sanitizeBody('<main><h1>Hello</h1><script>fetch("/api/jobs")</script><img src="https://evil.test/pixel" onerror="alert(1)"><a href="javascript:alert(1)">Go</a><form action="https://evil.test"><input name="q"></form></main>',{token:'a'.repeat(48),profile},[],['','services','about','privacy','terms']);
 assert.ok(!body.includes('script'));assert.ok(!body.includes('evil'));assert.ok(!body.includes('javascript'));assert.ok(body.includes('action="#"'));
});
test('site contract rejects external CSS and incomplete builds; design seed is stable',()=>{
 assert.equal(validateSite(siteFixture),siteFixture);assert.throws(()=>validateSite({...siteFixture,css:'@import "https://evil.test";'}),/unsafe/);assert.throws(()=>validateSite({...siteFixture,pages:[]}),/three/);assert.deepEqual(creativeDirection('example.org'),creativeDirection('example.org'));
});
test('model configuration accepts replacement IDs and validates prices and uniqueness',()=>{
 const parsed=parseModels('[{"id":"new-vendor/new-builder","name":"Replacement","input":0.1,"output":0.5}]');assert.equal(parsed[0].id,'new-vendor/new-builder');
 assert.throws(()=>parseModels('[]'),/between/);assert.throws(()=>parseModels('[{"id":"vendor/model","input":-1,"output":1}]'),/positive/);
 assert.throws(()=>parseModels('[{"id":"vendor/model","input":1,"output":1},{"id":"vendor/model","input":1,"output":1}]'),/unique/);
});
test('streamed completion assembles split chunks and final billing without losing the cap ledger',async()=>{
 const text='data: {"id":"x","choices":[{"delta":{"content":"{\\\"ok\\\":"}}]}\n\ndata: {"choices":[{"delta":{"content":"true}"},"finish_reason":"stop"}]}\n\ndata: {"usage":{"cost":0.001},"choices":[]}\n\ndata: [DONE]\n\n';
 const bytes=Buffer.from(text);const response={headers:new Headers({'content-type':'text/event-stream'}),body:(async function*(){yield bytes.subarray(0,40);yield bytes.subarray(40,110);yield bytes.subarray(110);})()};
 const result=await readCompletion(response);assert.equal(result.choices[0].message.content,'{"ok":true}');assert.equal(result.usage.cost,.001);assert.equal(result.choices[0].finish_reason,'stop');
});



test('explicit ninety-cent allowance preserves cumulative charges and default cap',()=>{const {store,job}=setup();assert.equal(store.cap(job.id),500000);job.budgetCapMicro=900000;store.save(job);store.reserve(job.id,MODELS[0].id,'Prior uncertain work',699336);assert.equal(store.budget(job.id).accounted,.699336);assert.equal(store.cap(job.id),900000);assert.throws(()=>store.reserve(job.id,MODELS[0].id,'Over cap',200665),/BUDGET_CAP/);store.db.close();});

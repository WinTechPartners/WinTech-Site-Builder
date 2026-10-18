import test from 'node:test';import assert from 'node:assert/strict';import {readCompletion} from '../src/openrouter.js';
test('completed paid stream returns on DONE instead of waiting for provider socket closure',async()=>{
 let closed=false;async function* body(){try{yield Buffer.from('data: '+JSON.stringify({choices:[{delta:{content:'{"ok":true}'},finish_reason:'stop'}],usage:{cost:.001}})+'\n\ndata: [DONE]\n\n');throw Error('Read beyond completed response');}finally{closed=true;}}
 const result=await readCompletion({headers:{get:()=> 'text/event-stream'},body:body()});assert.equal(result.choices[0].message.content,'{"ok":true}');assert.equal(result.usage.cost,.001);assert.equal(closed,true);
});

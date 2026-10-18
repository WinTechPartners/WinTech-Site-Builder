import test from 'node:test';import assert from 'node:assert/strict';import {reusePaidProfile} from '../src/reuse-profile.js';
test('reuses paid facts only when their exact evidence remains in refreshed sources',()=>{
 const quote='Example Technology provides managed IT support and backup services.';
 const research={sourceUrl:'https://example.org/',sources:[{url:'https://example.org/',title:'Example Technology',text:quote,outline:[],emails:[],phones:[],services:[],industries:[],vendors:[]}],profiles:[],socialLinks:[]};
 const profile={name:'Example Technology',facts:Array.from({length:3},()=>({text:'Provides managed IT support.',sourceUrl:'https://example.org/',quote})),phrases:[],services:[],industries:[]};
 const store={budget:()=>({calls:[{id:'paid',purpose:'Source-backed company brief',state:'settled'}]})},read=()=>({response:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(profile)}}]}});
 const job={id:'example',research};assert.equal(reusePaidProfile(store,job,null,read).facts.length,3);research.sources[0].text='Unrelated new business';assert.equal(reusePaidProfile(store,job,null,read),null);
});

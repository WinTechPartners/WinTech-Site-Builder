import test from 'node:test';import assert from 'node:assert/strict';
import {createStaticHandler} from '../hosting/static-server.mjs';
test('gateway forwards public previews only and never forwards management credentials',async()=>{
 const prior=process.env.PUBLIC_PREVIEW_UPSTREAM,original=globalThis.fetch;process.env.PUBLIC_PREVIEW_UPSTREAM='https://builder.example';const seen=[];let normal=0;
 globalThis.fetch=async(url,options)=>{seen.push({url:String(url),options});return new Response('preview',{status:200,headers:{'content-type':'text/html'}});};
 const response=()=>({headersSent:false,writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},end(body){this.body=body;}});
 try{const handler=createStaticHandler(async(req,res)=>{normal++;res.writeHead(200);res.end('main');},{rewrites:[]},'.');const preview=response();await handler({url:'/ws/arcticnetworksolutions',method:'GET',headers:{authorization:'Bearer private'}},preview);assert.equal(preview.status,200);assert.equal(String(preview.body),'preview');assert.equal(seen[0].url,'https://builder.example/ws/arcticnetworksolutions');assert.equal(seen[0].options.headers,undefined);
 await handler({url:'/api/jobs',method:'GET'},response());assert.equal(normal,1);assert.equal(seen.length,1);
 const post=response();await handler({url:'/ws/list',method:'POST'},post);assert.equal(post.status,405);assert.equal(seen.length,1);
 }finally{globalThis.fetch=original;if(prior===undefined)delete process.env.PUBLIC_PREVIEW_UPSTREAM;else process.env.PUBLIC_PREVIEW_UPSTREAM=prior;}
});

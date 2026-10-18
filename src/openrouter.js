import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MODELS, MODEL_TIMEOUT_MS,DATA } from './config.js';
import {responseFormat} from './output-schema.js';

export function parseModelJSON(content){
  if(typeof content!=='string')throw new Error('Model returned no text; paid request recorded');
  try{return JSON.parse(content.trim());}catch{}
  const blocks=[...content.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  if(blocks.length===1)try{return JSON.parse(blocks[0][1].trim());}catch{}
  throw new Error('Model returned invalid JSON; paid request recorded');
}

export function upperBound(messages, model, maxTokens) {
  // UTF-8 bytes conservatively bound ordinary tokenizer input;
  // 8K extra tokens cover message framing. No tools, paid search, or plugins.
  const imageParts=messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url');
  if(imageParts.length>4||imageParts.some(p=>p.image_url?.detail!=='low'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.image_url?.url||'')||p.image_url.url.length>30000))throw new Error('Only up to four bounded low-detail JPEG screenshots are allowed');
  // Reserve an additional 4K input tokens per low-detail image, beyond its
  // serialized base64 bytes and message framing; no image fee may be added.
  // Base64 image bytes are a transport representation, not text tokens.
  // Budget the bounded images separately at a conservative 4K tokens each.
  const contextMessages=messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(p=>p.type==='image_url'?{type:'image_url',image_url:{detail:'low'}}:p):m.content}));
  const contextTokens=Buffer.byteLength(JSON.stringify(contextMessages),'utf8')+8192+imageParts.length*4096;
  if(contextTokens+maxTokens>95_000)throw new Error('Prompt too large for the low-cost context tier');
  return Math.ceil(contextTokens*model.input+maxTokens*model.output);
}
export async function readCompletion(response){
  if(!response.headers?.get('content-type')?.includes('text/event-stream'))return response.json();
  const decoder=new TextDecoder();let buffer='',content='',finish=null,usage=null,id,model,done=false;
  function line(value){
    if(!value.startsWith('data:'))return;
    const data=value.slice(5).trim();if(data==='[DONE]'){done=true;return;}if(!data)return;
    const chunk=JSON.parse(data);if(chunk.error)throw new Error(String(chunk.error.message||'Model stream failed'));
    id=chunk.id||id;model=chunk.model||model;usage=chunk.usage||usage;
    for(const choice of chunk.choices||[]){if(typeof choice.delta?.content==='string')content+=choice.delta.content;if(choice.finish_reason)finish=choice.finish_reason;}
    if(content.length>400000)throw new Error('Model response exceeded the bounded document size');
  }
  for await(const bytes of response.body){buffer+=decoder.decode(bytes,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){line(buffer.slice(0,end).replace(/\r$/,''));buffer=buffer.slice(end+1);if(done)break;}if(done)break;}
  buffer+=decoder.decode();if(buffer.trim())line(buffer.trim());
  if(!done&&!finish)throw new Error('Model stream interrupted; reservation retained');
  return {id,model,usage,choices:[{message:{content},finish_reason:finish}]};
}
export class Router {
  constructor(store,getKey,transport=fetch) {this.store=store;this.getKey=getKey;this.transport=transport;this.controllers=new Map();}
  signalFor(jobId){if(!this.controllers.has(jobId))this.controllers.set(jobId,new AbortController());return this.controllers.get(jobId).signal;}
  cancel(jobId){if(!this.controllers.has(jobId))this.controllers.set(jobId,new AbortController());this.controllers.get(jobId).abort(new Error('CANCELLED: Stopped by user'));}
  resume(jobId){this.controllers.set(jobId,new AbortController());}
  async call(jobId,modelId,purpose,messages,maxTokens=18000) {
    if(this.signalFor(jobId).aborted)throw new Error('CANCELLED: Stopped by user');
    const model=MODELS.find(m=>m.id===modelId);if(!model)throw new Error('Model is not in the approved configured pool');
    const requestHash=crypto.createHash('sha256').update(JSON.stringify({jobId,modelId,purpose,messages,maxTokens,reasoning:model.reasoning,format:responseFormat(purpose)})).digest('hex');
    const cachedId=this.store.setting('paid-result:'+requestHash);
    if(/^[a-f0-9-]{36}$/.test(cachedId||'')){
      try{const cached=JSON.parse(fs.readFileSync(path.join(DATA,'model-results',cachedId+'.json'),'utf8'));if(cached.requestHash===requestHash&&cached.response?.choices?.[0]?.finish_reason!=='length'&&typeof cached.response?.usage?.cost==='number')return parseModelJSON(cached.response.choices[0].message.content);}catch{/* Missing/corrupt archives are not treated as cached results. */}
    }
    if(process.env.MODEL_CALLS_ENABLED==='false')throw Error('MODEL_CALLS_DISABLED: Cached responses remain available; new paid calls are blocked');
    if(Number(this.store.setting('model-cooldown:'+modelId)||0)>Date.now())throw new Error('Provider cooldown: recent rate limit; no new request charged');
    const key=this.getKey();if(!key)throw new Error('OpenRouter key is required');
    const format=responseFormat(purpose);
    const budgetMessages=format.type==='json_schema'?[...messages,{role:'system',content:JSON.stringify(format)}]:messages;
    const reserve=upperBound(budgetMessages,model,maxTokens), id=this.store.reserve(jobId,modelId,purpose,reserve);
    let raw;
    try {
      const response=await this.transport('https://openrouter.ai/api/v1/chat/completions',{
        method:'POST',signal:AbortSignal.any([AbortSignal.timeout(MODEL_TIMEOUT_MS),this.signalFor(jobId)]),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Title':'WinTech Preview Studio'},
        body:JSON.stringify({model:modelId,messages,max_tokens:maxTokens,stream:true,stream_options:{include_usage:true},plugins:[],response_format:format,
          provider:{sort:'price',require_parameters:true,allow_fallbacks:false,max_price:{prompt:model.input,completion:model.output,request:0}},
          usage:{include:true},reasoning:model.reasoning})
      });
      raw=await readCompletion(response);
      if(!response.ok || raw.error)throw new Error(`OpenRouter ${response.status}: ${String(raw.error?.message||'request failed').slice(0,240)}`);
    } catch(e) {this.store.uncertain(id,e.message);if(/OpenRouter 429/.test(e.message))this.store.setting('model-cooldown:'+modelId,String(Date.now()+120000));throw new Error(e.message.replaceAll(key,'[redacted]'));}
    // Never release a reservation unless the provider explicitly reports total cost.
    this.store.settle(id,typeof raw.usage?.cost==='number'?raw.usage.cost:null,{generation:raw.id,usage:raw.usage,model:raw.model});
    const archive=path.join(DATA,'model-results');fs.mkdirSync(archive,{recursive:true});
    fs.writeFileSync(path.join(archive,id+'.json'),JSON.stringify({purpose,model:modelId,requestHash,response:raw}));
    if(raw.choices?.[0]?.finish_reason==='length')throw new Error('Model output was truncated; paid request recorded');
    const content=raw.choices?.[0]?.message?.content;
    if(typeof content!=='string')throw new Error('Model returned no text; paid request recorded');
    const parsed=parseModelJSON(content);if(typeof raw.usage?.cost==='number')this.store.setting('paid-result:'+requestHash,id);return parsed;
  }
}



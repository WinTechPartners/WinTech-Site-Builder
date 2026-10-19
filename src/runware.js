import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ROOT,DATA} from './config.js';
import {safeFetch} from './network.js';

export function runwareConfig(){
 const file=path.join(ROOT,'.env'),text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
 const read=name=>{const value=text.match(new RegExp('^'+name+'=([^\\r\\n]*)','m'))?.[1]??process.env[name]??'';return value.trim().replace(/^["']|["']$/g,'');};
 let params;try{params=JSON.parse(read('RUNWARE_IMAGE_PARAMS_JSON')||'{"width":1536,"height":1024,"steps":16}');}catch{throw new Error('Invalid RUNWARE_IMAGE_PARAMS_JSON');}
 const enabled=read('RUNWARE_ENABLED')==='true',key=read('RUNWARE_API_KEY'),model=read('RUNWARE_MODEL_ID'),maximum=Number(read('RUNWARE_IMAGE_MAX_USD')||'.04');
 if(!Number.isFinite(maximum)||maximum<=0||maximum>.10)throw new Error('Runware image reservation must be greater than zero and at most $0.10');
 if(Object.keys(params).some(k=>!['width','height','steps','seed'].includes(k))||![params.width,params.height].every(n=>Number.isInteger(n)&&n>=128&&n<=1536&&n%16===0)||params.width*params.height>1572864||(params.steps!==undefined&&(!Number.isInteger(params.steps)||params.steps<1||params.steps>16)))throw new Error('Runware preview images are limited to 1.5MP, 16 steps, one output and no paid add-ons');
 return {enabled,key,model,maximum,params};
}

export async function generateHero(store,job,transport=fetch,download=safeFetch,signal,imageUpgrade=false){
 const cfg=runwareConfig();if(!cfg.enabled)return null;
 if(!cfg.key||!cfg.model)throw new Error('RUNWARE_SETUP_REQUIRED: Add RUNWARE_API_KEY and RUNWARE_MODEL_ID to .env');
 if(job.runwareTask?.asset)return job.runwareTask.asset;
 if(process.env.MODEL_CALLS_ENABLED==='false')throw Error('MODEL_CALLS_DISABLED: New image calls are blocked');
 const api=async task=>{
   if(signal?.aborted)throw new Error('CANCELLED: Stopped by user');
   const response=await transport('https://api.runware.ai/v1',{method:'POST',headers:{Authorization:`Bearer ${cfg.key}`,'Content-Type':'application/json'},body:JSON.stringify([task]),signal:signal?AbortSignal.any([AbortSignal.timeout(90000),signal]):AbortSignal.timeout(90000)});
   const value=await response.json();if(!response.ok||value.errors?.length)throw new Error('Runware request failed: '+String(value.errors?.[0]?.message||response.status).replaceAll(cfg.key,'[redacted]'));return value.data||[];
 };
 let record=job.runwareTask;
 if(!record){
   const prompt=String(job.artDirection?.imagePrompt||'').trim();if(prompt.length<80||prompt.length>5000)throw new Error('Runware image art direction is incomplete');
   const taskUUID=crypto.randomUUID(),call=store.reserve(job.id,'runware/'+cfg.model,'Original Runware hero image',Math.ceil(cfg.maximum*1e6),imageUpgrade);
   if(imageUpgrade)job.imageUpgrade.call=call;
   record=job.runwareTask={taskUUID,call,model:cfg.model,state:'submitted',params:cfg.params,prompt};store.save(job);
   // Journal before sending. An uncertain submission is polled by UUID, never
   // submitted a second time. No other image provider or model is substituted.
   try{const data=await api({taskType:'imageInference',taskUUID,model:cfg.model,positivePrompt:prompt,...cfg.params,numberResults:1,outputType:'URL',outputFormat:'WEBP',outputQuality:85,includeCost:true,deliveryMethod:'async'});record.response=data.find(r=>r.imageURL)||null;store.save(job);}catch(e){store.uncertain(call,e.message);record.state='uncertain';store.save(job);throw e;}
 }
 let result=record.response;
 for(let attempt=0;!result&&attempt<50;attempt++){
   if(attempt)await new Promise(r=>setTimeout(r,2000));
   const data=await api({taskType:'getResponse',taskUUID:record.taskUUID});result=data.find(r=>r.taskUUID===record.taskUUID&&r.imageURL)||null;
 }
 if(!result){store.uncertain(record.call,'Runware task still pending; poll the existing UUID on retry');throw new Error('Runware image is still pending; existing task and cost reservation retained');}
 store.settle(record.call,typeof result.cost==='number'?result.cost:null,{provider:'Runware',taskUUID:record.taskUUID,model:record.model,cost:result.cost});
 record.response=result;record.state='generated';store.save(job);
 const url=new URL(result.imageURL);if(url.protocol!=='https:'||!/(^|\.)runware\.ai$/.test(url.hostname))throw new Error('Runware returned an unexpected image origin');
 const image=await download(url.href,{maxBytes:6000000,accept:'image/webp,image/jpeg,image/png',timeout:30000});
 const ext=image.type.includes('webp')?'webp':image.type.includes('png')?'png':image.type.includes('jpeg')?'jpg':null;if(!ext)throw new Error('Runware result is not a supported image');
 const name=crypto.createHash('sha256').update(image.bytes).digest('hex').slice(0,16)+'.'+ext,dir=path.join(DATA,'previews',job.token,'assets');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),image.bytes);
 record.asset={src:`/p/${job.token}/assets/${name}`,alt:'Illustrative business technology photography — not company premises',width:record.params.width,height:record.params.height,synthetic:true,role:'hero',source:'Runware '+record.model};record.state='ready';store.save(job);return record.asset;
}

import fs from 'node:fs';import path from 'node:path';
import {DATA} from './config.js';import {parseModelJSON} from './openrouter.js';import {validateProfile} from './generate.js';
export function reusePaidProfile(store,job,previous,read=id=>JSON.parse(fs.readFileSync(path.join(DATA,'model-results',id+'.json'),'utf8'))){
 const candidates=previous?[previous]:[];
 for(const call of store.budget(job.id).calls.filter(c=>/company brief/i.test(c.purpose)&&c.state==='settled').reverse())try{const archive=read(call.id);if(archive.response?.choices?.[0]?.finish_reason!=='length')candidates.push(parseModelJSON(archive.response.choices[0].message.content));}catch{}
 for(const candidate of candidates)try{return validateProfile(candidate,job.research);}catch{}
 return null;
}

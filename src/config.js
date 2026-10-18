import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
else if(!process.env.BUILD_MODELS_JSON)process.loadEnvFile(path.join(ROOT,'.env.example'));
export const DATA = process.env.DATA_DIR || path.join(ROOT, '.data');
fs.mkdirSync(DATA, { recursive: true });
export function parseModels(raw){
  let values;try{values=JSON.parse(raw);}catch{throw new Error('BUILD_MODELS_JSON must be a JSON array in .env');}
  if(!Array.isArray(values)||values.length<1||values.length>16)throw new Error('Configure between 1 and 16 build models');
  const seen=new Set();
  return Object.freeze(values.map(m=>{
    if(typeof m.id!=='string'||!/^[-a-zA-Z0-9_.]+\/[-a-zA-Z0-9_.:]+$/.test(m.id)||seen.has(m.id))throw new Error('Each build model needs a unique provider/model ID');
    if(!Number.isFinite(m.input)||!Number.isFinite(m.output)||m.input<=0||m.output<=0||m.input>100||m.output>100)throw new Error('Every build model needs positive input/output price ceilings in dollars per million tokens');
    const reasoning=m.reasoning||{effort:'low'};
    if(typeof reasoning!=='object'||reasoning===null||Array.isArray(reasoning)||!((reasoning.enabled===false&&Object.keys(reasoning).length===1)||(typeof reasoning.effort==='string'&&['none','minimal','low','medium','high','xhigh','max'].includes(reasoning.effort)&&Object.keys(reasoning).length===1)))throw new Error('Model reasoning must be {"enabled":false} or {"effort":"low"} (or another supported effort)');
    seen.add(m.id);return Object.freeze({id:m.id,name:typeof m.name==='string'?m.name:m.id.split('/').at(-1),input:m.input,output:m.output,reasoning:Object.freeze(reasoning)});
  }));
}
export const MODELS = parseModels(process.env.BUILD_MODELS_JSON);
export const COPY_AUDIT_MODEL=process.env.COPY_AUDIT_MODEL||MODELS[0].id;
export const DESIGN_AUDIT_MODEL=process.env.DESIGN_AUDIT_MODEL||COPY_AUDIT_MODEL;
export const DESIGN_REVIEW_MODELS=Object.freeze(JSON.parse(process.env.DESIGN_REVIEW_MODELS_JSON||JSON.stringify([DESIGN_AUDIT_MODEL])));
if(!Array.isArray(DESIGN_REVIEW_MODELS)||!DESIGN_REVIEW_MODELS.length||DESIGN_REVIEW_MODELS.length>5||DESIGN_REVIEW_MODELS.some(id=>!MODELS.some(m=>m.id===id))||new Set(DESIGN_REVIEW_MODELS).size!==DESIGN_REVIEW_MODELS.length)throw new Error('DESIGN_REVIEW_MODELS_JSON must be unique IDs from the configured build pool');
export const DESIGN_REVIEW_MAX_TOKENS=Number(process.env.DESIGN_REVIEW_MAX_TOKENS||4500);
if(!Number.isSafeInteger(DESIGN_REVIEW_MAX_TOKENS)||DESIGN_REVIEW_MAX_TOKENS<1800||DESIGN_REVIEW_MAX_TOKENS>6000)throw new Error('DESIGN_REVIEW_MAX_TOKENS must be between 1800 and 6000');
export const DESIGN_REPAIR_MODEL=process.env.DESIGN_REPAIR_MODEL||DESIGN_AUDIT_MODEL;
export const COPY_AUDIT_FALLBACK_MODEL=process.env.COPY_AUDIT_FALLBACK_MODEL||DESIGN_REPAIR_MODEL;
if(!MODELS.some(m=>m.id===COPY_AUDIT_FALLBACK_MODEL))throw new Error('COPY_AUDIT_FALLBACK_MODEL must be in BUILD_MODELS_JSON');
export const DESIGN_AUDIT_FALLBACK_MODEL=process.env.DESIGN_AUDIT_FALLBACK_MODEL||DESIGN_AUDIT_MODEL;
if(!MODELS.some(m=>m.id===DESIGN_AUDIT_FALLBACK_MODEL))throw new Error('DESIGN_AUDIT_FALLBACK_MODEL must be in BUILD_MODELS_JSON');
if(!MODELS.some(m=>m.id===DESIGN_REPAIR_MODEL))throw new Error('DESIGN_REPAIR_MODEL must be in BUILD_MODELS_JSON');
export const DESIGN_REPAIR_MODELS=Object.freeze(JSON.parse(process.env.DESIGN_REPAIR_MODELS_JSON||JSON.stringify([DESIGN_REPAIR_MODEL])));
export const DESIGN_RECONSTRUCTION_MODEL=process.env.DESIGN_RECONSTRUCTION_MODEL||DESIGN_AUDIT_MODEL;
if(!MODELS.some(m=>m.id===DESIGN_RECONSTRUCTION_MODEL))throw new Error('DESIGN_RECONSTRUCTION_MODEL must be in BUILD_MODELS_JSON');
if(!Array.isArray(DESIGN_REPAIR_MODELS)||!DESIGN_REPAIR_MODELS.length||DESIGN_REPAIR_MODELS.length>16||DESIGN_REPAIR_MODELS.some(id=>!MODELS.some(m=>m.id===id)))throw new Error('DESIGN_REPAIR_MODELS_JSON must contain configured vision-capable build model IDs');
if(!MODELS.some(m=>m.id===DESIGN_AUDIT_MODEL))throw new Error('DESIGN_AUDIT_MODEL must be in BUILD_MODELS_JSON');
if(!MODELS.some(m=>m.id===COPY_AUDIT_MODEL))throw new Error('COPY_AUDIT_MODEL must be in BUILD_MODELS_JSON so its costs use the same budget controls');
export const BUDGET_MICRO = 500_000;
export const BUILD_MAX_ATTEMPTS=Number(process.env.BUILD_MAX_ATTEMPTS||6);
if(!Number.isSafeInteger(BUILD_MAX_ATTEMPTS)||BUILD_MAX_ATTEMPTS<1||BUILD_MAX_ATTEMPTS>8)throw new Error('BUILD_MAX_ATTEMPTS must be between 1 and 8');
export const BUILD_MAX_TOKENS=Number(process.env.BUILD_MAX_TOKENS||24000);
if(!Number.isSafeInteger(BUILD_MAX_TOKENS)||BUILD_MAX_TOKENS<8000||BUILD_MAX_TOKENS>40000)throw new Error('BUILD_MAX_TOKENS must be between 8000 and 40000');
export const MODEL_TIMEOUT_MS=Number(process.env.MODEL_TIMEOUT_MS||480000);
if(!Number.isSafeInteger(MODEL_TIMEOUT_MS)||MODEL_TIMEOUT_MS<30000||MODEL_TIMEOUT_MS>900000)throw new Error('MODEL_TIMEOUT_MS must be between 30000 and 900000');
export const PORT = Number(process.env.PORT || 4173);
export const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 4174);
export const PREVIEW_ORIGIN = (process.env.PREVIEW_ORIGIN || `http://localhost:${PREVIEW_PORT}`).replace(/\/$/, '');
export const HOST = process.env.HOST || '127.0.0.1';

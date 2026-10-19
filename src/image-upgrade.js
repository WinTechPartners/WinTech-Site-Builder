import crypto from 'node:crypto';
import {generateHero,runwareConfig} from './runware.js';
import {verifySavedDraft} from './free-verifier.js';
import {editorialDirection} from './editorial-design.js';

export const IMAGE_DIRECTION_VERSION=3;
export function serviceImagePrompt(job){
 const names=(job.profile?.services||job.profile?.serviceInventory||[]).map(s=>typeof s==='string'?s:s.name).filter(Boolean);
 const security=/cyber|risk|compliance/i.test(names.join(' '));
 const scenes=security?[
  'A beautifully composed close-up of a physical enterprise security appliance and structured fiber patching, with finely machined ventilation, carefully routed cables and a softly defocused equipment cabinet behind it. Deep ink shadows and restrained warm edge lighting.',
  'An editorial macro photograph of precisely terminated optical fiber connectors and a secure network gateway in a clean equipment rack. Layered depth, tactile brushed aluminum, subtle green light reflections and rich charcoal shadows.'
 ]:[
  'An architectural editorial photograph of meticulously organized business network infrastructure: a compact equipment rack, expertly routed blue and white patch cables, brushed aluminum switches and optical fiber connections. Natural side light and restrained warm highlights.',
  'A cinematic editorial photograph of a modern business technology workspace, focusing on a beautifully detailed wireless access point and foreground network cabling with a soft-focus collaboration space beyond. Quiet daylight, rich material textures, no people or legible screens.',
  'A premium macro editorial photograph of structured network cabling and optical fiber connected to professional switching equipment. Copper, graphite and blue materials, tangible engineering precision, dramatic soft side light and a sophisticated shallow depth of field.'
 ];
 const index=parseInt(crypto.createHash('sha256').update(job.url||job.id).digest('hex').slice(0,8),16)%scenes.length;
 return `Full-frame professional editorial photograph, edge-to-edge photographic content. ${editorialDirection(job).scene||scenes[index]} Realistic physical proportions, natural light, excellent tonal separation, crisp focal detail, sophisticated commercial art direction. Compose the main subject in the central safe crop. A photograph only: no typography, letters, words, printed documents, captions, sidebars, graphic panels, watermarks or layout design. No people, logos, readable screens, glowing icons, floating sculpture, shields or padlocks.`;
}

export async function upgradeImages(store,job){
 const cfg=runwareConfig();
 if(!cfg.enabled||!cfg.key||cfg.model!=='bfl:flux@3-image-klein'||cfg.maximum>.04)throw Error('Runware must be enabled with bfl:flux@3-image-klein and a reservation at most $0.04');
 if(job.imageUpgrade?.version===IMAGE_DIRECTION_VERSION&&job.imageUpgrade.state==='complete')return job.imageUpgrade;
 if(!job.imageUpgrade||job.imageUpgrade.version!==IMAGE_DIRECTION_VERSION){
  if(store.budget(job.id).remaining<cfg.maximum)throw Error('BUDGET_CAP: Existing total cap cannot fund the image reservation');
  job.imageUpgrade={version:IMAGE_DIRECTION_VERSION,state:'running',model:cfg.model,before:store.budget(job.id).accounted,previousTask:job.runwareTask,previousDirection:job.artDirection,oldSources:(job.assets||[]).filter(a=>a.synthetic).map(a=>a.src)};
  if(job.runwareTask)(job.runwareHistory||=[]).push(job.runwareTask);
  job.runwareTask=null;job.artDirection={...job.artDirection,imagePrompt:serviceImagePrompt(job)};store.save(job);
 }
 job.imageUpgrade.state='running';store.save(job);
 store.event(job,'Creating service-relevant Runware photography','One bounded replacement; existing pages, logo, vendors and cumulative budget retained');
 const asset=await generateHero(store,job,fetch,undefined,undefined,true);
 asset.alt='Illustrative business technology photography — not company premises';
 job.assets=[asset,...(job.assets||[]).filter(a=>a.src!==asset.src).map(a=>a.synthetic?{...a,role:'previous-concept'}:a)];
 job.imageReplacements=Object.fromEntries(job.imageUpgrade.oldSources.map(src=>[src,asset.src]));
 job.imageUpgrade.asset=asset;store.save(job);
 await verifySavedDraft(store,job);
 if(job.latestScan.issues.length)throw Error('New imagery retained for review; browser checks must pass before public replacement');
 job.imageUpgrade={...job.imageUpgrade,state:'complete',cost:store.budget(job.id).accounted-job.imageUpgrade.before,completed:new Date().toISOString()};
 store.event(job,'Runware imagery ready','Saved pages reused; browser checks passed; public publisher will update automatically');
 return job.imageUpgrade;
}

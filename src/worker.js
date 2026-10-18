import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MODELS,DATA,PREVIEW_ORIGIN,BUILD_MAX_TOKENS,BUILD_MAX_ATTEMPTS,DESIGN_REPAIR_MODELS,DESIGN_RECONSTRUCTION_MODEL } from './config.js';
import { research } from './research.js';
import { evidencePacket,validateProfile,creativeDirection,PROFILE_SYSTEM,buildMessages,validateSite,auditClaims } from './generate.js';
import {preserveVendors} from './vendors.js';
import {coverageCheck,CONTENT_CONTRACT_VERSION} from './content-contract.js';
import { collectAssets,renderSite } from './render-site.js';
import { scanSite } from './checks.js';
import { DESIGN_VERSION,directDesign,reviewDesign,visualRepairContext,prepareHeroReference,initialVisualContext } from './design.js';
import { runwareConfig,generateHero } from './runware.js';
import {publishApproved,autoReady} from './public-site.js';
import {refinementMessages,applyRefinement} from './refine.js';
import {reconstructionMessages,applyReconstruction} from './reconstruct.js';

export function shuffledModels(){const list=MODELS.map(m=>m.id);for(let i=list.length-1;i>0;i--){const j=crypto.randomInt(i+1);[list[i],list[j]]=[list[j],list[i]];}return list;}
export function similarity(css,others){const tokens=s=>new Set(String(s).toLowerCase().match(/[a-z][a-z-]{2,}|#[a-f0-9]{3,8}|\d+(?:px|rem|vh|vw)/g)||[]);const a=tokens(css);let best=0;for(const other of others){const b=tokens(other);const union=new Set([...a,...b]);const intersection=[...a].filter(x=>b.has(x)).length;if(union.size)best=Math.max(best,intersection/union.size);}return best;}
export class Worker {
  cancel(id){const job=this.currentJob?.id===id?this.currentJob:this.store.get(id);if(!job)return null;job.cancelRequested=true;this.router.cancel?.(id);job.state=this.currentJob?.id===id?'cancelling':'cancelled';this.store.event(job,'Stopping at your request','Upstream requests aborted; uncertain charges and generated snapshots retained');return job;}
  checkpoint(job){if(job.cancelRequested)throw new Error('CANCELLED: Stopped by user');}
  async refreshConcept(job){
    job.conceptRefresh||={stage:'brief'};this.store.save(job);
    if(job.conceptRefresh.stage==='brief'){
      this.store.event(job,'Replacing the failed visual concept','One bounded creative reset; existing research, facts and cumulative budget retained');
      job.conceptRefresh.direction=await this.direct(this.router,job,true);job.conceptRefresh.stage='image';this.store.save(job);
    }
    job.artDirection=job.conceptRefresh.direction;
    if(job.conceptRefresh.stage==='image'){
      if(runwareConfig().enabled){
        if(job.runwareTask?.asset&&!job.conceptRefresh.archived){(job.runwareHistory||=[]).push(job.runwareTask);job.runwareTask=null;job.conceptRefresh.archived=true;this.store.save(job);}
        const image=await generateHero(this.store,job,fetch,undefined,this.router.signalFor?.(job.id));
        if(image)job.assets=[image,...job.assets.filter(a=>a.src!==image.src).map(a=>a.synthetic&&a.role==='hero'?{...a,role:'previous-concept'}:a)];
      }
      await prepareHeroReference(job);
      job.conceptRefresh.stage='done';job.visualProgress=[];job.visualStalls=0;
      job.repairFeedback=[...(job.repairFeedback||[]),'STRUCTURAL REDESIGN REQUIRED: Execute the NEW art direction, replacing the failed hero composition and weak section structure. Use the newly supplied role:hero image; older previous-concept imagery is reference only. Make substantial HTML structure changes, not just cosmetic CSS. Preserve source-backed copy and all working routes.'];this.store.save(job);
    }
  }
  constructor(store,router,dependencies={}){this.store=store;this.router=router;this.busy=false;this.research=dependencies.research||research;this.assets=dependencies.assets||collectAssets;this.scan=dependencies.scan||scanSite;this.audit=dependencies.audit||auditClaims;this.direct=dependencies.direct||directDesign;this.review=dependencies.review||reviewDesign;}
  async tick(){
    if(process.env.WORKER_ENABLED==='false')return;
    if(this.busy)return;
    const imageConfig=runwareConfig();const job=this.store.list().reverse().find(j=>this.store.paidEligible(j)&&(j.state==='queued'||(j.state==='awaiting_key'&&this.router.getKey())||(j.state==='awaiting_images'&&imageConfig.key&&imageConfig.model)));if(!job)return;
    this.busy=true;
    try{await this.run(job);}catch(e){job.state=job.cancelRequested||/CANCELLED/.test(e.message)?'cancelled':'failed';job.error=e.message;this.store.event(job,job.state==='cancelled'?'Stopped by you':'Stopped automatically',e.message);}finally{this.busy=false;this.currentJob=null;}
  }
  async run(job){
    const start=Date.now();this.currentJob=job;job.cancelRequested=false;this.router.resume?.(job.id);job.error=null;job.preview=null;
    if(job.research&&(job.research.version!==4||!Array.isArray(job.research.sources?.[0]?.emails))){job.research=null;job.profile=null;job.assetContractVersion=null;this.store.event(job,'Refreshing source coverage','Refreshing original identity, vendor, service and industry evidence. Existing paid artwork and cumulative cost ledger retained.');}
    job.modelOrder=job.modelOrder.filter(id=>MODELS.some(m=>m.id===id));
    for(const model of MODELS)if(!job.modelOrder.includes(model.id))job.modelOrder.push(model.id);
    if(!job.research){job.state='researching';this.store.event(job,'Researching the company','Reading public company pages, profiles and search results');job.research=await this.research(job.url,p=>this.store.event(job,'Researching the company',p));this.store.save(job);}
    const unread=(job.research.corePages||[]).filter(p=>p.essential&&!p.read);if(unread.length)throw Error('SOURCE_COVERAGE_INCOMPLETE: Required company pages could not be read; no generation or image charge started. '+unread.map(p=>p.url).join(', '));
    if(!this.router.getKey()){job.state='awaiting_key';this.store.event(job,'Research saved — waiting for OpenRouter connection','Add the key once in Setup. Generation will continue automatically. No model credits spent.');return;}
    this.checkpoint(job);
    if(!job.profile){
      job.state='generating';this.store.event(job,'Preserving the company voice','Extracting source-backed facts and exact phrases');
      let lastError;
      for(const model of job.modelOrder){try{const brief=await this.router.call(job.id,model,'Source-backed company brief',[{role:'system',content:PROFILE_SYSTEM},{role:'user',content:JSON.stringify(evidencePacket(job.research))}],4500);job.profile=validateProfile(brief,job.research);break;}catch(e){lastError=e;if(/BUDGET_CAP|BILLING_ANOMALY/.test(e.message))throw e;this.store.event(job,'Trying another researcher',e.message);}}
      if(!job.profile)throw lastError||new Error('Company research could not be verified');this.store.save(job);
    }
    if(!job.assets){this.store.event(job,'Preparing company imagery','Using available original website images');job.assets=await this.assets(job,job.research);job.assetContractVersion=CONTENT_CONTRACT_VERSION;this.store.save(job);}
    if(job.assetContractVersion!==CONTENT_CONTRACT_VERSION){const fresh=await this.assets(job,job.research);job.assets=[...fresh,...job.assets.filter(a=>!fresh.some(f=>f.src===a.src))];job.assetContractVersion=CONTENT_CONTRACT_VERSION;this.store.save(job);}
    if(job.research.images?.some(a=>a.role==='logo')&&!job.assets.some(a=>a.role==='logo'))throw Error('ORIGINAL_LOGO_UNAVAILABLE: Source logo could not be downloaded. Paid art direction and generation deferred.');
    job.direction=job.direction||creativeDirection(job.url);this.store.save(job);
    const imageConfig=runwareConfig();
    this.checkpoint(job);
    if(imageConfig.enabled&&(!imageConfig.key||!imageConfig.model)){job.state='awaiting_images';this.store.event(job,'Waiting for Runware connection','Add the Runware API key in .env; generation resumes automatically on the same ledger.');return;}
    if(!job.artDirection||(imageConfig.enabled&&!job.artDirection?.imagePrompt)){job.state='generating';this.store.event(job,'Creating a company-specific visual concept','Art direction, typography, hero imagery and section composition');job.artDirection=await this.direct(this.router,job);this.store.save(job);}
    this.checkpoint(job);
    if(imageConfig.enabled&&!job.assets.some(a=>a.synthetic&&a.role==='hero')){job.state='generating';this.store.event(job,'Generating original Runware imagery',`${imageConfig.model}; one image, shared original prospect budget`);const asset=await generateHero(this.store,job,fetch,undefined,this.router.signalFor?.(job.id));if(asset)job.assets=[asset,...job.assets];this.store.save(job);}
    let feedback=job.repairFeedback||null,previous=null,builderIndex=0;
    if(job.repairCandidate&&/^candidate-(?:\d+|free-verified)\.json$/.test(job.repairCandidate))try{previous=JSON.parse(fs.readFileSync(path.join(DATA,'previews',job.token,job.repairCandidate),'utf8'));}catch{}
    let attemptLimit=job.reconstructionPending?Math.min(8,BUILD_MAX_ATTEMPTS+2):BUILD_MAX_ATTEMPTS;
    for(let attempt=0;attempt<attemptLimit;attempt++){
      this.checkpoint(job);
      if((job.conceptRefresh&&job.conceptRefresh.stage!=='done')||(!job.conceptRefresh&&job.visualStalls>=1&&job.visualReview?.score<7.5)){await this.refreshConcept(job);feedback=job.repairFeedback;}
      const visualRepair=feedback&&previous&&feedback.some(s=>/Visual scores:|STRUCTURAL REDESIGN/.test(s));
      const model=job.reconstructionPending?DESIGN_RECONSTRUCTION_MODEL:visualRepair?DESIGN_REPAIR_MODELS[(job.visualRepairCalls||0)%DESIGN_REPAIR_MODELS.length]:job.modelOrder[builderIndex%job.modelOrder.length];job.model=model;if(!job.resumeCandidate)job.attempts++;job.state=attempt?'repairing':'generating';
      this.store.event(job,attempt?'Automatically improving the preview':'Designing a distinct website',`${MODELS.find(m=>m.id===model).name} · attempt ${attempt+1} of ${attemptLimit}`);
      try{
        let candidate;
        if(job.resumeCandidate){const name=job.resumeCandidate;if(!/^candidate-(?:\d+|free-verified)\.json$/.test(name))throw new Error('Invalid saved candidate');candidate=JSON.parse(fs.readFileSync(path.join(DATA,'previews',job.token,name),'utf8'));delete job.resumeCandidate;this.store.event(job,'Resuming saved candidate checks','Reusing generated pages without another builder charge');}
        else if(job.reconstructionPending&&previous){
          job.reconstructionPending=false;job.homeReconstructed=true;this.store.save(job);
          candidate=applyReconstruction(previous,await this.router.call(job.id,DESIGN_RECONSTRUCTION_MODEL,'Homepage reconstruction',reconstructionMessages(job,previous,visualRepairContext(job)),14000),job);
          job.visualProgress=[];job.visualStalls=0;this.store.save(job);
        }
        else if(feedback&&previous){
          if(visualRepair)job.visualRepairCalls=(job.visualRepairCalls||0)+1;
          const context=visualRepair?{...visualRepairContext(job),redesign:job.conceptRefresh?.stage==='done'&&!job.conceptRefresh.repaired}:null;
          candidate=applyRefinement(previous,await this.router.call(job.id,model,'Targeted code refinement',refinementMessages(job.profile,job.artDirection,job.assets,feedback,previous,context),12000),feedback);
          if(context?.redesign)job.conceptRefresh.repaired=true;
        }
        else {await prepareHeroReference(job);candidate=await this.router.call(job.id,model,'Initial website generation',buildMessages(job.profile,job.direction,job.assets,feedback,previous,job.artDirection,initialVisualContext(job)),BUILD_MAX_TOKENS);}
        const site=validateSite(candidate,job.assets);
        site.responsiveFoundation=true;
        const home=site.pages.find(p=>p.slug==='');home.body=preserveVendors(home.body,job,job.assets);
        this.checkpoint(job);
        previous=site;job.state='checking';this.store.event(job,'Checking the finished pages','WinTech rules, desktop/mobile rendering and independent factual review');
        let rendered=renderSite(job,site,job.assets);
        fs.writeFileSync(path.join(DATA,'previews',job.token,`candidate-${job.attempts}.json`),JSON.stringify(site));
        let scan=await this.scan(job,rendered);
        const contrastGroups=new Map();for(const check of scan.browser?.checks||[])for(const item of check.metrics?.contrast||[]){if(!item.selector||!item.correctedColor)continue;const key=check.page+'|'+item.selector;const group=contrastGroups.get(key)||{page:check.page,selector:item.selector,colors:new Set()};group.colors.add(item.correctedColor);contrastGroups.set(key,group);}
        const corrections=[...contrastGroups.values()].filter(g=>g.colors.size===1).map(g=>({page:g.page,selector:g.selector,color:[...g.colors][0]}));
        const fontCorrections=[...new Map((scan.browser?.checks||[]).flatMap(c=>(c.metrics?.smallTextDetails||[]).filter(f=>f.selector).map(f=>[c.page+'|'+f.selector,{page:c.page,...f}]))).values()];
        const gutterCorrections=[...new Map((scan.browser?.checks||[]).flatMap(c=>(c.metrics?.textGutters||[]).filter(f=>f.selector).map(f=>[c.page+'|'+f.selector,{page:c.page,...f}]))).values()];
        if(corrections.length||fontCorrections.length||gutterCorrections.length){site.readingGutterCorrections=[...(site.readingGutterCorrections||[]),...gutterCorrections];site.contrastCorrections=[...(site.contrastCorrections||[]),...corrections];site.fontSizeCorrections=[...(site.fontSizeCorrections||[]),...fontCorrections];this.store.event(job,'Correcting measured text readability',`${corrections.length} contrast and ${fontCorrections.length} small-text and ${gutterCorrections.length} reading-gutter adjustments; authored type hierarchy and copy preserved; no model call`);rendered=renderSite(job,site,job.assets);scan=await this.scan(job,rendered);fs.writeFileSync(path.join(DATA,'previews',job.token,`candidate-${job.attempts}.json`),JSON.stringify(site));}
        job.latestScan=scan;
        const renderedSite={pages:site.pages.map(p=>({...p,body:fs.readFileSync(path.join(rendered.dir,(p.slug||'index')+'.html'),'utf8')}))};
        job.contentCoverage=coverageCheck(job,renderedSite);
        if(!job.firstPass){job.firstPass={scores:scan.report.scores,verified:scan.report.verified,issues:scan.issues,at:new Date().toISOString()};}
        this.checkpoint(job);
        if(autoReady(job)){
          job.state='provisional';job.preview=`${PREVIEW_ORIGIN}/p/${job.token}/`;job.designCss=site.css;job.durationMs=Date.now()-start;
          this.store.event(job,'Scanner target passed',`WinTech ${scan.report.scores.overall}/100; all browser checks passed. Publishing concept automatically without paid review or repair calls.`);
          await publishApproved(this.store,job);return;
        }
        const copyHash=crypto.createHash('sha256').update(JSON.stringify({contentContract:CONTENT_CONTRACT_VERSION,pages:site.pages,profile:job.profile,sources:job.research.sources,assets:job.assets})).digest('hex');
        const cachedAudit=job.claimAuditCache?.hash===copyHash?job.claimAuditCache.audit:null;
        const canAudit=!scan.issues.length&&job.contentCoverage.passed;
        const audit=canAudit?(cachedAudit||await this.audit(this.router,job,site,job.profile)):{unsupportedClaims:[],voiceIssues:[],contentIssues:[],deferred:true};this.checkpoint(job);
        if(!Array.isArray(audit.unsupportedClaims)||!Array.isArray(audit.voiceIssues)||!Array.isArray(audit.contentIssues))throw new Error('Independent copy audit returned incomplete results');
        const auditIssues=[...job.contentCoverage.issues,...audit.unsupportedClaims,...audit.voiceIssues,...(audit.contentIssues||[])].slice(0,30);job.contentCoverage.useful=canAudit&&audit.contentIssues.length===0;job.contentCoverage.passed=job.contentCoverage.passed&&job.contentCoverage.useful;job.claimAudit=audit;if(canAudit)job.claimAuditCache={hash:copyHash,audit};
        if(cachedAudit&&canAudit)this.store.event(job,'Reusing verified copy','Content, evidence and assets are unchanged; no repeat copy-audit charge');
        const otherCSS=this.store.list().filter(j=>j.id!==job.id && j.designCss).slice(0,30).map(j=>j.designCss);
        const overlap=similarity(site.css,otherCSS);job.designSimilarity=overlap;
        const issues=[...scan.issues,...auditIssues];
        if(!issues.length){this.store.event(job,'Reviewing the rendered design','Independent visual assessment of desktop, continuation and mobile screenshots');const visualHash=crypto.createHash('sha256').update(JSON.stringify({evidenceVersion:5,pages:site.pages,css:site.css,contrast:site.contrastCorrections||[],fonts:site.fontSizeCorrections||[],gutters:site.readingGutterCorrections||[],assets:job.assets,profile:job.profile})).digest('hex');const cachedVisual=job.visualReviewCache?.hash===visualHash?job.visualReviewCache.review:null;job.visualReview=cachedVisual||await this.review(this.router,job);this.checkpoint(job);job.visualReviewCache={hash:visualHash,review:job.visualReview};if(cachedVisual)this.store.event(job,'Reusing unchanged visual assessment','Candidate is identical; prior independent grades retained without another model charge');this.store.save(job);if(!job.visualReview.passed)issues.push(...(job.visualReview.issues.length?job.visualReview.issues:['Visual execution is below the premium design threshold. Strengthen composition, typography, distinctiveness, polish and mobile layout.']),`Visual scores: ${JSON.stringify(job.visualReview.scores)}. Target average 8.5/10, no dimension below 8. Execute the art direction with stronger craft.`);}
        if(!scan.issues.length&&!auditIssues.length&&job.visualReview&&!job.visualReview.passed){
          const history=job.visualProgress||(job.visualProgress=[]);history.push({attempt:job.attempts,score:job.visualReview.score});
          const recent=history.slice(-3);
          if(recent.length===3&&recent[2].score<=recent[0].score+0.2){
            job.visualStalls=(job.visualStalls||0)+1;job.visualProgress=[];
            if(job.visualStalls>=2){
              if(!job.homeReconstructed){job.reconstructionPending=true;attemptLimit=Math.min(8,BUILD_MAX_ATTEMPTS+2);this.store.event(job,'Reconstructing the stalled homepage','One fresh composition from verified facts and existing artwork; no new research or image purchase');}
              else{this.store.save(job);throw new Error('DESIGN_STALLED: Two structural repair cycles failed to improve visual quality. Paid generation stopped; research, imagery and candidates retained.');}
            }
            builderIndex++;issues.push('STRUCTURAL REDESIGN REQUIRED: Repeated cosmetic edits have not improved the screenshots. Replace the weak section composition and its HTML grid, rather than adjusting borders, shadows or button accents. Resolve empty grid cells, explicitly place every direct grid child, integrate the photo at an intentional scale, and make the mobile first screen show its primary action. Preserve verified copy and existing paid imagery.');
          }
        }
        if(overlap>0.90)issues.push('This design is too similar to a previous preview. Change composition, typography, spacing, palette and navigation treatment.');
        fs.writeFileSync(path.join(DATA,'previews',job.token,`attempt-${job.attempts}.json`),JSON.stringify({site,scan,audit,visualReview:job.visualReview,similarity:overlap},null,2));
        job.changeNotes=Array.isArray(site.changes)?site.changes.filter(s=>typeof s==='string').slice(0,8):[];this.store.save(job);
        if(!issues.length){
          job.state=scan.report.verified?'ready':'provisional';job.preview=`${PREVIEW_ORIGIN}/p/${job.token}/`;job.designCss=site.css;job.designRationale=String(site.designRationale||'').slice(0,1000);job.durationMs=Date.now()-start;
          this.store.event(job,scan.report.verified?'Preview ready':'Local preview ready — external scan pending',scan.report.verified?`WinTech ${scan.report.scores.overall}/100; browser and copy checks passed`:'HTML, browser and copy checks passed. HTTPS/PageSpeed require public hosting.');
          try{const publication=await publishApproved(this.store,job);if(publication)this.store.event(job,'Public preview ready',publication.url);}catch(error){job.publication={...job.publication,state:'pending',error:String(error.message).slice(0,500)};this.store.event(job,'Public publication pending','Checked local preview retained. '+String(error.message).slice(0,300));}
          return;
        }
        feedback=issues;job.repairFeedback=issues;job.repairCandidate=`candidate-${job.attempts}.json`;this.store.event(job,'Automatic checks requested changes',issues.slice(0,8).join(' · '));
      }catch(e){
          if(job.cancelRequested||/BUDGET_CAP|BILLING_ANOMALY|CANCELLED|DESIGN_STALLED|Prompt too large|bounded low-detail/.test(e.message))throw e;
        feedback=[...(feedback||[]),e.message].slice(-20);builderIndex++;this.store.event(job,'Trying the next approved builder',e.message);
      }
    }
    throw new Error(`Quality checks still failing after ${BUILD_MAX_ATTEMPTS} attempts: ${(feedback||[]).slice(0,5).join('; ')}`);
  }
}


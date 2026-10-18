import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { load } from 'cheerio';
import { PREVIEW_ORIGIN, PREVIEW_PORT, DATA, ROOT } from './config.js';
import {localReadiness} from './readiness.js';
const require=createRequire(import.meta.url);
export const scanner=require('../vendor/scanner/scanner.cjs');
export const securityHeaders={
  'Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'; font-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security':'max-age=31536000; includeSubDomains',
  'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'X-Robots-Tag':'noindex, nofollow, noarchive','Cache-Control':'no-store'
};
export function htmlCheck(html,url,available) {
  const signals=scanner.extractHtmlSignals(html,url), $=load(html), issues=[];
  if(signals.seo.h1.count!==1)issues.push('Use exactly one H1');
  if(!signals.seo.headingHierarchy)issues.push('Fix skipped heading levels');
  if(signals.seo.title.length<10 || signals.seo.title.length>60)issues.push('SEO title must be 10–60 characters');
  if(signals.seo.h2.count<3)issues.push('Add at least three useful H2 sections');
  if(signals.accessibility.formFields && signals.accessibility.labeledFields<signals.accessibility.formFields)issues.push('Label every form field');
  if(signals.accessibility.genericLinkText)issues.push('Give each link descriptive visible text');
  if(!signals.accessibility.landmarks)issues.push('Use semantic landmarks');
  if(!signals.seo.viewport || !signals.seo.canonical.exists || !signals.seo.metaDescription.exists)issues.push('Complete page metadata');
  if(!signals.aeo.organizationSchema)issues.push('Organization schema is missing');
  $('a[href]').each((_,el)=>{const href=$(el).attr('href');if(href.startsWith('#')){if(href.length>1 && !$(href).length)issues.push(`Missing anchor ${href}`);return;}try{const u=new URL(href,url);if(u.origin===new URL(url).origin){const slug=u.pathname.split('/').slice(3).join('/').replace(/\/$/,'');if(!available.includes(slug))issues.push(`Broken internal link ${href}`);}}catch{issues.push('Malformed link');}});
  $('img').each((_,el)=>{if(!$(el).attr('alt'))issues.push('Meaningful images need descriptive alt text');if(!$(el).attr('width')||!$(el).attr('height'))issues.push('Images need dimensions to avoid layout shift');});
  return {signals,issues:[...new Set(issues)]};
}
export function localReport(home,url) {
  const html=scanner.extractHtmlSignals(home,url);
  const sec={hsts:securityHeaders['Strict-Transport-Security'],csp:securityHeaders['Content-Security-Policy'],xFrame:'DENY',xContentType:'nosniff',referrerPolicy:'no-referrer',permissionsPolicy:securityHeaders['Permissions-Policy']};
  const data={html,ssl:{valid:false},headers:{security:sec},robots:{exists:true},sitemap:{exists:true},observatory:{...scanner.computeHeaderGrade(sec,{valid:false}),source:'computed'},pagespeed:{error:'Public HTTPS PageSpeed measurement unavailable in local mode'},llmsTxt:{exists:true},securityTxt:{exists:true}};
  const scores=scanner.calculateScores(data);
  return {scores,readiness:localReadiness(html,scores),findings:scanner.generateFindings(data),measurement:'local HTML and configured headers; SSL and Lighthouse are unverified',verified:false};
}
let browserPromise;
export async function getBrowser(){
  if(browserPromise)return browserPromise;
  browserPromise=(async()=>{
    const {default:puppeteer}=await import('puppeteer');
    const candidates=[process.env.CHROME_EXECUTABLE_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome-stable'];
    const executablePath=candidates.find(p=>p&&fs.existsSync(p));
    return puppeteer.launch({...(executablePath?{executablePath}:{}),headless:true,timeout:20000,protocolTimeout:20000,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
  })();
  try{return await browserPromise;}catch(e){browserPromise=null;throw e;}
}
export async function closeBrowser(){if(browserPromise){try{await(await browserPromise).close();}catch{}browserPromise=null;}}
export async function browserCheck(job,pages){
  const browser=await getBrowser(), checks=[], screenshots=[];
  for(const slug of pages.filter(s=>!['privacy','terms'].includes(s))){
    const documentUrl=`${PREVIEW_ORIGIN}/p/${job.token}/${slug}`;
    const response=await fetch(`http://127.0.0.1:${PREVIEW_PORT}/p/${job.token}/${slug}`,{signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Preview HTTP '+response.status);
    const html=await response.text();
    const expected=fs.readFileSync(path.join(DATA,'previews',job.token,(slug||'index')+'.html'),'utf8');
    if(html!==expected)throw Error('Served preview differs from candidate file');
    for(const width of [390,768,1440]){
      const page=await browser.newPage();
      try{
        await page.setViewport({width,height:width===390?844:1000,deviceScaleFactor:1});
        await page.setRequestInterception(true);
        page.on('request',async req=>{
          try{
            const u=new URL(req.url());if(u.origin!==new URL(PREVIEW_ORIGIN).origin)return await req.abort();
            const relative=decodeURIComponent(u.pathname);let file,type;
            if(relative.startsWith('/p/'+job.token+'/assets/')&&/^[-a-f0-9]+\.(png|jpg|webp)$/.test(path.basename(relative))){file=path.join(DATA,'previews',job.token,'assets',path.basename(relative));type='image/'+(file.endsWith('.jpg')?'jpeg':path.extname(file).slice(1));}
            else if(/^\/fonts\/[a-z-]+\.woff2$/.test(relative)){file=path.join(ROOT,'public','fonts',path.basename(relative));type='font/woff2';}
            else if(relative==='/preview-controls.js'){return await req.respond({status:200,contentType:'application/javascript',body:"document.querySelectorAll('form').forEach(f=>f.addEventListener('submit',e=>e.preventDefault()));"});}
            else return await req.abort();
            await req.respond({status:200,contentType:type,body:fs.readFileSync(file)});
          }catch{try{await req.abort();}catch{}}
        });
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        // Native fetch verified these exact bytes. Render them with a base URL
        // and bounded local asset responses: no Chrome loopback/proxy wait.
        await page.setContent(html.replace('<head>','<head><base href="'+documentUrl+'">'),{waitUntil:'domcontentloaded',timeout:15000});
        // Force deferred images to load only in the QA browser. A correctly lazy
        // image below the viewport must not be reported as a broken resource.
        await page.evaluate(async()=>{
          await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,3000))]);
          for(const img of document.images)img.loading='eager';
          await Promise.race([Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,5000))]);
        });
        const metrics=await page.evaluate(measureLayout);
        const issues=[];
        if(metrics.scrollWidth>width+3)issues.push(`Horizontal overflow at ${width}px: ${metrics.overflow.join(', ')}`);
        if(metrics.headingSplits.length)issues.push('Heading breaks inside words: '+metrics.headingSplits.join(', '));
        if(metrics.narrowCopy.length)issues.push('Service copy has an unreadably narrow text column');
        issues.push(...metrics.heroActions);
        if(metrics.smallText)issues.push(`${metrics.smallText} text blocks below readable size`);
        if(metrics.textGutters.length)issues.push('Long reading copy needs phone/tablet text gutters');
        if(metrics.brokenImages.length)issues.push('Broken images');
        if(metrics.invalidTargets.length)issues.push(`Missing anchors: ${metrics.invalidTargets.join(', ')}`);
        if(metrics.contrast.length)issues.push(`Low text contrast: ${metrics.contrast.slice(0,4).map(c=>`${c.text} (${c.ratio}:1)`).join('; ')}`);
        if(errors.length)issues.push('Browser script error');
        const filename=`${slug||'home'}-${width}.png`;await page.screenshot({path:path.join(DATA,'previews',job.token,filename),fullPage:true,timeout:15000});screenshots.push(filename);
        checks.push({page:slug||'home',width,metrics,issues});
      }finally{await page.close();}
    }
  }
  return {checks,screenshots,issues:checks.flatMap(c=>c.issues.map(i=>`${c.page}: ${i}`))};
}
export async function scanSite(job,rendered,{external=false}={}){
  const url=`${PREVIEW_ORIGIN}/p/${job.token}/`, issues=[];
  const htmlChecks=[];
  for(const slug of ['', 'services','about']){
    const content=fs.readFileSync(path.join(rendered.dir,`${slug||'index'}.html`),'utf8');
    const checked=htmlCheck(content,`${url}${slug}`,rendered.pages);htmlChecks.push({page:slug||'home',issues:checked.issues});issues.push(...checked.issues.map(i=>`${slug||'home'}: ${i}`));
  }
  let browser;
  try{browser=await browserCheck(job,rendered.pages);issues.push(...browser.issues);}catch(e){browser={issues:[`Browser QA unavailable: ${e.message}`],screenshots:[],checks:[]};issues.push(...browser.issues);}
  let report=localReport(rendered.home,url);
  if(report.readiness.overall<80)issues.push(`Local readiness ${report.readiness.overall} is below the accepted 80/100 pass mark; repair the listed missing requirements together.`);
  if(external&&/^https:\/\//i.test(PREVIEW_ORIGIN)){
    try{
      const raw=await scanner.fullScan(url);
      const measured=raw.performance.pagespeed?.scores;
      const verified=typeof measured?.performance==='number'&&typeof measured?.accessibility==='number'&&typeof measured?.['best-practices']==='number'&&raw.security.ssl.valid===true;
      report={...raw,verified,measurement:verified?'WinTech full scan with HTTPS and mobile PageSpeed':'WinTech full scan; required external measurements incomplete'};
      if(verified){
        const c=raw.scores.categories;
        // The native scanner treats a zero performance score as unavailable and
        // can replace it with fast-response heuristics. Never let that pass QA.
        if(measured.performance<80)issues.push(`Measured mobile Lighthouse performance ${measured.performance} is below 80`);
        if(raw.scores.overall<80)issues.push(`Raw WinTech score ${raw.scores.overall} is below 80`);
        // Overall pass mark is 80; explicit broken HTML/browser requirements still block publication.
      }
    }catch(e){report.scanError=e.message;}
  }
  return {report,htmlChecks,browser,issues:[...new Set(issues)]};
}


export function measureLayout(){
          const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
          const overflow=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return visible(e)&&r.width>8&&(r.right>innerWidth+3||r.left<-3)&&!e.classList.contains('skip-link');}).slice(0,8).map(e=>e.tagName.toLowerCase()+'.'+e.className);
          const selectorFor=el=>{let cursor=el,parts=[];while(cursor&&cursor.tagName!=='MAIN'){const parent=cursor.parentElement;if(!parent)return null;const tag=cursor.tagName.toLowerCase(),index=[...parent.children].filter(c=>c.tagName===cursor.tagName).indexOf(cursor)+1;parts.unshift(`${tag}:nth-of-type(${index})`);cursor=parent;}return cursor?'main'+parts.map(p=>' > '+p).join(''):null;};
          const smallTextDetails=[...document.querySelectorAll('main p,main li')].filter(e=>!((e.textContent||'').trim().length<=100&&/(?:^|[-_\s])(eyebrow|kicker|caption|disclosure|label|meta)(?:$|[-_\s])/i.test(String(e.className)))).filter(e=>visible(e)&&parseFloat(getComputedStyle(e).fontSize)<15).map(e=>({selector:selectorFor(e),fontSize:16}));
          const smallText=smallTextDetails.length;
          const textGutters=innerWidth<=900?[...document.querySelectorAll('main p')].filter(e=>visible(e)&&e.textContent.trim().length>120).filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.left+parseFloat(s.paddingLeft||0)<16||innerWidth-r.right+parseFloat(s.paddingRight||0)<16;}).map(e=>({selector:selectorFor(e)})):[];
          const brokenImages=[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src);
          const invalidTargets=[...document.querySelectorAll('a[href^="#"]')].filter(a=>a.hash.length>1&&!document.getElementById(decodeURIComponent(a.hash.slice(1)))).map(a=>a.hash);
          const rgb=s=>{const m=s.match(/^rgba?\(([^)]+)\)$/);return m?m[1].split(/[, ]+/).filter(Boolean).map(Number):null;};
          const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
          const contrast=[];
          for(const el of [...document.querySelectorAll('main p,main li,main label,main a,main h1,main h2,main button')].filter(visible).slice(0,180)){
            const style=getComputedStyle(el),fg=rgb(style.color);let parent=el,bg=null,gradient=false;
            while(parent){const s=getComputedStyle(parent);if(s.backgroundImage!=='none'){gradient=true;break;}const c=rgb(s.backgroundColor);if(c&&(c.length===3||c[3]===1)){bg=c;break;}parent=parent.parentElement;}
            if(gradient||!fg)continue;bg=bg||[255,255,255];const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700);
            if(ratio<(large?3:4.5)-.05){
              const against=value=>{const l=lum(value);return (Math.max(l,b)+.05)/(Math.min(l,b)+.05);};
              const end=against([0,0,0])>=against([255,255,255])?0:255;let corrected=fg.slice(0,3);
              for(let step=1;step<=100;step++){corrected=fg.slice(0,3).map(v=>Math.round(v+(end-v)*step/100));if(against(corrected)>=(large?3.15:4.65))break;}
              let cursor=el,parts=[];while(cursor&&cursor.tagName!=='MAIN'){const parent=cursor.parentElement;if(!parent)break;const tag=cursor.tagName.toLowerCase(),index=[...parent.children].filter(c=>c.tagName===cursor.tagName).indexOf(cursor)+1;parts.unshift(`${tag}:nth-of-type(${index})`);cursor=parent;}
              contrast.push({text:el.textContent.trim().slice(0,55),ratio:Math.round(ratio*100)/100,selector:cursor?.tagName==='MAIN'?'main'+parts.map(p=>' > '+p).join(''):null,correctedColor:`rgb(${corrected.join(',')})`});
            }
          }

          const headingSplits=[];for(const h of document.querySelectorAll('main h1')){const walker=document.createTreeWalker(h,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;for(const word of node.textContent.matchAll(/\p{L}{4,}/gu)){const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);const lines=new Set([...range.getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top)));if(lines.size>1)headingSplits.push(word[0]);}}}
          const narrowCopy=[...document.querySelectorAll('main article p')].filter(e=>visible(e)&&e.textContent.trim().length>60&&e.getBoundingClientRect().width<150).map(e=>e.textContent.trim().slice(0,55));
          const heroActions=[];const hero=document.querySelector('main>section:first-of-type'),heading=hero?.querySelector('h1'),primary=hero?.querySelector('a[class*="primary"],a[href*="#contact"]');if(heading&&primary&&visible(primary)){const h=heading.getBoundingClientRect(),r=primary.getBoundingClientRect();if(r.top<h.bottom-2&&r.right>h.left&&r.left<h.right)heroActions.push('Primary hero action overlaps or precedes the headline');if(r.top>innerHeight-44)heroActions.push('Primary hero action is below the first screen');}
          return {headingSplits,narrowCopy,heroActions,overflow,smallText,smallTextDetails,textGutters,brokenImages,invalidTargets,contrast,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,h1:document.querySelectorAll('h1').length,wordCount:document.querySelector('main')?.innerText.split(/\s+/).length||0};
        
}

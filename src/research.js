import { load } from 'cheerio';
import { safeFetch, normalizeTarget } from './network.js';
import { getBrowser } from './checks.js';

const SOCIAL=/\b(linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com)\b/i;
const clean=text=>String(text||'').replace(/\s+/g,' ').trim();
async function renderedSource(url,fetcher){
  const page=await(await getBrowser()).newPage();let requests=0;
  try{
    await page.setBypassServiceWorker(true);await page.setRequestInterception(true);
    page.on('request',async request=>{
      try{
        if(request.method()!=='GET'||++requests>40)return request.abort();
        if(request.url().startsWith('data:'))return request.continue();
        const response=await fetcher(request.url(),{maxBytes:2_500_000,timeout:8000,accept:'*/*'});
        await request.respond({status:200,contentType:response.type,body:response.bytes});
      }catch{try{await request.abort();}catch{}}
    });
    page.on('dialog',dialog=>dialog.dismiss());
    await page.setViewport({width:1366,height:900});
    await page.goto(url,{waitUntil:'networkidle2',timeout:25000});
    await new Promise(r=>setTimeout(r,700));
    return parseSource(await page.content(),url);
  }finally{await page.close();}
}
export function parseSource(html,url) {
  const $=load(html); $('script,style,noscript,iframe,svg').remove();
  const title=clean($('title').text()), description=$('meta[name="description"]').attr('content')||'';
  const name=clean($('meta[property="og:site_name"]').attr('content')||title.split(/[|–—]/)[0]);
  const links=[]; $('a[href]').each((_,a)=>{try{ const u=new URL($(a).attr('href'),url); if(['http:','https:'].includes(u.protocol)) links.push({url:u.href.split('#')[0],label:clean($(a).text())});}catch{}});
  const images=[]; $('img').each((_,img)=>{try{const node=$(img),src=new URL(node.attr('src')||node.attr('data-src')||'',url).href;const brandContext=node.closest('header,nav,#logo,.logo,a[rel~="home"],a[href="/"],a[aria-label*="home" i]').length>0;const logo=brandContext&&(/logo/i.test(src+' '+(node.attr('alt')||''))||clean(node.attr('alt')).toLowerCase()===name.toLowerCase());if(src!==url)images.push({url:src,alt:node.attr('alt')||'',...(logo?{role:'logo'}:/partner|vendor/i.test(new URL(url).pathname)&&/partner|vendor/i.test(src)?{role:'vendor_board'}:{})});}catch{}});
  // Logos often carry vendor names only in alt text; retain that evidence before text extraction.
  const vendors=[],companyLogoName=name.toLowerCase();
  $('img[alt]').each((_,img)=>{const node=$(img),alt=clean(node.attr('alt'));if(!/\blogo\b/i.test(alt))return;
    const context=node.parents().toArray().find(el=>{const n=$(el);return n.find('h3').length===1&&n.find('img[alt*="logo" i]').length===1;});
    const partnerContext=node.parents().toArray().find(el=>/our partners|technology partners|trusted vendor relationships/i.test(clean($(el).find('h2,h3,p').first().text())+' '+clean($(el).children('h2,h3,p').text())));
    if(!context&&!partnerContext)return;const card=$(context||partnerContext),name=clean(alt.replace(/\blogo\b/ig,''));
    if(!name||name.length>80||name.toLowerCase()===companyLogoName||node.closest('header,nav').length||vendors.some(v=>v.name.toLowerCase()===name.toLowerCase()))return;
    try{const category=context?clean(card.find('h3').text()):'';vendors.push({name,category,sourceUrl:url,quote:category||name,logoUrl:new URL(node.attr('src'),url).href});}catch{}
  });
  $('img[alt]').each((_,img)=>$(img).after($('<span></span>').text(' '+$(img).attr('alt')+' ')));
  const outline=$('h1,h2,h3').toArray().map(el=>({heading:clean($(el).text()),context:clean($(el).parent().text()).slice(0,600)})).filter(x=>x.heading).slice(0,60);
  const services=[],industries=[];
  $('h2,h3').each((_,el)=>{const node=$(el),heading=clean(node.text());if(!heading||heading.length>100)return;
    const ancestor=node.parents('section,article').toArray().find(e=>$(e).find('h2').length>0),section=ancestor?$(ancestor):node.parent(),label=clean(section.find('h2').first().text()),path=new URL(url).pathname;
    const kind=/industr|sector|who we serve|markets we serve/i.test(label+' '+path)?'industries':/our services|what we do|built for your mission|service offerings|\/services?\b/i.test(label+' '+path)?'services':null;
    if(!kind||/^(?:our (?:focus|services)|IT Services|Products We Offer|Ready to get started\??|contact(?: us)?|common questions|frequently asked questions|how we work|industries|what we do|built for your mission)$/i.test(heading)||node.is('h2')&&heading===label&&!/\/services?\b/i.test(path))return;
    const quote=heading.length>=8?heading:clean(node.parent().text()).slice(0,600);(kind==='services'?services:industries).push({name:heading,quote,sourceUrl:url});
  });
  const emails=[],phones=[];
  $('a[href]').each((_,a)=>{const href=$(a).attr('href')||'';if(/^mailto:/i.test(href))emails.push(href.slice(7).split('?')[0].trim());if(/^tel:/i.test(href))phones.push(href.slice(4).trim());});
  $('a,p,div,section,article,header,footer,li,h1,h2,h3,h4,br').each((_,el)=>{$(el).prepend(' ');$(el).append(' ');});
  const text=clean($('body').text()).slice(0,16000);
  const content=$('main').length?$('main').clone():$('body').clone();content.find('header,footer,nav').remove();const contentText=clean(content.text()).slice(0,16000);
  return {url,title,name,description,text,contentText,links,images,emails,phones,vendors,outline,services,industries};
}
export async function readCompanyPage(response,fetcher=safeFetch,renderer=renderedSource){
 let source=parseSource(response.text,response.url);
 if((source.text.length<2000||!source.images.length)&&/<script[\s>]/i.test(response.text)){
  const rendered=await renderer(response.url,fetcher);
  if(rendered.text.length>source.text.length||rendered.images.length>source.images.length)source={...rendered,rendered:true};
 }
 return source;
}
export async function research(url,onProgress=()=>{},fetcher=safeFetch) {
  const main=await fetcher(url); if(!/html/i.test(main.type))throw new Error('The supplied URL is not an HTML website');
  let first=parseSource(main.text,main.url),renderGap=null;
  const origin=new URL(main.url).origin;
  if((first.text.length<2000||!first.images.length)&&/<script[\s>]/i.test(main.text)){
    onProgress('Reading the rendered homepage for client-loaded content');
    try{const rendered=await renderedSource(main.url,fetcher);if(rendered.text.length>first.text.length||rendered.images.length>first.images.length){first=rendered;first.rendered=true;}}catch(e){renderGap={url:main.url,reason:`Rendered source unavailable; raw HTML used: ${e.message}`};}
  }
  const sources=[first], gaps=renderGap?[renderGap]:[], seen=new Set([main.url]);
  const priority=l=>/service|solution|industr|sector|vendor|partner|product/i.test(l.url+' '+l.label)?0:/about/i.test(l.url+' '+l.label)?1:2;
  const internal=[...new Set(first.links.filter(l=>new URL(l.url).origin===origin && /service|solution|about|contact|team|industr|sector|vendor|partner|product|managed|security/i.test(l.url+' '+l.label)).sort((a,b)=>priority(a)-priority(b)).map(l=>l.url))].filter(u=>!seen.has(u)).slice(0,8),corePages=[{url:main.url,essential:true,read:!renderGap&&first.contentText.length>=120}];
  for(const target of internal){seen.add(target);const essential=/service|solution|industr|sector|vendor|partner|product|about/i.test(new URL(target).pathname);try{const r=await fetcher(target);if(!/html/i.test(r.type))throw Error('Company page is not HTML');const page=await readCompanyPage(r,fetcher);if(page.contentText.length<120)throw Error('Company page has no usable public content beyond navigation/footer');sources.push(page);corePages.push({url:target,essential,read:true});}catch(e){gaps.push({url:target,reason:e.message});corePages.push({url:target,essential,read:false});}onProgress(`Read ${sources.length} company pages`);}
  const officialProfiles=[...new Set(sources.flatMap(s=>s.links.filter(l=>SOCIAL.test(new URL(l.url).hostname)).map(l=>l.url)))].slice(0,4);
  const profiles=[];
  for(const target of officialProfiles){try{const r=await fetcher(target);const p=parseSource(r.text,r.url);if(p.text.length<120 || /log in to continue|you must log in|enable javascript/i.test(p.text.slice(0,500)))throw new Error('Profile is login-gated or has insufficient public content'); profiles.push({...p,identity:'linked from company website'});}catch(e){gaps.push({url:target,reason:`Social profile unavailable: ${e.message}`});}}
  // Discovery is public, bounded, and free. Search snippets are discovery leads, never business facts.
  const discoveries=[];
  for(const query of [`"${new URL(main.url).hostname}" business`, `"${first.name.slice(0,70)}" Facebook Instagram LinkedIn`]){
    try{const r=await fetcher(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);const $=load(r.text);$('li.b_algo h2 a').each((_,a)=>{try{const found=normalizeTarget($(a).attr('href'));if(!discoveries.some(d=>d.url===found))discoveries.push({url:found,title:clean($(a).text()),verified:false});}catch{}});}catch(e){gaps.push({url:'https://www.bing.com/search',reason:`Public search unavailable: ${e.message}`});}
  }
  try{
    const r=await fetcher(`https://www.google.com/search?q=${encodeURIComponent('"'+new URL(main.url).hostname+'" company')}`);
    const $=load(r.text);$('a[href]').each((_,a)=>{try{let href=$(a).attr('href');if(href.startsWith('/url?'))href=new URL(href,'https://www.google.com').searchParams.get('q')||new URL(href,'https://www.google.com').searchParams.get('url');if(!href||!href.startsWith('http'))return;const found=normalizeTarget(href);if(new URL(found).hostname.endsWith('google.com'))return;const title=clean($(a).text());if(title.length>8&&!discoveries.some(d=>d.url===found))discoveries.push({url:found,title,verified:false,engine:'Google public search'});}catch{}});
    if(/unusual traffic|enablejs|before you continue to google/i.test(r.text))gaps.push({url:'https://www.google.com/search',reason:'Google public results were consent-gated or unavailable; no listing facts inferred'});
  }catch(e){gaps.push({url:'https://www.google.com/search',reason:`Google public search unavailable: ${e.message}`});}
  // Newly discovered profiles need a backlink to the exact company host before becoming evidence.
  for(const candidate of discoveries.filter(d=>SOCIAL.test(new URL(d.url).hostname)&&!officialProfiles.includes(d.url)).slice(0,2)){
    try{const r=await fetcher(candidate.url);const p=parseSource(r.text,r.url);if(!p.links.some(l=>new URL(l.url).hostname===new URL(main.url).hostname))throw new Error('Identity not confirmed by company-domain backlink');profiles.push({...p,identity:'company-domain backlink'});candidate.verified=true;}catch(e){gaps.push({url:candidate.url,reason:e.message});}
  }
  return {version:4,sourceUrl:main.url,companyHint:first.name,corePages,sources:sources.map(({links,images,...s})=>({...s,images:images.filter(i=>i.role||/logo/i.test(i.alt))})),profiles:profiles.map(({links,images,...s})=>s),socialLinks:officialProfiles,images:sources.flatMap(s=>s.images).filter((v,i,a)=>a.findIndex(x=>x.url===v.url)===i).sort((a,b)=>Number(b.role==='logo')-Number(a.role==='logo')||Number(b.role==='vendor_board')-Number(a.role==='vendor_board')||Number(/partner/i.test(a.url+' '+a.alt))-Number(/partner/i.test(b.url+' '+b.alt))).slice(0,16),discoveries:discoveries.slice(0,12),gaps,researchedAt:new Date().toISOString()};
}

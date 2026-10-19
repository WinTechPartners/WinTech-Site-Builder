import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { load } from 'cheerio';
import { DATA,PREVIEW_ORIGIN } from './config.js';
import { safeFetch } from './network.js';
import { getBrowser } from './checks.js';
import {responsiveFoundation} from './responsive-foundation.js';
import {normalizeHeadings} from './semantic-foundation.js';
import {addInteractions,interactionCSS} from './interactions.js';
import {preserveVendors,vendorCSS,verifiedVendors} from './vendors.js';

export const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tags=new Set('html head body header footer main nav section article aside div span p a h1 h2 h3 h4 h5 h6 ul ol li dl dt dd strong em b i small blockquote figure figcaption picture source img hr br details summary form label input textarea select option button fieldset legend address time table caption thead tbody tr th td code pre mark sup sub'.split(' '));
const attrs=new Set('id class href src alt width height loading decoding type name value placeholder required autocomplete for aria-label aria-labelledby aria-describedby aria-expanded aria-controls aria-hidden role title tabindex open rows cols disabled selected checked colspan rowspan scope datetime'.split(' '));
for(const tag of 'svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath'.split(' ')){tags.add(tag);tags.add(tag.toLowerCase());}
const svgAttrs=new Set('viewbox preserveaspectratio d x y cx cy r rx ry x1 x2 y1 y2 points fill fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin opacity transform gradientunits gradienttransform offset stop-color stop-opacity clip-path'.split(' '));
export function sanitizeBody(body,job,assets,slugs) {
  const $=load(body,null,false); const base=`/p/${job.token}`;
  $('script,style,iframe,object,embed,base,meta,link,math,template,foreignObject,foreignobject,use,image,animate,animateMotion,animateTransform,set,filter').remove();
  $('*').each((_,el)=>{
    const node=$(el);if(!tags.has(el.tagName)){node.replaceWith(node.contents());return;}
    const inSvg=node.closest('svg').length>0;
    for(const key of Object.keys(el.attribs||{}))if(!attrs.has(key)&&!(inSvg&&svgAttrs.has(key.toLowerCase())))node.removeAttr(key);
    if(inSvg){node.removeAttr('href').removeAttr('src');for(const key of ['fill','stroke','stop-color','clip-path']){const value=node.attr(key);if(value&&!/^(?:#[a-f0-9]{3,8}|[a-z]+|rgba?\([\d., %]+\)|url\(#[-\w]+\))$/i.test(value))node.removeAttr(key);}}
    if(el.tagName==='form'){node.attr('action','#').attr('data-preview-form','true');}
    if(el.tagName==='button'&&node.closest('form').length&&node.attr('type')!=='reset')node.attr('type','submit');
    if(['input','select','textarea'].includes(el.tagName)&&!['hidden','submit','button','reset'].includes(node.attr('type'))){
      const id=node.attr('id');const labeled=id&&$('label').toArray().some(l=>$(l).attr('for')===id);
      if(!labeled&&!node.attr('aria-label')&&!node.attr('aria-labelledby'))node.attr('aria-label',node.attr('placeholder')||node.attr('name')||'Contact field');
    }
    if(el.tagName==='input' && /file|password/i.test(node.attr('type')||''))node.attr('type','text');
    if(el.tagName==='img'){
      const asset=assets.find(a=>a.src===node.attr('src'));
      if(!asset){node.remove();return;}node.attr('src',asset.src).attr('decoding','async');if(!node.attr('width')&&asset.width)node.attr('width',String(asset.width));if(!node.attr('height')&&asset.height)node.attr('height',String(asset.height));if(!node.attr('alt')&&asset.alt)node.attr('alt',asset.alt);
    }
    if(node.attr('href')){
      const href=node.attr('href');
      try {
        if(href.startsWith('#'))return;
        if(href.startsWith('/')&&!href.startsWith('//')){
          const local=new URL(href,'https://preview.invalid');const slug=local.pathname.replace(/^\/|\/$/g,'');
          if(slugs.includes(slug))node.attr('href',`${base}/${slug}${local.hash}`);else node.removeAttr('href');
        }else if(href.startsWith('mailto:') && job.profile.email && href.slice(7)===job.profile.email){}
        else if(href.startsWith('tel:') && verifiedTelephone(href,job)){}
        else {const u=new URL(href);const source=new URL(job.profile.sourceUrl); if(u.protocol!=='https:' && u.protocol!=='http:')throw new Error();if(u.hostname!==source.hostname && !job.profile.socialLinks.some(s=>new URL(s).hostname===u.hostname))throw new Error();node.attr('rel','noopener noreferrer').attr('target','_blank');}
      }catch{node.removeAttr('href');}
    }
  });
  return $.html();
}
export function verifiedTelephone(href,job){
 const number=href.replace(/\D/g,''),normalize=s=>String(s||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');if(number.length<10||number.length>15)return false;
 if(job.profile.phone&&normalize(number)===normalize(job.profile.phone))return true;
 return (job.research?.sources||[]).some(s=>String(s.text||'').replace(/[\s().+\-]/g,'').includes(normalize(number)));
}
export async function collectAssets(job,research,fetcher=safeFetch) {
  const dir=path.join(DATA,'previews',job.token,'assets');fs.mkdirSync(dir,{recursive:true});
  const assets=[];
  const vendorImages=verifiedVendors(research).map(v=>({url:v.logoUrl,alt:v.name+' logo',role:'vendor_logo',vendorName:v.name}));
  const originals=research.images.filter(i=>['logo','vendor_board'].includes(i.role));
  for(const img of originals.concat(research.images.filter(i=>!originals.includes(i)).slice(0,5),vendorImages)){
    try {const r=await fetcher(img.url,{accept:'image/avif,image/webp,image/jpeg,image/png',maxBytes:1_800_000});
      const svgLogo=['logo','vendor_logo'].includes(img.role)&&r.type.includes('image/svg+xml');
      if(svgLogo&&/<(?:script|foreignObject|iframe|image|use)\b|@import|(?:href|src)\s*=\s*["'](?!#)|url\(\s*(?!#)/i.test(r.bytes.toString('utf8')))continue;
      const ext=r.type.includes('image/png')?'png':r.type.includes('image/jpeg')?'jpg':r.type.includes('image/webp')?'webp':svgLogo?'svg':null;
      if(!ext)continue;
      let bytes=r.bytes,format=ext,dimensions={};
      try{
        const page=await(await getBrowser()).newPage();
        try{
          const optimized=await page.evaluate(async(data)=>{
            const image=new Image();image.src=data;await image.decode();
            const width=Math.min(image.naturalWidth,1600),height=Math.round(image.naturalHeight*width/image.naturalWidth);
            if(width<=0||height<=0||height>10000)throw new Error('Unsupported image dimensions');
            const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0,width,height);
            return{url:canvas.toDataURL('image/webp',.78),width,height};
          },`data:${r.type.split(';')[0]};base64,${r.bytes.toString('base64')}`);
          const encoded=Buffer.from(optimized.url.split(',')[1],'base64');
          dimensions={width:optimized.width,height:optimized.height};
          if(svgLogo||encoded.length<bytes.length){bytes=encoded;format='webp';}
        }finally{await page.close();}
      }catch{if(svgLogo)continue;/* Retain original raster when local optimization is unavailable. */}
      const name=`${crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16)}.${format}`;fs.writeFileSync(path.join(dir,name),bytes);
      assets.push({src:`/p/${job.token}/assets/${name}`,alt:img.alt.slice(0,180),source:img.url,...(img.role?{role:img.role}:{}),...(img.vendorName?{vendorName:img.vendorName}:{}),...dimensions});
    }catch{/* optional source asset; no external or invented fallback image */}
  }
  return assets;
}
const foundation=`@media(max-width:900px){.studio-reading-gutter{padding-inline:20px!important}}.studio-brand-label{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.studio-brand-logo{display:block!important;width:auto!important;height:54px!important;max-width:240px!important;object-fit:contain!important;object-position:left center!important}@media(max-width:599px){.studio-brand-logo{height:42px!important;max-width:205px!important}}@font-face{font-family:"Instrument Serif";src:url(/fonts/instrument-serif-italic.woff2) format("woff2");font-style:italic;font-weight:400;font-display:swap}@font-face{font-family:Manrope;src:url(/fonts/manrope.woff2) format("woff2");font-weight:400 800;font-display:swap}@font-face{font-family:"Space Grotesk";src:url(/fonts/space-grotesk.woff2) format("woff2");font-weight:400 700;font-display:swap}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:16px/1.65 system-ui,sans-serif;overflow-wrap:break-word}img{max-width:100%;height:auto}a,button,input,summary,textarea{touch-action:manipulation}button,input,textarea,select{font:inherit}input,textarea,select{max-width:100%}a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #d96500;outline-offset:4px}.preview-disclosure{background:#17151b!important;color:#fff!important;font:11px/1.5 system-ui!important;padding:6px 16px!important;text-align:center!important}.skip-link{position:absolute;left:-9999px}.skip-link:focus{left:12px;top:46px;background:white;color:black;padding:12px;z-index:1000}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}`;
const policy=(job,kind)=>`<header><nav><a href="/">${escape(job.profile.name)}</a> · <a href="/services">Services</a> · <a href="/about">About</a></nav></header><main id="main"><h1>${kind==='privacy'?'Preview privacy notice':'Preview terms'}</h1><p>This is an independently prepared, unapproved website redesign concept operated by WinTech. It is not the company's live website.</p>${kind==='privacy'?'<h2>Data and contact forms</h2><p>This preview does not install analytics or advertising trackers. The demonstration form does not send or store submissions. The hosting server may process ordinary request logs for operation and security. Do not enter sensitive information.</p>':'<h2>Using this concept</h2><p>Content is based on public sources and has not been approved by the business. Services and availability must be confirmed directly with the business. No purchase or service agreement can be made through this preview.</p>'}<h2>Contact the business</h2><p><a href="${escape(job.profile.sourceUrl)}">Visit the original company website</a> for current business information, contact options and its own policies.</p></main><footer><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer>`;
export function renderSite(job,site,assets) {
  site={...site,css:site.css+'\n'+vendorCSS+'\n.studio-faq{max-width:1200px;margin:auto;padding:clamp(40px,6vw,96px) clamp(24px,5vw,72px)}.studio-faq h2{font-family:"Space Grotesk",sans-serif;font-size:clamp(2rem,4vw,3.5rem);line-height:1.1;letter-spacing:-.04em}.studio-faq details{border-top:1px solid currentColor;padding:20px 0}.studio-faq summary{font-weight:650;cursor:pointer;min-height:44px;display:list-item;align-content:center}.studio-faq p{max-width:70ch}.preview-form-notice{color:#142033!important;background:#f4f0e8!important;padding:12px!important;border-left:3px solid #9e3d20!important}'};
  normalizeHeadings(site);
  const dir=path.join(DATA,'previews',job.token);fs.mkdirSync(dir,{recursive:true});
  const pages=[...site.pages,...['privacy','terms'].map(slug=>({slug,title:`${slug==='privacy'?'Privacy':'Terms'} | ${job.profile.name}`.slice(0,60),description:'Information about this proposed website preview.',body:policy(job,slug),faq:[]}))];
  const slugs=pages.map(p=>p.slug), files={};
  for(const page of pages){
    const pageUrl=`${PREVIEW_ORIGIN}/p/${job.token}/${page.slug}`;
    let body=sanitizeBody(page.body,job,assets,slugs);
    const logo=assets.find(a=>a.role==='logo');if(logo){const branded=load(body,null,false);const home=branded('header a').filter((i,e)=>branded(e).attr('href')===`/p/${job.token}/`).first();if(home.length)home.html(`<span class="studio-brand-label">${escape(job.profile.name)} home</span><img class="studio-brand-logo" src="${escape(logo.src)}" alt="${escape(job.profile.name)}" width="${logo.width||240}" height="${logo.height||72}" decoding="async">`);body=branded.html();}
    let $=load(body,null,false);
    const heroAsset=assets.find(a=>a.synthetic&&a.role==='hero');
    const heroSection=$('main>section').first();
    if(page.slug===''&&heroAsset&&heroSection.find('h1').length&&!heroSection.find('img').length&&!site.css.includes(heroAsset.src))heroSection.append(`<figure class="studio-retained-art" style="grid-column:1/-1;clear:both;margin:24px 0 0;max-width:100%;overflow:hidden"><img src="${escape(heroAsset.src)}" alt="${escape(heroAsset.alt)}" width="${heroAsset.width||1536}" height="${heroAsset.height||1024}" loading="eager" decoding="async" style="width:100%;height:clamp(220px,32vw,420px);object-fit:cover"></figure>`);
    $('a.skip[href="#main"]').remove();
    $('form p,form small').each((_,el)=>{if(/preview only|demonstration contact form/i.test($(el).text()))$(el).addClass('preview-form-notice');});
    for(const fix of site.contrastCorrections||[]){if(fix.page!==(page.slug||'home')||!/^main(?: > [a-z][a-z0-9]*:nth-of-type\(\d+\))*$/.test(fix.selector)||!/^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/.test(fix.color))continue;$(fix.selector).each((_,el)=>$(el).attr('style',($(el).attr('style')||'')+`;color:${fix.color}!important`));}
    for(const fix of site.fontSizeCorrections||[]){if(fix.page!==(page.slug||'home')||!/^main(?: > [a-z][a-z0-9]*:nth-of-type\(\d+\))*$/.test(fix.selector)||fix.fontSize!==16)continue;$(fix.selector).each((_,el)=>$(el).attr('style',($(el).attr('style')||'')+';font-size:16px!important'));}
    for(const fix of site.readingGutterCorrections||[]){if(fix.page!==(page.slug||'home')||!/^main(?: > [a-z][a-z0-9]*:nth-of-type\(\d+\))*$/.test(fix.selector))continue;$(fix.selector).addClass('studio-reading-gutter');}
    if(page.slug==='')$=load(preserveVendors($.html(),job,assets),null,false);
    addInteractions($,job,site,page);
    const policyLinks=[['privacy','Privacy'],['terms','Terms']].filter(([slug])=>!$('a[href]').toArray().some(a=>String($(a).attr('href')).endsWith('/'+slug)));
    if(policyLinks.length)$.root().append('<footer class="studio-policy-links">'+policyLinks.map(([slug,label])=>`<a href="/p/${job.token}/${slug}">${label}</a>`).join(' · ')+'</footer>');
    if(!$('main').attr('id'))$('main').attr('id','main');
    const graph=[{'@type':'Organization','@id':`${pageUrl}#organization`,name:job.profile.name,url:job.profile.sourceUrl,sameAs:job.profile.socialLinks,...(job.profile.phone?{telephone:job.profile.phone}:{}),...(job.profile.email?{email:job.profile.email}:{})}];
    const faqs=(Array.isArray(page.faq)?page.faq:[]).filter(f=>typeof f.question==='string'&&typeof f.answer==='string'&&$.text().includes(f.question)&&$.text().includes(f.answer)).slice(0,8);
    if(faqs.length)graph.push({'@type':'FAQPage',mainEntity:faqs.map(f=>({'@type':'Question',name:f.question,acceptedAnswer:{'@type':'Answer',text:f.answer}}))});
    if(page.slug)graph.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:`${PREVIEW_ORIGIN}/p/${job.token}/`},{'@type':'ListItem',position:2,name:page.slug,item:pageUrl}]});
    files[`${page.slug||'index'}.html`]=`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${escape(page.title.slice(0,60))}</title><meta name="description" content="${escape(page.description)}"><link rel="canonical" href="${escape(pageUrl)}"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escape(pageUrl)}">${assets[0]?`<meta property="og:image" content="${escape(PREVIEW_ORIGIN+assets[0].src)}">`:''}<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/p/${job.token}/favicon.svg"><style>${foundation}\n${site.css}\n${interactionCSS}\nmain:has(h1):not(:has(section)){padding:clamp(24px,5vw,72px);max-width:1200px;margin:auto}</style>${site.responsiveFoundation?`<style>${responsiveFoundation}</style>`:""}<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c')}</script><script src="/preview-controls.js" defer></script></head><body><div class="preview-disclosure">Proposed redesign · Independent, unapproved concept · Forms are demonstration only</div><a class="skip-link" href="#main">Skip to main content</a>${$.html()}</body></html>`;
  }
  files['favicon.svg']=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#201b29"/><text x="32" y="46" text-anchor="middle" font-family="sans-serif" font-size="44" fill="#edc18f">${escape((job.profile.name.match(/[a-z0-9]/i)?.[0]||'').toUpperCase())}</text></svg>`;
  files['style.css']=foundation+'\n'+site.css;
  for(const [name,value] of Object.entries(files)){const tmp=path.join(dir,name+'.tmp');fs.writeFileSync(tmp,value);fs.renameSync(tmp,path.join(dir,name));}
  fs.writeFileSync(path.join(dir,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(p=>`<url><loc>${PREVIEW_ORIGIN}/p/${job.token}/${p.slug}</loc></url>`).join('')}</urlset>`);
  fs.writeFileSync(path.join(dir,'llms.txt'),`# ${job.profile.name}\n\nIndependent unapproved website redesign concept.\nOriginal company: ${job.profile.sourceUrl}\n\n## Pages\n${site.pages.map(p=>`- [${p.title}](${PREVIEW_ORIGIN}/p/${job.token}/${p.slug}): ${p.description}`).join('\n')}`);
  return {dir,home:files['index.html'],pages:pages.map(p=>p.slug)};
}



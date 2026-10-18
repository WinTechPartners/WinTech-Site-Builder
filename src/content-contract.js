import {load} from 'cheerio';
import {verifiedVendors} from './vendors.js';
export const CONTENT_CONTRACT_VERSION=3;
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
export function sourceInventory(research,brief={}){
 const result={services:[],industries:[],vendors:verifiedVendors(research,brief)};
 for(const kind of ['services','industries'])for(const s of research?.sources||[]){
  const entries=[...(s[kind]||[]),...(brief[kind]||[]).filter(x=>x.sourceUrl===s.url)];
  for(const x of entries){if(typeof x.name!=='string'||!x.name.trim()||x.name.length>120||typeof x.quote!=='string'||x.quote.length<8||!norm(s.text).includes(norm(x.quote))||!norm(x.quote).includes(norm(x.name))||result[kind].some(v=>norm(v.name)===norm(x.name)))continue;
   result[kind].push({name:x.name.trim(),sourceUrl:s.url,quote:x.quote});
  }
 }return result;
}
export function visiblePages(site){return site.pages.map(p=>{const $=load(p.body);$('script,style,[hidden],[aria-hidden="true"]').remove();return {page:p.slug,text:$.text().replace(/\s+/g,' ').trim(),$};});}
export function coverageCheck(job,site){
 const inventory=sourceInventory(job.research,job.profile),pages=visiblePages(site),all=norm(pages.map(p=>p.text).join(' ')),issues=[];
 for(const kind of ['services','industries','vendors'])for(const x of inventory[kind])if(!all.includes(norm(x.name)))issues.push(`Missing source-listed ${kind}: ${x.name}. Preserve it with source-faithful content.`);
 const logo=(job.assets||[]).find(a=>a.role==='logo');const expected=(job.research?.images||[]).some(a=>a.role==='logo');
 if(expected&&!logo)issues.push('The original company logo was found but not downloaded. Retrieve it before publishing; do not substitute a wordmark.');
 if(logo)for(const p of pages)if(!p.$('header img').toArray().some(e=>p.$(e).attr('src')===logo.src))issues.push(`${p.page||'home'}: original company logo is missing from the header.`);
 return {version:CONTENT_CONTRACT_VERSION,inventory,issues,passed:issues.length===0};
}
export function validateUsefulCoverage(review,profile,pages,site=null){
 const issues=[],coverage=review.coverage||[];
 for(const kind of ['services','industries'])for(const item of profile[kind]||[]){
  const row=coverage.find(r=>r.kind===kind&&norm(r.name)===norm(item.name));
  if(!row){issues.push(`${kind}: ${item.name} has no evidence of useful coverage.`);continue;}
  const page=pages.find(p=>p.page===row.page);
  if(!page||['explanationQuote','buyerGuidanceQuote','nextActionQuote'].some(k=>typeof row[k]!=='string'||row[k].trim().length<12||!norm(page.body).includes(norm(row[k]))))issues.push(`${kind}: ${item.name} needs a real explanation, concrete buyer guidance and relevant next action on one linked detail page; reviewer evidence was missing or absent from the page.`);
  if(!row.useful)issues.push(`${kind}: ${item.name}: ${row.reason||'Coverage is generic or not actionable.'}`);
  if(site&&page){const html=site.pages.find(p=>p.slug===row.page)?.body||'', $=load(html);const action=$('a[href],button').toArray().some(e=>norm($(e).text()).includes(norm(row.nextActionQuote))&&($(e).attr('href')&&!/^(?:#|javascript:)$/.test($(e).attr('href'))||$(e).is('button')&&$(e).closest('form').length));if(!action)issues.push(`${kind}: ${item.name} needs a usable next-action link, not just contact wording in a paragraph.`);}
 }
 return issues;
}

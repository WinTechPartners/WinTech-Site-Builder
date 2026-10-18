export function localReadiness(signals,raw){
 const categories=structuredClone(raw.categories),pending=['Public HTTPS certificate verification','Mobile Lighthouse performance and best practices'];
 delete categories.analytics;delete categories.performance;
 categories.security.score=Math.round(raw.categories.security.score/85*100);
 categories.security.note='Configured headers only; live HTTPS verification pending.';
 categories.bestPractices.score=Math.round(raw.categories.bestPractices.score/65*100);
 categories.bestPractices.note='Encoding, viewport, doctype and favicon. HTTPS and Lighthouse pending.';
 const tracking=signals.analytics?.hasAny;
 if(!tracking){categories.privacy.score=Math.round(raw.categories.privacy.score/60*100);categories.privacy.note='Privacy and terms links. Cookie-consent points are not applicable to this tracker-free preview; this is not a legal compliance certification.';}
 categories.i18n.score=Math.round(raw.categories.i18n.score/55*100);categories.i18n.note='Language and encoding; translations are not required for this single-language preview.';
 const aeo=signals.aeo||{};
 categories.aeo.score=Math.round(((aeo.jsonLd?.exists?25:0)+(aeo.organizationSchema?15:0)+(aeo.faqSchema?15:0)+20)/75*100);
 categories.aeo.note='Valid structured company/answer data and the generated llms.txt. No HowTo, homepage breadcrumb or word-count requirement. Answer usefulness is checked separately.';
 const words=signals.seo.wordCount;
 const wordPoints=words>=1200?40:words>=800?30:words>=400?15:words>=200?5:0;
 categories.content.score=Math.round((raw.categories.content.score-wordPoints)/60*100);
 categories.content.name='Content structure';categories.content.note='Headings, image descriptions and internal links. No word-count quota; service/industry usefulness remains a separate required review.';
 const seoWordPoints=words>=800?5:words>=400?2:0;
 categories.seo.score=Math.round((raw.categories.seo.score-seoWordPoints)/95*100);
 const trust=signals.trust||{};
 categories.trust.score=((trust.hasPhone||trust.hasEmail)?30:0)+(trust.hasPrivacyPolicy?30:0)+(signals.seo.viewport?20:0)+(signals.seo.favicons>0?20:0);
 categories.trust.name='Contact & navigation';categories.trust.note='Reachable contact information, policy link and mobile/document basics. No rewards for demo forms or social accounts.';
 categories.privacy.name='Preview privacy notices';
 const weights={seo:16,aeo:12,security:12,accessibility:10,content:8,trust:8,bestPractices:6,privacy:6,i18n:5};
 for(const c of Object.values(categories))c.score=Math.max(0,Math.min(100,c.score));
 const total=Object.values(weights).reduce((a,b)=>a+b,0),overall=Math.round(Object.entries(weights).reduce((n,[k,w])=>n+categories[k].score*w,0)/total);
 return {overall,categories,pending,label:'Local readiness',passMark:80,passed:overall>=80,explanation:'Applicable local checks only. Raw WinTech score remains separate; live HTTPS/performance and independent design/content review are not certified by this number.'};
}

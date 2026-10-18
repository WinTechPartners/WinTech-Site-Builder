import {load} from 'cheerio';
export function normalizeHeadings(site){
 let changed=false;
 for(const page of site.pages){const $=load(page.body,null,false);let previous=0;
  const questions=new Set();
  $('.studio-faq details').each((_,el)=>{const question=$(el).children('summary').text().toLowerCase().replace(/\s+/g,' ').trim();if(question&&questions.has(question))$(el).remove();else if(question)questions.add(question);});
  $('.studio-faq').get().reverse().forEach(el=>{if(!$(el).find('details').length)$(el).remove();else if($(el).parents('.studio-faq').length)$(el).replaceWith($(el).contents());});
  $('.studio-faq').each((_,el)=>$(el).children('h2').slice(1).remove());
  $('h1,h2,h3,h4,h5,h6').each((_,el)=>{const n=$(el),level=Number(el.name.slice(1));n.addClass('studio-original-h'+level);if(previous===0&&level!==1){el.name='p';changed=true;return;}const next=Math.min(level,previous+1);if(level!==next){el.name='h'+next;changed=true;}previous=next;});page.body=$.html();
 }
 if(changed)site.css=site.css.replace(/([^{}]+)\{/g,(all,selector)=>selector.replace(/(?<![-\w.])h([1-6])(?![-\w])/g,'.studio-original-h$1')+'{');
 return site;
}

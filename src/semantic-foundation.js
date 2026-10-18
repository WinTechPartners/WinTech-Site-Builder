import {load} from 'cheerio';
export function normalizeHeadings(site){
 let changed=false;
 for(const page of site.pages){const $=load(page.body,null,false);let previous=0;
  $('h1,h2,h3,h4,h5,h6').each((_,el)=>{const n=$(el),level=Number(el.name.slice(1));n.addClass('studio-original-h'+level);if(previous===0&&level!==1){el.name='p';changed=true;return;}const next=Math.min(level,previous+1);if(level!==next){el.name='h'+next;changed=true;}previous=next;});page.body=$.html();
 }
 if(changed)site.css=site.css.replace(/([^{}]+)\{/g,(all,selector)=>selector.replace(/(?<![-\w.])h([1-6])(?![-\w])/g,'.studio-original-h$1')+'{');
 return site;
}

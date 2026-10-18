import {load} from 'cheerio';
export function verifiedVendors(research,brief={}){
 const result=[];for(const source of research?.sources||[])for(const v of [...(source.vendors||[]),...(brief.vendors||[]).filter(v=>v.sourceUrl===source.url)]){
  const quotedName=typeof v.quote==='string'&&typeof v.name==='string'&&v.quote.toLowerCase().includes(v.name.toLowerCase());
  const logoEvidence=source.images?.some(i=>i.url===v.logoUrl&&i.alt.toLowerCase()===(v.name+' logo').toLowerCase());
  if(v.sourceUrl!==source.url||!v.name||!v.quote||!source.text.includes(v.quote)||!(quotedName||logoEvidence)||result.some(x=>x.name.toLowerCase()===v.name.toLowerCase()))continue;
  result.push(v);
 }return result.slice(0,24);
}
export const vendorCSS=`.studio-vendors{background:#f7f5f0;color:#211c29;padding:clamp(32px,6vw,80px) clamp(24px,5vw,72px)}.studio-vendors>div{max-width:1280px;margin:auto}.studio-vendors h2{font:600 clamp(30px,4vw,52px)/1.1 "Space Grotesk",sans-serif;letter-spacing:-.035em;margin:0 0 16px}.studio-vendors ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;list-style:none;padding:0;margin:32px 0 0}.studio-vendors li{font-size:16px;line-height:1.6;border-top:1px solid #cbc4b8;padding:24px 20px 24px 0;min-width:0}.studio-vendors img{display:block;width:160px;height:56px;object-fit:contain;object-position:left center;margin-bottom:16px}.studio-vendors h3{font-size:22px;margin:0 0 8px}.studio-vendors p{font-size:16px;line-height:1.6;margin:0}.studio-vendors a{color:#6b3819}@media(max-width:650px){.studio-vendors ul{grid-template-columns:repeat(2,minmax(0,1fr))}.studio-vendors img{max-width:100%;width:136px}.studio-vendors li{padding-right:16px}}`;
export function preserveVendors(body,job,assets){
 const vendors=verifiedVendors(job.research,job.profile),boards=assets.filter(a=>a.role==='vendor_board');
 if(boards.length){const $=load(body,null,false);if(!$('.studio-partner-board').length){const section=$('<section class="studio-partner-board"><h2>Business partners</h2></section>');for(const board of boards)section.append($('<img loading="lazy">').attr({src:board.src,alt:'Business partners shown on the original company website',width:board.width,height:board.height,style:'display:block;width:100%;max-width:900px;height:auto;margin:24px auto'}));section.attr('style','padding:40px 24px;background:#fff;color:#152238');$('main').append(section);}body=$.html();}
 if(!vendors.length)return body;
 const $=load(body,null,false);
 // Restore only omitted vendors, leaving a model's complete, individually designed section intact.
 const text=$('main').text().toLowerCase();if(vendors.every(v=>text.includes(v.name.toLowerCase())))return $.html();
 $('.studio-vendors').remove();
 const section=$('<section class="studio-vendors" aria-labelledby="studio-vendors-heading"><div><h2 id="studio-vendors-heading">Technology partners</h2><p>Technology featured by '+job.profile.name.replace(/[<>&]/g,'')+'.</p><ul></ul></div></section>');
 for(const v of vendors){const li=$('<li></li>'),asset=assets.find(a=>a.vendorName===v.name);if(asset)li.append($('<img loading="lazy" width="160" height="56">').attr({src:asset.src,alt:v.name+' logo'}));li.append($('<h3></h3>').text(v.name),$('<p></p>').text(v.category));section.find('ul').append(li);}
 const hero=$('main section').first();if(hero.length)hero.after(section);else $('main').append(section);return $.html();
}

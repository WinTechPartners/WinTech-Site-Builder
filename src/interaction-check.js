export async function checkInteractions(page,home){
 const result=await page.evaluate(home=>{
  const issues=[],proof={runtime:document.documentElement.dataset.studioRuntime==='1'};if(!proof.runtime)issues.push('Trusted interaction runtime did not start');
  const explorer=document.querySelector('.studio-explorer');
  if(home&&!explorer)issues.push('Homepage service explorer is missing');
  if(explorer){const tabs=[...explorer.querySelectorAll('[role=tab]')],panels=[...explorer.querySelectorAll('[role=tabpanel]')];proof.options=tabs.length;
   if(tabs.length<1||explorer.dataset.enhanced!=='true')issues.push('Service explorer did not activate');
   else{const chosen=tabs.length>1?1:0;tabs[chosen].click();proof.selection=tabs[chosen].getAttribute('aria-selected')==='true'&&!panels[chosen].hidden&&panels.filter(p=>!p.hidden).length===1;if(!proof.selection)issues.push('Service selection did not change the visible panel');tabs[chosen].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));const next=(chosen+1)%tabs.length;proof.keyboard=document.activeElement===tabs[next]&&tabs[next].getAttribute('aria-selected')==='true';if(!proof.keyboard)issues.push('Service explorer keyboard navigation failed');proof.nextSteps=[...panels[chosen].querySelectorAll('a')].every(a=>a.getAttribute('href')&&a.getAttribute('href')!=='#');if(!proof.nextSteps)issues.push('Service explorer next steps have no destination');tabs[0].click();}
  }
  const inquiry=document.querySelector('.studio-inquiry');if(inquiry){const field=inquiry.querySelector('textarea'),link=inquiry.querySelector('a.studio-compose');field.value='Browser verification inquiry';field.dispatchEvent(new Event('input',{bubbles:true}));proof.inquiryDraft=link.protocol==='mailto:'&&decodeURIComponent(link.href).includes('Browser verification inquiry');field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));if(!proof.inquiryDraft)issues.push('Local inquiry preparation failed');}
  const menu=[...document.querySelectorAll('header details')].find(d=>d.querySelector('summary'));if(menu){menu.open=true;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));proof.menuEscape=!menu.open;if(!proof.menuEscape)issues.push('Mobile menu does not close with Escape');}
  document.getAnimations().forEach(a=>{try{a.finish();}catch{}});
  return {proof,issues};
 },home);
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 const reduced=await page.evaluate(()=>{document.getAnimations().forEach(a=>{try{a.finish();}catch{}});document.querySelectorAll('.studio-explorer [role=tab]')[1]?.click();const animations=document.querySelector('.studio-explorer')?.getAnimations({subtree:true})||[];document.querySelector('.studio-explorer [role=tab]')?.click();return matchMedia('(prefers-reduced-motion: reduce)').matches&&animations.filter(a=>a.playState==='running').length===0;});
 result.proof.reducedMotion=reduced;if(!reduced)result.issues.push('Reduced-motion preference was not respected');await page.emulateMediaFeatures([]);return result;
}

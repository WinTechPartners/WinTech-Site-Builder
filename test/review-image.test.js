import test from 'node:test';import assert from 'node:assert/strict';import {getBrowser,closeBrowser} from '../src/checks.js';import {encodeReviewImage} from '../src/review-image.js';
test('detailed review screenshots fit the unchanged JPEG bound before model submission',async()=>{
 const page=await(await getBrowser()).newPage();try{
  const base64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1280;c.height=1100;const ctx=c.getContext('2d'),pixels=ctx.createImageData(c.width,c.height);let seed=19;for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>>8)&255;pixels.data[i+2]=(seed>>>16)&255;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);return c.toDataURL('image/png').split(',')[1];});
  for(const mobile of [true,false]){const result=await page.evaluate(encodeReviewImage,{base64,mobile});assert.match(result,/^data:image\/jpeg;base64,/);assert.ok(result.length<=30000);const dimensions=await page.evaluate(async src=>{const i=new Image();i.src=src;await i.decode();return {w:i.width,h:i.height};},result);assert.ok(dimensions.w<=(mobile?390:768));assert.ok(dimensions.w>=(mobile?230:450));assert.ok(Math.abs(dimensions.h/dimensions.w-1100/1280)<.01);}
 }finally{await page.close();await closeBrowser();}
});

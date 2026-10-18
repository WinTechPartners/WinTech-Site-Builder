// Evaluated in an isolated blank browser page, never inside the preview CSP.
export async function encodeReviewImage({base64,mobile}){
 const source=new Image();source.src='data:image/png;base64,'+base64;await source.decode();
 const canvas=document.createElement('canvas');let width=mobile?390:768;
 for(let size=0;size<4;size++){
  canvas.width=Math.round(width);canvas.height=Math.round(source.height*canvas.width/source.width);
  canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
  let low=.03,high=.8,best=canvas.toDataURL('image/jpeg',low);
  if(best.length<=30000){for(let i=0;i<9;i++){const q=(low+high)/2,data=canvas.toDataURL('image/jpeg',q);if(data.length<=30000){best=data;low=q;}else high=q;}return best;}
  width*=.85;
 }
 throw new Error('Visual review image exceeds bounded input size');
}

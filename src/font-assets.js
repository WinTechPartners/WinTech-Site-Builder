import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {ROOT} from './config.js';
const tags='cmap head hhea hmtx maxp name OS/2 post cvt_ fpgm glyf loca prep CFF_ VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG_ sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill'.split(' ');
export function weightRange(bytes){
 if(bytes.toString('ascii',0,4)!=='wOF2')throw new Error('Font is not correctly encoded WOFF2');
 let cursor=48;const tableDirectory=[];
 const base128=()=>{let value=0,next,count=0;do{if(++count>5||cursor>=bytes.length)throw new Error('Invalid font directory');next=bytes[cursor++];value=value*128+(next&127);}while(next&128);return value;};
 for(let i=0;i<bytes.readUInt16BE(12);i++){
  const flags=bytes[cursor++],index=flags&63;let tag;
  if(index===63){tag=bytes.toString('ascii',cursor,cursor+4);cursor+=4;}else tag=tags[index].replace('_',' ');
  const length=base128(),version=flags>>6,transformed=['glyf','loca'].includes(tag)?version!==3:version!==0;
  tableDirectory.push({tag,length:transformed?base128():length});
 }
 const raw=zlib.brotliDecompressSync(bytes.subarray(cursor,cursor+bytes.readUInt32BE(20)),{maxOutputLength:4_000_000});let offset=0;
 for(const table of tableDirectory){
  if(table.tag==='fvar'){
   const data=raw.subarray(offset,offset+table.length);
   for(let i=0;i<data.readUInt16BE(8);i++){const p=data.readUInt16BE(4)+i*data.readUInt16BE(10);if(data.toString('ascii',p,p+4)==='wght')return{min:data.readInt32BE(p+4)/65536,max:data.readInt32BE(p+12)/65536};}
  }
  offset+=table.length;
 }
 throw new Error('Font has no variable weight axis');
}
export function verifyFontAssets(){
 for(const [file,min,max]of [['manrope.woff2',400,800],['space-grotesk.woff2',400,700]]){
  const range=weightRange(fs.readFileSync(path.join(ROOT,'public','fonts',file)));
  if(range.min>min||range.max<max)throw new Error('Font weight range does not match its CSS declaration: '+file);
 }
}

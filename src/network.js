import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';
import fetch from 'node-fetch';

export function publicIP(address) {
  if (net.isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0||b===2)) || (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19||b===51)) || (a===203&&b===0));
  }
  if (net.isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(db8|0:|10:|20:)/i.test(address) && !/^2002:/i.test(address);
  return false;
}
export function normalizeTarget(value) {
  const u = new URL(/^https?:\/\//i.test(String(value).trim()) ? String(value).trim() : `https://${String(value).trim()}`);
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port))) throw new Error('Use a public HTTP(S) website without credentials or a custom port');
  if (u.hostname === 'localhost' || /\.(local|internal|localhost)$/i.test(u.hostname)) throw new Error('Local and private URLs are not research targets');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !publicIP(host)) throw new Error('Private or reserved IP addresses are blocked');
  u.hash = ''; return u.href;
}
export async function safeFetch(input, { maxBytes=1_500_000, timeout=15000, accept='text/html', redirects=5 }={}) {
  let target = normalizeTarget(input);
  for (let n=0;n<=redirects;n++) {
    const u = new URL(target), hostname = u.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(hostname) ? [{ address:hostname,family:net.isIP(hostname) }] : await dns.lookup(hostname,{all:true});
    if (!addresses.length || addresses.some(a=>!publicIP(a.address))) throw new Error('Target resolves to a private/reserved network');
    const selected=addresses[0];
    const agent = new (u.protocol==='https:'?https.Agent:http.Agent)({lookup:(_h,options,cb)=>options?.all?cb(null,[selected]):cb(null,selected.address,selected.family)});
    try {
      const response=await fetch(target,{agent,redirect:'manual',timeout,size:maxBytes,headers:{'User-Agent':'WinTechPreviewStudio/1.0 (public company website research)',Accept:accept}});
      if ([301,302,303,307,308].includes(response.status)) { const location=response.headers.get('location'); response.body?.destroy(); if (!location) throw new Error('Redirect lacks destination'); target=normalizeTarget(new URL(location,target).href); continue; }
      if (!response.ok) {response.body?.destroy(); throw new Error(`HTTP ${response.status}`);}
      const type=response.headers.get('content-type')||'';
      const bytes=await response.buffer();
      return {url:target,type,bytes,text:bytes.toString('utf8')};
    } finally {agent.destroy();}
  }
  throw new Error('Too many redirects');
}

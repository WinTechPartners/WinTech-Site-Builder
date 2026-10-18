import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

// Keep the main site's SPA fallback out of the independently hosted previews.
export function createStaticHandler(handler, config, directory) {
  return async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const preview = pathname === '/ws' || pathname.startsWith('/ws/');
      if (preview && !['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, {'Allow':'GET, HEAD'}); return res.end();
      }
      if(preview&&process.env.PUBLIC_PREVIEW_UPSTREAM){
        const base=new URL(process.env.PUBLIC_PREVIEW_UPSTREAM);
        if(base.protocol!=='https:'||base.username||base.password)throw Error('Invalid preview upstream');
        const response=await fetch(new URL(req.url,base),{method:req.method,redirect:'manual',signal:AbortSignal.timeout(15000)});
        const headers={};for(const name of ['content-type','content-security-policy','x-robots-tag','location','cache-control'])if(response.headers.has(name))headers[name]=response.headers.get(name);
        res.writeHead(response.status,headers);return res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
      }
      if (pathname === '/ws' || pathname === '/ws/') {
        res.writeHead(302, {Location:'/ws/list'}); return res.end();
      }
      const rewrites = (config.rewrites || []).filter(r => preview ? r.source.startsWith('/ws/') : !r.source.startsWith('/ws/'));
      await handler(req, res, {...config, rewrites, public:directory, directoryListing:false});
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end('Unable to serve this page');
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {default:handler} = await import('serve-handler');
  const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
  const config = JSON.parse(fs.readFileSync(path.join(directory, 'serve.json'), 'utf8'));
  http.createServer(createStaticHandler(handler, config, directory)).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('WinTech website and public previews listening'));
}

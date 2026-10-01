const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  let target;
  try { target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url,'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (!target.startsWith(root + path.sep) || target.includes(`${path.sep}desktop${path.sep}`) || !types[path.extname(target)]) { res.writeHead(404).end(); return; }
  fs.readFile(target,(err,data)=>{ if(err){res.writeHead(404).end();return;} res.writeHead(200,{'Content-Type':types[path.extname(target)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}).end(data); });
});
server.listen(Number(process.env.PORT || 4173),'127.0.0.1',()=>console.log('Blaze: http://127.0.0.1:' + server.address().port));

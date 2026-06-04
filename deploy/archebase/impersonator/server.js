// ArcheBase impersonator sidecar: mint/refresh librechat client_credentials
// token, inject as Bearer, pass through X-AIFlow-Impersonate-Sub, proxy to the
// AIFlow gateway. Zero static AIFlow key; per-user attribution via aiflow's
// Phase C impersonator middleware. No external deps.
const http = require('http');
const https = require('https');
const { URL } = require('url');

const ISSUER  = (process.env.OIDC_ISSUER || 'https://gate.archebase.ai').replace(/\/$/, '');
const CID     = process.env.OIDC_CLIENT_ID;
const CSECRET = process.env.OIDC_CLIENT_SECRET;
const SCOPE   = process.env.OIDC_SCOPE || 'openid';
const UP      = new URL(process.env.UPSTREAM || 'https://aiflow.archebase.ai/llm');
const PORT    = parseInt(process.env.PORT || '8080', 10);

let cache = { token: null, exp: 0 };

function mint() {
  return new Promise((resolve, reject) => {
    const body = 'grant_type=client_credentials&scope=' + encodeURIComponent(SCOPE);
    const u = new URL(ISSUER + '/oauth/token');
    const r = https.request(u, { method: 'POST', headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(CID + ':' + CSECRET).toString('base64'),
      'Content-Length': Buffer.byteLength(body),
    }}, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error('token ' + res.statusCode + ': ' + d));
        try { const j = JSON.parse(d); resolve({ token: j.access_token, ttl: j.expires_in || 3600 }); }
        catch (e) { reject(e); }
      });
    });
    r.on('error', reject); r.write(body); r.end();
  });
}
async function token(force) {
  const now = Date.now() / 1000;
  if (!force && cache.token && now < cache.exp) return cache.token;
  const { token, ttl } = await mint();
  cache = { token, exp: now + ttl * 0.8 };
  return token;
}
function send(req, res, body, tok, retried) {
  const path = UP.pathname.replace(/\/$/, '') + req.url;
  const headers = { ...req.headers, host: UP.host, authorization: 'Bearer ' + tok };
  if (body.length) headers['content-length'] = body.length; else delete headers['content-length'];
  const lib = UP.protocol === 'https:' ? https : http;
  const preq = lib.request({ hostname: UP.hostname, port: UP.port || (UP.protocol==='https:'?443:80),
    method: req.method, path, headers }, (pres) => {
    if (pres.statusCode === 401 && !retried) { pres.resume();
      return token(true).then(t => send(req, res, body, t, true))
        .catch(() => { res.writeHead(502); res.end('token refresh failed'); }); }
    res.writeHead(pres.statusCode, pres.headers); pres.pipe(res);
  });
  preq.on('error', e => { res.writeHead(502); res.end('upstream: ' + e.message); });
  if (body.length) preq.write(body); preq.end();
}
const FALLBACK_SUB = process.env.FALLBACK_SUB || '1';
http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  // LibreChat's OpenAI-compatible /models fetch does NOT resolve
  // {{LIBRECHAT_USER_*}} header placeholders, so GET /models arrives with a
  // literal/invalid X-AIFlow-Impersonate-Sub. Model listing is read-only and
  // global, so for GET we substitute a fallback sub to let the fetch succeed.
  // POST (chat) keeps the real, header-resolved sub — never faked — so
  // per-user attribution stays correct.
  const rawSub = req.headers['x-aiflow-impersonate-sub'] || '';
  if (req.method === 'GET' && !/^\d+$/.test(rawSub)) {
    req.headers['x-aiflow-impersonate-sub'] = FALLBACK_SUB;
  }
  console.log('REQ ' + req.method + ' ' + req.url + ' sub=[' + rawSub + '] -> [' + (req.headers['x-aiflow-impersonate-sub']||'<none>') + ']');
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
    let tok; try { tok = await token(false); }
    catch (e) { res.writeHead(502); return res.end('token error: ' + e.message); }
    send(req, res, Buffer.concat(chunks), tok, false);
  });
}).listen(PORT, () => console.log('impersonator sidecar on :' + PORT + ' -> ' + UP.href));

const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const PROXY_HOST = process.env.PROXY_HOST || 'wx.yun-ding.com';

// ── 域名映射表 ──────────────────────────────────────────────
const UPSTREAM = {
  main:    'web.wechat.com',
  res:     'res.wx.qq.com',
  login:   'login.web.wechat.com',
  webpush: 'webpush.web.wechat.com',
  file:    'file.web.wechat.com',
  long:    'long.web.wechat.com',
  api:     'api.web.wechat.com',
};

// ── 响应内容 URL 重写函数 ────────────────────────────────────
function rewriteBody(body) {
  if (typeof body !== 'string') return body;
  return body
    // 1. 静态资源与子域名 URL 替换为同源代理路径
    .replace(/https?:\/\/res\.wx\.qq\.com/g, `https://${PROXY_HOST}/__res__`)
    .replace(/\/\/res\.wx\.qq\.com/g, `//${PROXY_HOST}/__res__`)
    
    .replace(/https?:\/\/login\.web\.wechat\.com/g, `https://${PROXY_HOST}/__login__`)
    .replace(/\/\/login\.web\.wechat\.com/g, `//${PROXY_HOST}/__login__`)
    .replace(/https?:\/\/login\.weixin\.qq\.com/g, `https://${PROXY_HOST}/__login__`)
    .replace(/\/\/login\.weixin\.qq\.com/g, `//${PROXY_HOST}/__login__`)
    
    .replace(/https?:\/\/webpush\.web\.wechat\.com/g, `https://${PROXY_HOST}/__webpush__`)
    .replace(/\/\/webpush\.web\.wechat\.com/g, `//${PROXY_HOST}/__webpush__`)
    .replace(/https?:\/\/webpush\.weixin\.qq\.com/g, `https://${PROXY_HOST}/__webpush__`)
    .replace(/\/\/webpush\.weixin\.qq\.com/g, `//${PROXY_HOST}/__webpush__`)

    .replace(/https?:\/\/file\.web\.wechat\.com/g, `https://${PROXY_HOST}/__file__`)
    .replace(/\/\/file\.web\.wechat\.com/g, `//${PROXY_HOST}/__file__`)
    .replace(/https?:\/\/file\.wx\.qq\.com/g, `https://${PROXY_HOST}/__file__`)
    .replace(/\/\/file\.wx\.qq\.com/g, `//${PROXY_HOST}/__file__`)

    .replace(/https?:\/\/long\.web\.wechat\.com/g, `https://${PROXY_HOST}/__long__`)
    .replace(/\/\/long\.web\.wechat\.com/g, `//${PROXY_HOST}/__long__`)

    .replace(/https?:\/\/api\.web\.wechat\.com/g, `https://${PROXY_HOST}/__api__`)
    .replace(/\/\/api\.web\.wechat\.com/g, `//${PROXY_HOST}/__api__`)

    // 2. 核心：重写 index.js 内 confFactory 动态拼接的 host 变量
    .replace(/loginHost\s*=\s*["'][^"']+["']/g, `loginHost = "${PROXY_HOST}/__login__"`)
    .replace(/pushHost\s*=\s*["'][^"']+["']/g, `pushHost = "${PROXY_HOST}/__webpush__"`)
    .replace(/fileHost\s*=\s*["'][^"']+["']/g, `fileHost = "${PROXY_HOST}/__file__"`)

    // 3. 主站域名替换
    .replace(/https?:\/\/web\.wechat\.com/g, `https://${PROXY_HOST}`)
    .replace(/\/\/web\.wechat\.com/g, `//${PROXY_HOST}`)

    // 4. 移除 frame-busting 防嵌跳出脚本
    .replace(/if\s*\(\s*window\.top\s*!==\s*window\.self\s*\)\s*\{[^}]*\}/g, '/* frame-buster removed */');
}

// ── 代理中间件工厂 ──────────────────────────────────────────
function makeProxy(target, pathRewrite) {
  return createProxyMiddleware({
    target: `https://${target}`,
    changeOrigin: true,
    secure: true,
    selfHandleResponse: true,
    pathRewrite,
    proxyTimeout: 120000,
    timeout: 120000,
    onProxyReq: (proxyReq) => {
      // 强制微信官方 Referer 与 Origin，绕过防盗链及 Referer 白名单校验
      proxyReq.setHeader('Referer', 'https://web.wechat.com/');
      proxyReq.setHeader('Origin', 'https://web.wechat.com');
      proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    },
    onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      // 剥离安全头，允许任意前端或 iframe 嵌入加载
      res.removeHeader('x-frame-options');
      res.removeHeader('content-security-policy');
      res.removeHeader('x-content-security-policy');
      res.removeHeader('x-webkit-csp');
      res.removeHeader('x-xss-protection');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      // Cookie 作用域绑定到当前代理域名
      const setCookies = proxyRes.headers['set-cookie'];
      if (setCookies) {
        res.setHeader('set-cookie', (Array.isArray(setCookies) ? setCookies : [setCookies]).map(c =>
          c.replace(/domain=\.[^;]+/gi, `Domain=.${PROXY_HOST}`)
           .replace(/; Secure/gi, '')
           .replace(/; SameSite=\w+/gi, '')
        ));
      }

      // 对文本、JS、JSON 内容执行 URL 重写
      const ct = proxyRes.headers['content-type'] || '';
      if (ct.includes('text') || ct.includes('javascript') || ct.includes('json') || ct.includes('xml')) {
        return rewriteBody(responseBuffer.toString('utf8'));
      }
      return responseBuffer;
    }),
    onError: (err, req, res) => {
      console.error('[proxy error]', err.message, req.url);
      if (!res.headersSent) res.status(502).send('代理服务暂时不可用');
    },
  });
}

// ── CORS 预检处理 ──────────────────────────────────────────
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.sendStatus(204);
});

// ── 静态资源 & 子域代理路由 ─────────────────────────────────
app.use('/__res__',     makeProxy(UPSTREAM.res,     { '^/__res__': '' }));
app.use('/__login__',   makeProxy(UPSTREAM.login,   { '^/__login__': '' }));
app.use('/__webpush__', makeProxy(UPSTREAM.webpush, { '^/__webpush__': '' }));
app.use('/__push__',    makeProxy(UPSTREAM.webpush, { '^/__push__': '' }));
app.use('/__file__',    makeProxy(UPSTREAM.file,    { '^/__file__': '' }));
app.use('/__long__',    makeProxy(UPSTREAM.long,    { '^/__long__': '' }));
app.use('/__api__',     makeProxy(UPSTREAM.api,     { '^/__api__': '' }));

// ── Push Login 辅助 ─────────────────────────────────────────
app.get('/api/pushlogin', async (req, res) => {
  const { uin } = req.query;
  if (!uin) return res.status(400).json({ error: 'uin 参数必填' });
  try {
    const https = require('https');
    const url = `https://web.wechat.com/cgi-bin/mmwebwx-bin/webwxpushloginurl?uin=${uin}`;
    https.get(url, { headers: { Referer: 'https://web.wechat.com/' } }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res.json(JSON.parse(d)));
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 健康检查 ────────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', proxy: '→ https://web.wechat.com', host: PROXY_HOST }));

// ── 主站反代（处理主页面及 /cgi-bin/... 相对路径）──────────────
app.use('/', makeProxy(UPSTREAM.main));

// ── 启动服务 ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ wx-proxy running on port ${PORT}`);
  console.log(`   Host: ${PROXY_HOST}`);
  console.log(`   URL rewriting: enabled`);
  console.log(`   Frame-busting: disabled`);
});

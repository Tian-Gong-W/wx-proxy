const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// ── 目标域名映射 ──────────────────────────────────────────
const DOMAIN_MAP = {
  '/wx-res':    'https://res.wx.qq.com',
  '/wx-login':  'https://login.wx.qq.com',
  '/wx-long':   'https://long.web.wechat.com',
  '/wx-webpush':'https://webpush.web.wechat.com',
  '/wx-api':    'https://api.web.wechat.com',
};

const MAIN_TARGET = 'https://web-weixin.qq.com';
const PROXY_HOST  = process.env.PROXY_HOST || 'wx.yun-ding.com';

// ── 公共响应头处理 ─────────────────────────────────────────
function stripSecurityHeaders(proxyRes, req, res) {
  // 去掉阻止 iframe 嵌入的头
  delete proxyRes.headers['x-frame-options'];
  delete proxyRes.headers['content-security-policy'];
  delete proxyRes.headers['x-xss-protection'];

  // Cookie 域名重写：把 .qq.com 改为我们的域名
  const setCookies = proxyRes.headers['set-cookie'];
  if (setCookies) {
    proxyRes.headers['set-cookie'] = setCookies.map(cookie =>
      cookie
        .replace(/domain=\.wx\.qq\.com/gi, `domain=.${PROXY_HOST}`)
        .replace(/domain=\.qq\.com/gi, `domain=.${PROXY_HOST}`)
        .replace(/; Secure/gi, '')       // 本地开发去掉 Secure
        .replace(/; SameSite=\w+/gi, '') // 去掉 SameSite 限制
    );
  }

  // 允许跨域（供 iframe 使用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// ── 代理选项工厂 ──────────────────────────────────────────
function makeProxy(target, pathRewrite) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: true,
    followRedirects: true,
    pathRewrite,
    on: {
      proxyRes: stripSecurityHeaders,
      error: (err, req, res) => {
        console.error('[proxy error]', err.message);
        res.status(502).send('代理服务暂时不可用，请刷新重试');
      },
    },
    headers: {
      'Referer':         'https://web-weixin.qq.com/',
      'Origin':          'https://web-weixin.qq.com',
      'User-Agent':      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    },
  });
}

// ── 静态资源 / 子域代理路由 ───────────────────────────────
for (const [path, target] of Object.entries(DOMAIN_MAP)) {
  app.use(path, makeProxy(target, { [`^${path}`]: '' }));
}

// ── Push Login 辅助接口 ───────────────────────────────────
// GET /api/pushlogin?uin=<uin>
// 触发微信手机端推送「确认登录」通知
app.get('/api/pushlogin', async (req, res) => {
  const { uin } = req.query;
  if (!uin) return res.status(400).json({ error: 'uin 参数必填' });

  try {
    const fetch = require('node-fetch');
    const url = `https://web-weixin.qq.com/cgi-bin/mmwebwx-bin/webwxpushloginurl?uin=${uin}`;
    const resp = await fetch(url, {
      headers: {
        'Referer': 'https://web-weixin.qq.com/',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      },
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 健康检查 ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', proxy: `→ ${MAIN_TARGET}`, host: PROXY_HOST });
});

// ── 主站反代（放最后，匹配所有）──────────────────────────
app.use('/', makeProxy(MAIN_TARGET));

// ── 启动 ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ wx-proxy running on port ${PORT}`);
  console.log(`   代理目标: ${MAIN_TARGET}`);
  console.log(`   Push Login: GET /api/pushlogin?uin=<uin>`);
});

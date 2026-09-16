# wx-proxy

微信网页版反向代理服务，部署于 `wx.yun-ding.com`

## 功能

- 透明代理 `web-weixin.qq.com`，去除 X-Frame-Options 限制
- 支持 Push Login（免扫码，手机点确认）
- Cookie 域名自动重写

## 本地开发

```bash
npm install
PROXY_HOST=localhost:3000 node server.js
```

访问 http://localhost:3000

## 部署到 Railway

此目录已包含 `Dockerfile` 和 `railway.json`，直接 push 到 GitHub 即可触发 Railway 自动部署。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口（Railway 自动注入） |
| `PROXY_HOST` | `wx.yun-ding.com` | 代理域名（用于 Cookie 重写） |

## Push Login 接口

```
GET /api/pushlogin?uin=<你的微信uin>
```

触发手机微信推送「确认登录」通知。`uin` 从首次扫码登录后的 Cookie 中获取。

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

ENV NODE_ENV=production
ENV PROXY_HOST=wx.yun-ding.com

CMD ["node", "server.js"]

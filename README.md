# LLM4Parents - AI 智能助手

一个简单易用的 GPT 聊天网站，专为父母设计，支持中国大陆访问。

A simple and user-friendly GPT chat website designed for parents, with support for access from China.

## 功能特点 / Features

- 🤖 支持最新的 GPT 模型 (GPT-4o, GPT-4, GPT-3.5)
- 🇨🇳 中文界面，适合中国用户
- 📱 响应式设计，支持手机和电脑
- 💾 对话历史本地保存
- ⚡ 流式输出，实时显示回复
- 🎨 简洁美观的界面
- 🔒 无外部 CDN 依赖，所有资源自托管

## 快速开始 / Quick Start

### 1. 安装依赖 / Install Dependencies

```bash
npm install
```

### 2. 配置环境变量 / Configure Environment

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的 OpenAI API Key
# Edit .env file and add your OpenAI API Key
```

### 3. 启动服务 / Start Server

```bash
npm start
```

服务将运行在 http://localhost:3000

## 中国大陆部署指南 / China Deployment Guide

由于 OpenAI API 在中国大陆无法直接访问，以下是几种解决方案：

### 方案一：使用海外服务器（推荐）

1. **购买海外云服务器**
   - 推荐地区：香港、新加坡、日本、美国
   - 推荐服务商：
     - 阿里云国际版（香港/新加坡）
     - 腾讯云国际版
     - AWS Lightsail
     - Vultr
     - DigitalOcean

2. **部署步骤**
   ```bash
   # 在服务器上
   git clone <your-repo-url>
   cd LLM4parents
   npm install
   cp .env.example .env
   # 编辑 .env 添加 API Key
   npm start
   ```

3. **使用 PM2 保持运行**
   ```bash
   npm install -g pm2
   pm2 start server.js --name llm4parents
   pm2 save
   pm2 startup
   ```

4. **配置域名和 HTTPS**（推荐）
   ```bash
   # 安装 Nginx
   sudo apt install nginx

   # 安装 Certbot 获取免费 SSL 证书
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

   Nginx 配置示例：
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl;
       server_name your-domain.com;

       ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### 方案二：使用 API 代理服务

如果你已有国内服务器，可以使用第三方 API 代理服务：

1. 修改 `.env` 文件中的 `OPENAI_BASE_URL`：
   ```
   OPENAI_BASE_URL=https://your-proxy-api.com/v1
   ```

2. 常见的代理服务提供商（需自行评估安全性）：
   - OpenAI-SB
   - API2D
   - 其他第三方代理

⚠️ **注意**：使用第三方代理服务时，请注意数据安全和隐私问题。

### 方案三：使用 Cloudflare Workers（免费）

1. 注册 Cloudflare 账号
2. 创建一个 Worker，代理 OpenAI API 请求
3. 将 `OPENAI_BASE_URL` 设置为你的 Worker 地址

### Docker 部署（可选）

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# 构建和运行
docker build -t llm4parents .
docker run -d -p 3000:3000 --env-file .env llm4parents
```

## 获取 OpenAI API Key

1. 访问 https://platform.openai.com/
2. 注册或登录账号
3. 进入 API Keys 页面：https://platform.openai.com/api-keys
4. 创建新的 API Key
5. 将 Key 复制到 `.env` 文件中

⚠️ **重要提示**：
- API Key 需要绑定支付方式才能使用
- 建议设置用量限制，避免超额
- 不要将 API Key 提交到公开代码库

## 常见问题 / FAQ

### Q: 为什么显示"API密钥未配置"？
A: 请检查 `.env` 文件是否正确配置了 `OPENAI_API_KEY`。

### Q: 为什么请求超时？
A:
1. 检查服务器是否能访问 OpenAI API
2. 如果在中国大陆服务器，需要配置代理

### Q: 如何更换模型？
A: 在网页顶部的下拉菜单中选择不同的模型。

### Q: 对话记录存在哪里？
A: 对话记录保存在浏览器本地存储中，清除浏览器数据会丢失记录。

## 技术栈 / Tech Stack

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JavaScript（无框架依赖）
- **API**: OpenAI Chat Completions API

## 安全建议 / Security Tips

1. 不要将 `.env` 文件提交到版本控制
2. 在生产环境中使用 HTTPS
3. 设置 OpenAI API 的用量限制
4. 考虑添加简单的访问密码保护

## 许可证 / License

MIT License

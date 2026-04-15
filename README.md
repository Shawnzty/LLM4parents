# LLM4Parents - AI 智能助手

一个简单易用的 GPT 聊天网站，专为父母设计。

A simple and user-friendly GPT chat website designed for parents.

## 功能特点 / Features

- 🤖 支持最新的 GPT 模型
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
A: 检查服务器是否能访问 OpenAI API

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

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // If using a proxy or alternative endpoint (useful for China access)
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

// Available models configuration
const AVAILABLE_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o (推荐/Recommended)' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (快速/Fast)' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-4', name: 'GPT-4' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (经济/Economic)' },
];

// Get available models
app.get('/api/models', (req, res) => {
  res.json({ models: AVAILABLE_MODELS });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model = 'gpt-4o' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '请提供有效的消息 / Please provide valid messages' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API密钥未配置 / API key not configured' });
    }

    // Validate model
    const validModel = AVAILABLE_MODELS.find(m => m.id === model);
    if (!validModel) {
      return res.status(400).json({ error: '无效的模型 / Invalid model' });
    }

    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: 4096,
      temperature: 0.7,
    });

    res.json({
      message: completion.choices[0].message,
      usage: completion.usage,
    });
  } catch (error) {
    console.error('OpenAI API Error:', error);

    if (error.status === 401) {
      return res.status(401).json({ error: 'API密钥无效 / Invalid API key' });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试 / Too many requests, please try again later' });
    }
    if (error.status === 503) {
      return res.status(503).json({ error: '服务暂时不可用 / Service temporarily unavailable' });
    }

    res.status(500).json({
      error: '发生错误，请稍后再试 / An error occurred, please try again later',
      details: error.message
    });
  }
});

// Chat endpoint with streaming
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { messages, model = 'gpt-4o' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '请提供有效的消息 / Please provide valid messages' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API密钥未配置 / API key not configured' });
    }

    // Validate model
    const validModel = AVAILABLE_MODELS.find(m => m.id === model);
    if (!validModel) {
      return res.status(400).json({ error: '无效的模型 / Invalid model' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await openai.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: 4096,
      temperature: 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('OpenAI API Stream Error:', error);
    res.status(500).json({
      error: '发生错误，请稍后再试 / An error occurred, please try again later'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 / Server running at http://localhost:${PORT}`);
  console.log(`API密钥状态 / API key status: ${process.env.OPENAI_API_KEY ? '已配置/Configured' : '未配置/Not configured'}`);
});

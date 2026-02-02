require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images
app.use(express.static(path.join(__dirname, 'public')));

// Lazy initialization of OpenAI client (to avoid crash if API key not set at startup)
let openai = null;

function getOpenAIClient() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });
  }
  return openai;
}

// Available models configuration
// Models marked with supportsVision: true can process images
const AVAILABLE_MODELS = [
  { id: 'gpt-5.2', name: 'GPT-5.2 (最强/Best)', supportsVision: true },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini (快速/Fast)', supportsVision: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (经济/Economic)', supportsVision: true },
];

// Get available models
app.get('/api/models', (req, res) => {
  res.json({ models: AVAILABLE_MODELS });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model = 'gpt-5.2' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '请提供有效的消息 / Please provide valid messages' });
    }

    const client = getOpenAIClient();
    if (!client) {
      return res.status(500).json({ error: 'API密钥未配置 / API key not configured' });
    }

    // Validate model
    const validModel = AVAILABLE_MODELS.find(m => m.id === model);
    if (!validModel) {
      return res.status(400).json({ error: '无效的模型 / Invalid model' });
    }

    const completion = await client.chat.completions.create({
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
    const { messages, model = 'gpt-5.2' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '请提供有效的消息 / Please provide valid messages' });
    }

    const client = getOpenAIClient();
    if (!client) {
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

    const stream = await client.chat.completions.create({
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

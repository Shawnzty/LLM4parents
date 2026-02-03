require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images
app.use(express.static(path.join(__dirname, 'public')));

// Lazy initialization of OpenAI client
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

// Lazy initialization of Gemini client
let gemini = null;
function getGeminiClient() {
  if (!gemini && process.env.GEMINI_API_KEY) {
    gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return gemini;
}

// Available models configuration
const AVAILABLE_MODELS = [
  { id: 'gpt-5.2', name: 'GPT-5.2 (最强/Best)', supportsVision: true, provider: 'openai' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini (快速/Fast)', supportsVision: true, provider: 'openai' },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash (经济/Economic)', supportsVision: true, provider: 'gemini' },
];

// Get available models
app.get('/api/models', (req, res) => {
  res.json({ models: AVAILABLE_MODELS });
});

// Convert OpenAI message format to Gemini format
function convertMessagesToGemini(messages) {
  const contents = [];

  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';

    // Handle multi-modal content (with images)
    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url') {
          // Extract base64 data from data URL
          const dataUrl = item.image_url.url;
          const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
          if (matches) {
            parts.push({
              inlineData: {
                mimeType: matches[1],
                data: matches[2]
              }
            });
          }
        }
      }
      contents.push({ role, parts });
    } else {
      // Simple text message
      contents.push({ role, parts: [{ text: msg.content }] });
    }
  }

  return contents;
}

// Chat endpoint with streaming
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { messages, model = 'gpt-5-mini' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '请提供有效的消息 / Please provide valid messages' });
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

    if (validModel.provider === 'gemini') {
      // Handle Gemini API
      const client = getGeminiClient();
      if (!client) {
        return res.status(500).json({ error: 'Gemini API密钥未配置 / Gemini API key not configured' });
      }

      const contents = convertMessagesToGemini(messages);

      const response = await client.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: contents,
      });

      for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }
    } else {
      // Handle OpenAI API
      const client = getOpenAIClient();
      if (!client) {
        return res.status(500).json({ error: 'OpenAI API密钥未配置 / OpenAI API key not configured' });
      }

      const isGPT5 = model.startsWith('gpt-5');
      const requestOptions = {
        model: model,
        messages: messages,
        stream: true,
      };

      if (isGPT5) {
        requestOptions.max_completion_tokens = 4096;
      } else {
        requestOptions.max_tokens = 4096;
        requestOptions.temperature = 0.7;
      }

      const stream = await client.chat.completions.create(requestOptions);

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('API Stream Error:', error);

    const errorMessage = error.message || '未知错误';
    const statusCode = error.status || 500;

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    } else {
      res.status(statusCode).json({
        error: `API错误: ${errorMessage}`,
      });
    }
  }
});

// Chat endpoint (non-streaming)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model = 'gpt-5-mini' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '请提供有效的消息 / Please provide valid messages' });
    }

    const validModel = AVAILABLE_MODELS.find(m => m.id === model);
    if (!validModel) {
      return res.status(400).json({ error: '无效的模型 / Invalid model' });
    }

    if (validModel.provider === 'gemini') {
      const client = getGeminiClient();
      if (!client) {
        return res.status(500).json({ error: 'Gemini API密钥未配置 / Gemini API key not configured' });
      }

      const contents = convertMessagesToGemini(messages);

      const response = await client.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents,
      });

      res.json({
        message: { role: 'assistant', content: response.text },
        usage: response.usageMetadata,
      });
    } else {
      const client = getOpenAIClient();
      if (!client) {
        return res.status(500).json({ error: 'OpenAI API密钥未配置 / OpenAI API key not configured' });
      }

      const isGPT5 = model.startsWith('gpt-5');
      const requestOptions = {
        model: model,
        messages: messages,
      };

      if (isGPT5) {
        requestOptions.max_completion_tokens = 4096;
      } else {
        requestOptions.max_tokens = 4096;
        requestOptions.temperature = 0.7;
      }

      const completion = await client.chat.completions.create(requestOptions);

      res.json({
        message: completion.choices[0].message,
        usage: completion.usage,
      });
    }
  } catch (error) {
    console.error('API Error:', error);

    if (error.status === 401) {
      return res.status(401).json({ error: 'API密钥无效 / Invalid API key' });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试 / Too many requests, please try again later' });
    }

    res.status(500).json({
      error: '发生错误，请稍后再试 / An error occurred, please try again later',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 / Server running at http://localhost:${PORT}`);
  console.log(`OpenAI API密钥: ${process.env.OPENAI_API_KEY ? '已配置' : '未配置'}`);
  console.log(`Gemini API密钥: ${process.env.GEMINI_API_KEY ? '已配置' : '未配置'}`);
});

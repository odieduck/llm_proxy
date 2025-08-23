const axios = require('axios');
const { logger } = require('../utils/logger');

class OpenAIProvider {
  constructor() {
    this.baseURL = 'https://api.openai.com/v1';
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  async generateCompletion(model, prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.max_tokens || 1000,
          temperature: options.temperature || 0.7,
          ...options
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        provider: 'openai',
        model: model,
        response: response.data.choices[0].message.content,
        usage: response.data.usage,
        raw: response.data
      };
    } catch (error) {
      logger.error('OpenAI API error', { 
        model, 
        error: error.response?.data || error.message 
      });
      throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  getSupportedModels() {
    return [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      'o1-preview',
      'o1-mini',
      'o3-mini'
    ];
  }
}

module.exports = OpenAIProvider;
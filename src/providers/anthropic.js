const axios = require('axios');
const { logger } = require('../utils/logger');

class AnthropicProvider {
  constructor() {
    this.baseURL = 'https://api.anthropic.com/v1';
    this.apiKey = process.env.ANTHROPIC_API_KEY;
  }

  async generateCompletion(model, prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/messages`,
        {
          model: model,
          max_tokens: options.max_tokens || 1000,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature || 0.7,
          ...options
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          timeout: 30000
        }
      );

      return {
        provider: 'anthropic',
        model: model,
        response: response.data.content[0].text,
        usage: response.data.usage,
        raw: response.data
      };
    } catch (error) {
      logger.error('Anthropic API error', { 
        model, 
        error: error.response?.data || error.message 
      });
      throw new Error(`Anthropic API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  getSupportedModels() {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }
}

module.exports = AnthropicProvider;
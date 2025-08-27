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

    // Use Response API for GPT-5 models, Chat Completions for others
    const useResponseAPI = model.startsWith('gpt-5');
    
    try {
      if (useResponseAPI) {
        return await this.generateResponseCompletion(model, prompt, options);
      } else {
        return await this.generateChatCompletion(model, prompt, options);
      }
    } catch (error) {
      logger.error('OpenAI API error', { 
        model, 
        api: useResponseAPI ? 'responses' : 'chat/completions',
        error: error.response?.data || error.message 
      });
      throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async generateChatCompletion(model, prompt, options = {}) {
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
      api: 'chat/completions',
      response: response.data.choices[0].message.content,
      usage: response.data.usage,
      raw: response.data
    };
  }

  async generateResponseCompletion(model, prompt, options = {}) {
    // Build request body according to official OpenAI Response API spec
    const requestBody = {
      model: model,
      input: prompt, // Text input to the model
      instructions: options.instructions || null, // System message
      max_output_tokens: options.max_tokens || 1000,
      temperature: options.temperature || 0.7,
      top_p: options.top_p || null,
      stream: false, // We don't support streaming yet
      store: true, // Store the response for retrieval
      service_tier: 'auto',
      parallel_tool_calls: options.parallel_tool_calls !== false,
      safety_identifier: options.safety_identifier || null,
      metadata: options.metadata || null
    };

    // Add text configuration if specified
    if (options.response_format) {
      requestBody.text = {
        format: options.response_format
      };
    }

    // Add tools if specified
    if (options.tools && Array.isArray(options.tools)) {
      requestBody.tools = options.tools;
    }

    // Add tool_choice if specified
    if (options.tool_choice) {
      requestBody.tool_choice = options.tool_choice;
    }

    const response = await axios.post(
      `${this.baseURL}/responses`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // Longer timeout for Response API
      }
    );

    // Parse response according to Response API format
    let responseText = '';
    let usage = null;
    
    // The Response API may return different formats
    if (response.data.output && Array.isArray(response.data.output)) {
      // Extract text from output items
      const textItems = response.data.output.filter(item => 
        item.type === 'message' && item.message && item.message.content
      );
      if (textItems.length > 0) {
        responseText = textItems[0].message.content;
      }
    } else if (response.data.choices && response.data.choices.length > 0) {
      // Fallback to Chat Completions format if present
      responseText = response.data.choices[0].message?.content || '';
    } else if (response.data.text) {
      // Direct text response
      responseText = response.data.text;
    }

    // Extract usage information
    if (response.data.usage) {
      usage = response.data.usage;
    }

    return {
      provider: 'openai',
      model: model,
      api: 'responses',
      response: responseText || 'No response generated',
      usage: usage,
      response_id: response.data.id || null,
      raw: response.data
    };
  }

  getSupportedModels() {
    return [
      // GPT-5 Models (Latest Generation)
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      
      // GPT-4o Models (Previous Generation)
      'gpt-4o',
      'gpt-4o-mini',
      
      // GPT-4 Models (Legacy)
      'gpt-4-turbo',
      'gpt-4',
      
      // O3 Models (Latest Reasoning)
      'o3-mini',
      
      // O1 Models (Reasoning)
      'o1-preview',
      'o1-mini'
    ];
  }

  getAPIEndpoint(model) {
    return model.startsWith('gpt-5') ? 'responses' : 'chat/completions';
  }

  getModelInfo() {
    return {
      'gpt-5': { api: 'responses', tier: 'flagship', generation: 5 },
      'gpt-5-mini': { api: 'responses', tier: 'efficient', generation: 5 },
      'gpt-5-nano': { api: 'responses', tier: 'ultra-fast', generation: 5 },
      'gpt-4o': { api: 'chat/completions', tier: 'flagship', generation: 4 },
      'gpt-4o-mini': { api: 'chat/completions', tier: 'efficient', generation: 4 },
      'gpt-4-turbo': { api: 'chat/completions', tier: 'advanced', generation: 4 },
      'gpt-4': { api: 'chat/completions', tier: 'standard', generation: 4 },
      'o3-mini': { api: 'chat/completions', tier: 'reasoning', generation: 'o3' },
      'o1-preview': { api: 'chat/completions', tier: 'reasoning', generation: 'o1' },
      'o1-mini': { api: 'chat/completions', tier: 'reasoning', generation: 'o1' }
    };
  }
}

module.exports = OpenAIProvider;
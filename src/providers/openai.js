const axios = require('axios');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { logger } = require('../utils/logger');

class OpenAIProvider {
  constructor() {
    this.baseURL = 'https://api.openai.com/v1';
    this.apiKey = null;
    this.secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.secretName = 'llm-proxy-openai-api-key';
  }

  async getApiKey() {
    if (this.apiKey) {
      return this.apiKey;
    }

    try {
      // Try environment variable first (for local development)
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
        this.apiKey = process.env.OPENAI_API_KEY;
        return this.apiKey;
      }

      // Fallback to AWS Secrets Manager (for production)
      const command = new GetSecretValueCommand({ SecretId: this.secretName });
      const response = await this.secretsClient.send(command);
      this.apiKey = response.SecretString;
      
      logger.info('OpenAI API key loaded from AWS Secrets Manager');
      return this.apiKey;
    } catch (error) {
      logger.error('Failed to retrieve OpenAI API key', { error: error.message });
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable or configure AWS Secrets Manager.');
    }
  }

  async generateCompletion(model, prompt, options = {}) {
    const apiKey = await this.getApiKey();

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
    const apiKey = await this.getApiKey();
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
          'Authorization': `Bearer ${apiKey}`,
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
    const apiKey = await this.getApiKey();
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
          'Authorization': `Bearer ${apiKey}`,
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

  async generateCompletionWithImage(model, message, options = {}) {
    const apiKey = await this.getApiKey();

    // Use Response API for GPT-5 models, Chat Completions for others
    const useResponseAPI = model.startsWith('gpt-5');
    
    try {
      if (useResponseAPI) {
        return await this.generateResponseCompletionWithImage(model, message, options);
      } else {
        return await this.generateChatCompletionWithImage(model, message, options);
      }
    } catch (error) {
      logger.error('OpenAI Vision API error', { 
        model, 
        api: useResponseAPI ? 'responses' : 'chat/completions',
        error: error.response?.data || error.message 
      });
      throw new Error(`OpenAI Vision API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async generateChatCompletionWithImage(model, message, options = {}) {
    const apiKey = await this.getApiKey();
    const response = await axios.post(
      `${this.baseURL}/chat/completions`,
      {
        model: model,
        messages: [message],
        max_tokens: options.max_tokens || 2000,
        temperature: options.temperature || 0.7,
        ...options
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // Longer timeout for image processing
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

  async generateResponseCompletionWithImage(model, message, options = {}) {
    const apiKey = await this.getApiKey();
    // For Response API with images, we need to format differently
    const requestBody = {
      model: model,
      input: [message], // Array of messages for multimodal input
      instructions: options.instructions || null,
      max_output_tokens: options.max_tokens || 2000,
      temperature: options.temperature || 0.1,
      top_p: options.top_p || null,
      stream: false,
      store: true,
      service_tier: 'auto',
      parallel_tool_calls: options.parallel_tool_calls !== false,
      safety_identifier: options.safety_identifier || null,
      metadata: options.metadata || null
    };

    // Add text configuration for JSON response if specified
    if (options.response_format) {
      requestBody.text = {
        format: options.response_format
      };
    }

    const response = await axios.post(
      `${this.baseURL}/responses`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 90000 // Even longer timeout for image processing with Response API
      }
    );

    // Parse response according to Response API format
    let responseText = '';
    let usage = null;
    
    if (response.data.output && Array.isArray(response.data.output)) {
      const textItems = response.data.output.filter(item => 
        item.type === 'message' && item.message && item.message.content
      );
      if (textItems.length > 0) {
        responseText = textItems[0].message.content;
      }
    } else if (response.data.choices && response.data.choices.length > 0) {
      responseText = response.data.choices[0].message?.content || '';
    } else if (response.data.text) {
      responseText = response.data.text;
    }

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
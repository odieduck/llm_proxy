const axios = require('axios');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

class BedrockProvider {
  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    this.service = 'bedrock-runtime';
  }

  async generateCompletion(model, prompt, options = {}) {
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    try {
      const endpoint = `https://bedrock-runtime.${this.region}.amazonaws.com`;
      const path = `/model/${model}/invoke`;
      
      let body;
      if (model.includes('claude')) {
        body = {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: options.max_tokens || 1000,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature || 0.7
        };
      } else if (model.includes('titan')) {
        body = {
          inputText: prompt,
          textGenerationConfig: {
            maxTokenCount: options.max_tokens || 1000,
            temperature: options.temperature || 0.7,
            topP: options.top_p || 0.9
          }
        };
      } else {
        throw new Error(`Unsupported model: ${model}`);
      }

      const headers = this.signRequest('POST', path, JSON.stringify(body));
      
      const response = await axios.post(
        `${endpoint}${path}`,
        body,
        { headers, timeout: 30000 }
      );

      let responseText;
      if (model.includes('claude')) {
        responseText = response.data.content[0].text;
      } else if (model.includes('titan')) {
        responseText = response.data.results[0].outputText;
      }

      return {
        provider: 'bedrock',
        model: model,
        response: responseText,
        usage: response.data.usage || {},
        raw: response.data
      };
    } catch (error) {
      logger.error('Bedrock API error', { 
        model, 
        error: error.response?.data || error.message 
      });
      throw new Error(`Bedrock API error: ${error.response?.data?.message || error.message}`);
    }
  }

  signRequest(method, path, body) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const canonicalHeaders = `content-type:application/json\nhost:bedrock-runtime.${this.region}.amazonaws.com\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
    
    const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

    const signingKey = this.getSignatureKey(this.secretAccessKey, dateStamp, this.region, this.service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      'Authorization': authorization
    };
  }

  getSignatureKey(key, dateStamp, regionName, serviceName) {
    const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  }

  getSupportedModels() {
    return [
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'anthropic.claude-3-5-haiku-20241022-v1:0',
      'anthropic.claude-3-opus-20240229-v1:0',
      'anthropic.claude-3-sonnet-20240229-v1:0',
      'anthropic.claude-3-haiku-20240307-v1:0',
      'amazon.titan-text-premier-v1:0',
      'amazon.titan-text-express-v1'
    ];
  }
}

module.exports = BedrockProvider;
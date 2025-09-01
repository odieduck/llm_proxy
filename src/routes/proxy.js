const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription, requireActivePlan, trackUsage } = require('../middleware/subscription');
const { requireEmailVerification } = require('../middleware/emailVerification');
const providerManager = require('../providers');
const { logger } = require('../utils/logger');

const router = express.Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const completionSchema = Joi.object({
  provider: Joi.string().valid('openai').required(),
  model: Joi.string().required(),
  prompt: Joi.string().required(),
  // Standard parameters
  max_tokens: Joi.number().integer().min(1).max(4000).optional(),
  temperature: Joi.number().min(0).max(2).optional(),
  top_p: Joi.number().min(0).max(1).optional(),
  // Response API specific parameters
  instructions: Joi.string().optional(),
  response_format: Joi.string().optional(),
  tools: Joi.array().optional(),
  tool_choice: Joi.alternatives().try(Joi.string(), Joi.object()).optional(),
  parallel_tool_calls: Joi.boolean().optional(),
  safety_identifier: Joi.string().optional(),
  metadata: Joi.object().optional()
});

// Main proxy endpoint supporting both query params and body
router.get('/', authenticateToken, requireEmailVerification, checkSubscription, trackUsage, async (req, res, next) => {
  try {
    const { provider, model, prompt, max_tokens, temperature, top_p } = req.query;
    
    const { error, value } = completionSchema.validate({
      provider,
      model,
      prompt,
      max_tokens: max_tokens ? parseInt(max_tokens) : undefined,
      temperature: temperature ? parseFloat(temperature) : undefined,
      top_p: top_p ? parseFloat(top_p) : undefined
    });

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const options = {};
    if (value.max_tokens) options.max_tokens = value.max_tokens;
    if (value.temperature) options.temperature = value.temperature;
    if (value.top_p) options.top_p = value.top_p;

    logger.info('LLM request', {
      user: req.user.username,
      provider: value.provider,
      model: value.model,
      promptLength: value.prompt.length
    });

    const result = await providerManager.generateCompletion(
      value.provider,
      value.model,
      value.prompt,
      options
    );

    req.llmResponse = result;
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// POST endpoint for more complex requests
router.post('/completion', authenticateToken, requireEmailVerification, checkSubscription, trackUsage, async (req, res, next) => {
  try {
    const { error, value } = completionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const options = {};
    if (value.max_tokens) options.max_tokens = value.max_tokens;
    if (value.temperature) options.temperature = value.temperature;
    if (value.top_p) options.top_p = value.top_p;

    logger.info('LLM request', {
      user: req.user.username,
      provider: value.provider,
      model: value.model,
      promptLength: value.prompt.length
    });

    const result = await providerManager.generateCompletion(
      value.provider,
      value.model,
      value.prompt,
      options
    );

    req.llmResponse = result;
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Get supported models
router.get('/models', authenticateToken, (req, res) => {
  const { provider } = req.query;
  
  try {
    const models = providerManager.getSupportedModels(provider);
    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get supported providers
router.get('/providers', authenticateToken, (req, res) => {
  const providers = providerManager.getAllProviders();
  res.json({
    success: true,
    data: providers
  });
});

// Get model information including API endpoints
router.get('/model-info', authenticateToken, (req, res) => {
  const { model } = req.query;
  
  try {
    const openaiProvider = providerManager.getProvider('openai');
    const allModels = openaiProvider.getSupportedModels();
    const modelInfo = openaiProvider.getModelInfo();
    
    if (model) {
      const info = modelInfo[model];
      if (!info) {
        return res.status(404).json({ error: `Model ${model} not found` });
      }
      
      res.json({
        success: true,
        model: model,
        data: {
          ...info,
          endpoint: openaiProvider.getAPIEndpoint(model)
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          models: allModels,
          modelInfo: modelInfo
        }
      });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Receipt parsing endpoint - accepts image uploads and sends to GPT-5
router.post('/parse-receipt', authenticateToken, requireEmailVerification, checkSubscription, trackUsage, upload.single('receipt'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No receipt image provided' });
    }

    // Convert image to base64
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    
    // Use GPT-5 as default model for receipt parsing
    const model = req.body.model || 'gpt-5';
    
    // Create a specialized prompt for receipt parsing
    const prompt = `Please analyze this receipt image and extract all the important information in a structured format. Include:

1. Store/Business Information:
   - Store name
   - Store address
   - Store phone number

2. Transaction Details:
   - Date and time
   - Transaction ID or receipt number

3. Items Purchased:
   - Item names
   - Quantities
   - Individual prices
   - Any discounts applied

4. Payment Information:
   - Subtotal
   - Tax amount
   - Total amount
   - Payment method (if visible)

5. Additional Information:
   - Any loyalty program details
   - Return policy information
   - Any special offers or coupons used

Please format the response as a clear, structured JSON object.`;

    // Prepare the request for GPT-5 Vision
    const options = {
      max_tokens: 2000,
      temperature: 0.1 // Lower temperature for more accurate parsing
    };

    logger.info('Receipt parsing request', {
      user: req.user.username,
      model: model,
      fileSize: req.file.size,
      mimeType: mimeType
    });

    // For GPT-5, we need to format the message with the image
    const imageMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`
          }
        }
      ]
    };

    // Generate completion with image
    const result = await providerManager.generateCompletionWithImage(
      'openai',
      model,
      imageMessage,
      options
    );

    req.llmResponse = result;
    
    res.json({
      success: true,
      data: {
        ...result,
        parsedReceipt: true,
        imageSize: req.file.size,
        imageType: mimeType
      }
    });
  } catch (error) {
    logger.error('Receipt parsing error', { 
      user: req.user?.username,
      error: error.message 
    });
    next(error);
  }
});

module.exports = router;
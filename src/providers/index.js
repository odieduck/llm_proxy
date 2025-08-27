const OpenAIProvider = require('./openai');

class ProviderManager {
  constructor() {
    this.providers = {
      openai: new OpenAIProvider()
    };
  }

  getProvider(providerName) {
    const provider = this.providers[providerName.toLowerCase()];
    if (!provider) {
      throw new Error(`Unsupported provider: ${providerName}`);
    }
    return provider;
  }

  getAllProviders() {
    return Object.keys(this.providers);
  }

  async generateCompletion(provider, model, prompt, options = {}) {
    const providerInstance = this.getProvider(provider);
    return await providerInstance.generateCompletion(model, prompt, options);
  }

  getSupportedModels(providerName = null) {
    if (providerName) {
      const provider = this.getProvider(providerName);
      return provider.getSupportedModels();
    }
    
    const allModels = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      allModels[name] = provider.getSupportedModels();
    }
    return allModels;
  }
}

module.exports = new ProviderManager();
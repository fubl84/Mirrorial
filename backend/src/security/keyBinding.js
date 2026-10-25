const { getUrlOrigin } = require('./urlGuard');

// A stored secret is bound to the endpoint it was entered for. If the endpoint changes and no new
// secret is supplied, the old one must be dropped. Otherwise anybody who can save a config could
// point the base URL at their own server and receive the stored key in the next request.

const DEFAULT_LLM_ENDPOINTS = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com',
  custom: 'http://127.0.0.1:11434',
};

const getLlmEndpoint = (llmConfig = {}) => {
  const provider = DEFAULT_LLM_ENDPOINTS[llmConfig.provider] ? llmConfig.provider : 'openai';
  // Anthropic and Google adapters ignore baseUrl, so only openai/custom can be redirected.
  const usesBaseUrl = provider === 'openai' || provider === 'custom';
  const baseUrl = typeof llmConfig.baseUrl === 'string' ? llmConfig.baseUrl.trim() : '';
  return (usesBaseUrl && getUrlOrigin(baseUrl)) || DEFAULT_LLM_ENDPOINTS[provider];
};

const DEFAULT_ROUTING_ENDPOINT = 'https://api.openrouteservice.org';

const getRoutingEndpoint = (baseUrl) => {
  const value = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  return getUrlOrigin(value) || DEFAULT_ROUTING_ENDPOINT;
};

const shouldDropStoredSecret = ({ previousEndpoint, nextEndpoint, hasNewSecret }) => {
  if (hasNewSecret) {
    return false;
  }
  return `${previousEndpoint || ''}`.toLowerCase() !== `${nextEndpoint || ''}`.toLowerCase();
};

const hasValue = (value) => typeof value === 'string' && value.trim().length > 0;

const getRoutingBaseUrl = (config) => config?.services?.routing?.baseUrl
  || config?.services?.travel?.routingBaseUrl
  || '';

// Returns a copy of `secrets` without the keys whose endpoint changed in `nextConfig`
// (compared to `previousConfig`) unless the client supplied a replacement key in the same request.
// Both configs are expected to be normalized; `nextConfig` still carries any incoming plaintext keys.
const bindSecretsToEndpoints = ({ previousConfig, nextConfig, secrets }) => {
  const result = JSON.parse(JSON.stringify(secrets || {}));

  const nextLlm = nextConfig?.services?.llm || {};
  if (result.llm?.apiKey && shouldDropStoredSecret({
    previousEndpoint: getLlmEndpoint(previousConfig?.services?.llm || {}),
    nextEndpoint: getLlmEndpoint(nextLlm),
    hasNewSecret: hasValue(nextLlm.apiKey),
  })) {
    delete result.llm.apiKey;
  }

  const hasNewRoutingKey = hasValue(nextConfig?.services?.routing?.apiKey)
    || hasValue(nextConfig?.services?.travel?.routingApiKey);
  if (result.routing?.apiKey && shouldDropStoredSecret({
    previousEndpoint: getRoutingEndpoint(getRoutingBaseUrl(previousConfig)),
    nextEndpoint: getRoutingEndpoint(getRoutingBaseUrl(nextConfig)),
    hasNewSecret: hasNewRoutingKey,
  })) {
    delete result.routing.apiKey;
  }

  return result;
};

module.exports = {
  bindSecretsToEndpoints,
  getLlmEndpoint,
  getRoutingEndpoint,
  shouldDropStoredSecret,
};

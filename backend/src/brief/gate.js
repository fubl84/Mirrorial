const { isLocalBaseUrl } = require('../security/urlGuard');

// Decides whether the model may be called at all, before any prompt is built. Returns null when it may,
// otherwise { status, reason } in the same vocabulary the rest of the app already understands.
const checkLlmPreconditions = ({ llmConfig, apiKey }) => {
  const provider = llmConfig.provider || 'openai';
  const privacyMode = llmConfig.privacyMode || 'cloud-redacted';
  const baseUrl = `${llmConfig.baseUrl || ''}`.trim();

  if (!llmConfig.enabled) {
    return { status: 'disabled', reason: '' };
  }
  if (!apiKey && provider !== 'custom') {
    return { status: 'skipped', reason: 'missing_api_key' };
  }
  if (privacyMode === 'off') {
    return { status: 'skipped', reason: 'privacy_mode_off' };
  }
  if (privacyMode === 'local-only' && provider !== 'custom') {
    return { status: 'skipped', reason: 'local_only_requires_custom_provider' };
  }
  if (privacyMode === 'local-only' && !isLocalBaseUrl(baseUrl)) {
    return { status: 'skipped', reason: 'custom_provider_not_local' };
  }
  return null;
};

module.exports = { checkLlmPreconditions };

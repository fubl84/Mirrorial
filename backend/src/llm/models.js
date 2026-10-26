// Model suggestions for the remote UI. They are suggestions only: any model name can be typed in.
// Every ID below was checked against the provider's own model documentation on 2026-10-26.
// Providers retire models regularly, so this list needs a refresh now and then; the "Test connection"
// button tells the user right away when a name is not accepted.

const LLM_PROVIDER_INFO = {
  openai: {
    label: 'OpenAI',
    needsBaseUrl: false,
    models: [
      { id: 'gpt-6-luna', note: 'cheapest, plenty for short briefs' },
      { id: 'gpt-6.1-sol', note: 'balanced' },
      { id: 'gpt-6-astra', note: 'most capable, rarely needed here' },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    needsBaseUrl: false,
    models: [
      { id: 'claude-haiku-5-5', note: 'fast and cheap, recommended' },
      { id: 'claude-sonnet-5-5', note: 'balanced' },
      { id: 'claude-haiku-4-5', note: 'previous generation, still served' },
    ],
  },
  google: {
    label: 'Google',
    needsBaseUrl: false,
    models: [
      { id: 'gemini-3.5-flash-lite', note: 'cheapest' },
      { id: 'gemini-3.6-flash', note: 'balanced' },
      { id: 'gemini-3.8-flash', note: 'newest Flash' },
    ],
  },
  custom: {
    label: 'Custom / local (OpenAI compatible)',
    needsBaseUrl: true,
    models: [],
  },
};

const getLlmProviderInfo = () => LLM_PROVIDER_INFO;

module.exports = {
  LLM_PROVIDER_INFO,
  getLlmProviderInfo,
};

const { extractTextContent } = require('./text');
const { createModelError, normalizeUsage } = require('./http');
const { prepareSchema } = require('./schema');

// OpenAI Chat Completions. Also used for "custom" (Ollama, LM Studio, vLLM, ... speak the same protocol).
// Modes, strictest first: json_schema (strict structured output) -> json_object -> plain text.

const OFFICIAL_BASE_URL = 'https://api.openai.com/v1';
const CUSTOM_BASE_URL = 'http://127.0.0.1:11434/v1';
const SCHEMA_NAME = 'mirrorial_output';

// Reasoning models (gpt-5 family, o-series, ...) reject a custom temperature. Only the classic chat models
// are known to accept it, so it is sent for those and for self-hosted servers. If a server still refuses it,
// the provider layer retries without it (and remembers that).
const acceptsTemperature = (model, isCustom) => isCustom || /^gpt-(3|4)/i.test(`${model || ''}`.trim());

const createOpenAiAdapter = ({ custom = false } = {}) => ({
  name: custom ? 'custom' : 'openai',
  modes: ['json_schema', 'json_object', 'plain'],
  needsKey: !custom,

  defaultTemperature: (model) => (acceptsTemperature(model, custom) ? 0.2 : undefined),

  build: ({ model, system, prompt, schema, mode, temperature, apiKey, baseUrl }) => {
    const root = `${baseUrl || (custom ? CUSTOM_BASE_URL : OFFICIAL_BASE_URL)}`.replace(/\/$/, '');
    const body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    };
    if (mode === 'json_schema') {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: SCHEMA_NAME, strict: true, schema: prepareSchema(schema, 'openai-strict') },
      };
    } else if (mode === 'json_object') {
      body.response_format = { type: 'json_object' };
    }
    if (temperature !== undefined) {
      body.temperature = temperature;
    }
    return {
      url: `${root}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body,
    };
  },

  parse: (data) => {
    const choice = data?.choices?.[0] || {};
    if (choice.message?.refusal) {
      throw createModelError('openai_refusal', data);
    }
    if (choice.finish_reason === 'length') {
      throw createModelError('openai_output_truncated (finish_reason length)', data);
    }
    const text = extractTextContent(choice.message?.content);
    if (!text.trim()) {
      throw createModelError(`openai_empty_response finish_reason=${choice.finish_reason || 'unknown'}`, data);
    }
    return {
      text,
      usage: normalizeUsage(data?.usage?.prompt_tokens, data?.usage?.completion_tokens),
    };
  },
});

module.exports = {
  CUSTOM_BASE_URL,
  OFFICIAL_BASE_URL,
  acceptsTemperature,
  createOpenAiAdapter,
};

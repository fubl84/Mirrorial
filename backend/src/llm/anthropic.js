const { extractTextContent } = require('./text');
const { createModelError, normalizeUsage } = require('./http');
const { prepareSchema } = require('./schema');

// Anthropic Messages API. Modes: json_schema (output_config.format, constrained decoding) -> plain.
// No `temperature` is sent: current Claude models reject it and the older ones work without it.

const URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 1500;

const anthropicAdapter = {
  name: 'anthropic',
  modes: ['json_schema', 'plain'],
  needsKey: true,

  defaultTemperature: () => undefined,

  build: ({ model, system, prompt, schema, mode, apiKey }) => {
    const body = {
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: prompt }],
    };
    if (mode === 'json_schema') {
      body.output_config = { format: { type: 'json_schema', schema: prepareSchema(schema, 'anthropic') } };
    }
    return {
      url: URL,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body,
    };
  },

  parse: (data) => {
    if (data?.stop_reason === 'refusal') {
      throw createModelError('anthropic_refusal', data);
    }
    if (data?.stop_reason === 'max_tokens') {
      // The JSON is cut off and not trustworthy, even when it happens to parse.
      throw createModelError('anthropic_output_truncated (stop_reason max_tokens)', data);
    }
    const blocks = Array.isArray(data?.content) ? data.content.filter((block) => block?.type === 'text') : [];
    const text = extractTextContent(blocks);
    if (!text.trim()) {
      throw createModelError(`anthropic_empty_response stop_reason=${data?.stop_reason || 'unknown'}`, data);
    }
    return {
      text,
      usage: normalizeUsage(data?.usage?.input_tokens, data?.usage?.output_tokens),
    };
  },
};

module.exports = {
  MAX_TOKENS,
  anthropicAdapter,
};

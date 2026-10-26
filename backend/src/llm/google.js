const { extractTextContent } = require('./text');
const { createModelError, normalizeUsage } = require('./http');
const { prepareSchema } = require('./schema');

// Google Gemini generateContent. Modes: json_schema (responseSchema) -> plain.
// The key travels in a header, not in the query string, so it cannot end up in logs or error messages.

const googleAdapter = {
  name: 'google',
  modes: ['json_schema', 'plain'],
  needsKey: true,

  defaultTemperature: () => 0.2,

  build: ({ model, system, prompt, schema, mode, temperature, apiKey }) => {
    const generationConfig = {};
    if (temperature !== undefined) {
      generationConfig.temperature = temperature;
    }
    if (mode === 'json_schema') {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = prepareSchema(schema, 'google');
    }
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      },
    };
  },

  parse: (data) => {
    const candidate = data?.candidates?.[0] || {};
    if (candidate.finishReason === 'MAX_TOKENS') {
      throw createModelError('google_output_truncated (finishReason MAX_TOKENS)', data);
    }
    // Thinking models return their reasoning as parts flagged `thought`; it is not part of the answer.
    const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts.filter((part) => part?.thought !== true) : [];
    const text = extractTextContent(parts);
    if (!text.trim()) {
      const detail = candidate.finishReason || data?.promptFeedback?.blockReason || 'unknown';
      throw createModelError(`google_empty_response finishReason=${detail}`, data);
    }
    return {
      text,
      usage: normalizeUsage(data?.usageMetadata?.promptTokenCount, data?.usageMetadata?.candidatesTokenCount),
    };
  },
};

module.exports = {
  googleAdapter,
};

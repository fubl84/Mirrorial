// Adapts one JSON Schema to what each provider accepts. The app keeps a single, readable schema per task;
// the provider layer reshapes it. Constraints that providers reject (array bounds, string lengths, ...) are
// removed here because the application validates those things itself (see src/brief/validate.js).

const UNSUPPORTED_KEYWORDS = new Set([
  'minItems', 'maxItems', 'uniqueItems',
  'minLength', 'maxLength', 'pattern', 'format',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minProperties', 'maxProperties',
  'default', 'examples', 'title', '$schema',
]);

const TARGETS = new Set(['openai-strict', 'anthropic', 'google']);

const mapSchema = (schema, target) => {
  if (Array.isArray(schema)) {
    return schema.map((entry) => mapSchema(entry, target));
  }
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const result = {};
  Object.entries(schema).forEach(([key, value]) => {
    if (target !== 'google' && UNSUPPORTED_KEYWORDS.has(key)) {
      return;
    }
    if (key === 'additionalProperties') {
      // Gemini rejects the keyword; the others require it to be exactly false.
      return;
    }
    if (key === 'properties' && value && typeof value === 'object') {
      result.properties = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, mapSchema(child, target)]),
      );
      return;
    }
    if (key === 'items' || key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      result[key] = mapSchema(value, target);
      return;
    }
    if (key === 'type' && typeof value === 'string') {
      // Older schemas in this code base use Gemini's upper case type names.
      result.type = target === 'google' ? value.toUpperCase() : value.toLowerCase();
      return;
    }
    result[key] = value;
  });

  const isObject = `${result.type || ''}`.toLowerCase() === 'object' && result.properties;
  if (isObject && target !== 'google') {
    result.additionalProperties = false;
    if (target === 'openai-strict') {
      // OpenAI strict mode: every property must be listed as required.
      result.required = Object.keys(result.properties);
    }
  }

  return result;
};

const prepareSchema = (schema, target) => {
  if (!TARGETS.has(target)) {
    throw new Error(`Unknown schema target: ${target}`);
  }
  return mapSchema(schema, target);
};

module.exports = {
  prepareSchema,
};

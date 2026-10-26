// Pulls plain text out of the different content shapes the providers return
// (string, list of parts, { text }, { output_text }).
const extractTextContent = (value) => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (typeof entry?.text === 'string') {
        return entry.text;
      }
      if (typeof entry?.content === 'string') {
        return entry.content;
      }
      if (typeof entry?.output_text === 'string') {
        return entry.output_text;
      }
      return '';
    }).join('\n');
  }

  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') {
      return value.text;
    }
    if (typeof value.output_text === 'string') {
      return value.output_text;
    }
  }

  return '';
};

module.exports = {
  extractTextContent,
};

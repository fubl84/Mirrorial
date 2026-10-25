// The Flutter display reads the Home Assistant token straight from config.json on disk, so it cannot be
// moved into secrets.json. Instead the token never leaves the backend over HTTP: it is stripped from
// API responses (replaced by `tokenConfigured`) and restored on save when the client sends it empty.

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Visits every config object that holds Home Assistant settings:
// moduleSettings.home_assistant, grid layout modules and modules nested in a rotator.
const forEachHomeAssistantConfig = (config, visitor) => {
  if (!isObject(config)) {
    return;
  }

  if (isObject(config.moduleSettings?.home_assistant)) {
    visitor(config.moduleSettings.home_assistant);
  }

  const visitModule = (module) => {
    if (!isObject(module)) {
      return;
    }
    if (module.type === 'home_assistant' && isObject(module.config)) {
      visitor(module.config);
    }
    if (module.type === 'module_rotator' && Array.isArray(module.config?.modules)) {
      module.config.modules.forEach(visitModule);
    }
  };

  const layouts = isObject(config.gridLayouts) ? Object.values(config.gridLayouts) : [];
  if (isObject(config.gridLayout)) {
    layouts.push(config.gridLayout);
  }
  layouts.forEach((layout) => (Array.isArray(layout?.modules) ? layout.modules.forEach(visitModule) : null));
};

const extractHomeAssistantToken = (config) => {
  let found = { token: '', url: '' };
  forEachHomeAssistantConfig(config, (haConfig) => {
    if (!found.token && typeof haConfig.token === 'string' && haConfig.token.trim()) {
      found = { token: haConfig.token.trim(), url: typeof haConfig.url === 'string' ? haConfig.url.trim() : '' };
    }
  });
  return found;
};

// Returns a deep-copy-safe mutation target: callers pass an already cloned config.
const stripHomeAssistantToken = (config) => {
  forEachHomeAssistantConfig(config, (haConfig) => {
    haConfig.tokenConfigured = Boolean(typeof haConfig.token === 'string' && haConfig.token.trim());
    haConfig.token = '';
  });
  return config;
};

// `isSameEndpoint(previousUrl, nextUrl)` decides whether the stored token may be re-used.
const restoreHomeAssistantToken = (nextConfig, previousConfig, isSameEndpoint) => {
  const previous = extractHomeAssistantToken(previousConfig);
  forEachHomeAssistantConfig(nextConfig, (haConfig) => {
    const incoming = typeof haConfig.token === 'string' ? haConfig.token.trim() : '';
    delete haConfig.tokenConfigured;
    if (incoming) {
      haConfig.token = incoming;
      return;
    }
    const nextUrl = typeof haConfig.url === 'string' ? haConfig.url.trim() : '';
    haConfig.token = previous.token && isSameEndpoint(previous.url, nextUrl) ? previous.token : '';
  });
  return nextConfig;
};

module.exports = {
  extractHomeAssistantToken,
  forEachHomeAssistantConfig,
  restoreHomeAssistantToken,
  stripHomeAssistantToken,
};

import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { FIELD_CLASS, LABEL_CLASS } from './llmStyles';

const FALLBACK_PROVIDERS = {
  openai: { label: 'OpenAI', models: [] },
  anthropic: { label: 'Anthropic', models: [] },
  google: { label: 'Google', models: [] },
  custom: { label: 'Custom / local', models: [] },
};

// Model names that were the defaults of earlier versions. They are replaced when the provider changes.
const OLD_DEFAULT_MODEL = /^(gpt-5-mini|gpt-4)/;

// Provider and model fields. The suggestions come from the backend (src/llm/models.js) so there is one
// place to keep them current. Any model name can still be typed in.
export const LlmProviderFields = ({ llmConfig, onChange }) => {
  const [providers, setProviders] = useState(FALLBACK_PROVIDERS);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/llm/providers`)
      .then((response) => {
        if (!cancelled && response.data?.providers) {
          setProviders(response.data.providers);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const current = providers[llmConfig.provider] || FALLBACK_PROVIDERS.openai;
  const suggestions = current.models || [];

  const changeProvider = (nextProvider) => {
    onChange('provider', nextProvider);
    // A model name that belongs to another provider can never work here.
    const belongsElsewhere = Object.entries(providers)
      .filter(([id]) => id !== nextProvider)
      .some(([, info]) => (info.models || []).some((model) => model.id === llmConfig.model));
    const first = providers[nextProvider]?.models?.[0]?.id;
    if (first && (!llmConfig.model || belongsElsewhere || OLD_DEFAULT_MODEL.test(llmConfig.model))) {
      onChange('model', first);
    }
  };

  return (
    <>
      <div>
        <label className={LABEL_CLASS}>Provider</label>
        <select value={llmConfig.provider} onChange={(event) => changeProvider(event.target.value)} className={FIELD_CLASS}>
          {Object.entries(providers).map(([id, info]) => (
            <option key={id} value={id}>{info.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL_CLASS}>Model</label>
        <input
          type="text"
          list="llm-model-suggestions"
          value={llmConfig.model || ''}
          onChange={(event) => onChange('model', event.target.value)}
          className={FIELD_CLASS}
          spellCheck={false}
          autoCapitalize="none"
        />
        <datalist id="llm-model-suggestions">
          {suggestions.map((model) => <option key={model.id} value={model.id}>{model.note}</option>)}
        </datalist>
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => onChange('model', model.id)}
                title={model.note}
                className={`rounded-lg border px-2 py-1 text-xs transition ${llmConfig.model === model.id ? 'border-[#ff8bbf] text-white' : 'border-slate-700 text-slate-400 hover:text-white'}`}
              >
                {model.id}
              </button>
            ))}
          </div>
        )}
        <div className="text-xs text-slate-500 mt-2">
          Suggestions are a starting point. Any model name your provider offers can be typed in; Test connection checks it.
        </div>
      </div>
    </>
  );
};

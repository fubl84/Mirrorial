import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { FIELD_CLASS, LABEL_CLASS } from './llmStyles';

// "Test connection": sends one tiny request with what is currently on screen (saved or not).
export const LlmConnectionTest = ({ llmConfig }) => {
  const [state, setState] = useState(null);

  const run = async () => {
    setState({ loading: true });
    try {
      const response = await axios.post(`${API_BASE}/llm/test`, { llm: llmConfig });
      setState({ loading: false, ...response.data });
    } catch (error) {
      const message = error.response?.status === 429
        ? 'Too many tests in a short time. Wait a minute and try again.'
        : 'The test could not be run. Is the Mirrorial backend reachable?';
      setState({ loading: false, ok: false, message });
    }
  };

  const details = state?.ok
    ? [
      state.structured ? 'structured output' : 'plain JSON mode',
      `${state.latencyMs} ms`,
      state.usage?.inputTokens != null ? `${state.usage.inputTokens} in / ${state.usage.outputTokens ?? '?'} out tokens` : null,
    ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={state?.loading || !llmConfig.model}
          className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {state?.loading ? 'Testing…' : 'Test connection'}
        </button>
        {state && !state.loading && (
          <div className={`text-xs ${state.ok && state.validJson ? 'text-emerald-300' : 'text-amber-300'}`}>
            {state.message}{details ? ` (${details})` : ''}
          </div>
        )}
      </div>
      <div className="text-xs text-slate-500">
        Uses the key typed above, otherwise the saved one. Costs a few tokens.
      </div>
    </div>
  );
};

export const LlmTimeoutField = ({ llmConfig, onChange }) => (
  <div>
    <label className={LABEL_CLASS}>Timeout (seconds)</label>
    <input
      type="number"
      min="10"
      max="180"
      value={llmConfig.timeoutSeconds ?? 45}
      onChange={(event) => onChange('timeoutSeconds', Number(event.target.value) || 45)}
      className={FIELD_CLASS}
    />
    <div className="text-xs text-slate-500 mt-2">
      How long to wait for the provider. Temporary errors (rate limit, overload) are retried up to three times.
    </div>
  </div>
);

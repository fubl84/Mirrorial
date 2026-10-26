import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';

// "Why is this shown?": every upcoming event of the next days, with the rule that decided it and a button to
// pin (always show) or mute (never show) it. Pin and mute change the same word lists as the rules editor above,
// so what happened is always visible there too.
//
// `onRulesChanged(rules)` lets the parent update its copy of the settings, otherwise the next "Save" on the
// settings page would write the old word lists back over the change.

const DAY_LABEL = { today: 'Today', tomorrow: 'Tomorrow', later: 'Later' };

const formatTime = (row) => {
  if (row.isAllDay) {
    return 'all day';
  }
  const start = new Date(row.start);
  return Number.isNaN(start.getTime()) ? '' : start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const BriefExplain = ({ onRulesChanged }) => {
  const [state, setState] = useState({ loading: true, events: [], error: '', note: '' });
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async (note = '') => {
    setState((current) => ({ ...current, loading: true, error: '', note }));
    try {
      const response = await axios.get(`${API_BASE}/brief/explain`);
      setState({ loading: false, events: response.data.events || [], error: '', note });
    } catch (error) {
      setState({ loading: false, events: [], error: 'Could not load the events. Is the Mirrorial backend reachable?', note: '' });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (row, action) => {
    setBusyId(row.id);
    try {
      const response = await axios.post(`${API_BASE}/brief/rules`, { action, keyword: row.ruleKeyword, eventId: row.id });
      onRulesChanged?.(response.data.rules);
      const removed = response.data.removed || [];
      const verb = action === 'pin' ? 'Pinned' : 'Muted';
      await load(`${verb} "${row.ruleKeyword}".${removed.length ? ` Removed "${removed.join('", "')}" from Never show, because it was hiding this event.` : ''}`);
    } catch (error) {
      setState((current) => ({ ...current, error: 'The rule could not be saved.', note: '' }));
    } finally {
      setBusyId('');
    }
  };

  const buttonClass = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Why is this shown?</div>
          <div className="mt-1 text-xs text-slate-500">
            Every upcoming event with the rule that decided it. "Mute" adds its title to Never show, "Pin" adds it to Always show.
            Events from calendars that are not part of the brief are listed too, but cannot be pinned.
          </div>
        </div>
        <button type="button" onClick={() => load()} disabled={state.loading} className={buttonClass}>
          {state.loading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      {state.note && <div className="text-xs text-emerald-300">{state.note}</div>}
      {state.error && <div className="text-xs text-amber-300">{state.error}</div>}
      {!state.loading && !state.error && state.events.length === 0 && (
        <div className="text-xs text-slate-500">No upcoming events in the next days. Check the calendar sync under Calendars.</div>
      )}

      <div className="space-y-2">
        {state.events.map((row) => (
          <div key={`${row.id}-${row.start}`} className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={row.included ? 'h-2 w-2 shrink-0 rounded-full bg-emerald-400' : 'h-2 w-2 shrink-0 rounded-full bg-slate-600'} />
                <span className="truncate text-sm font-medium text-white">{row.title || '(no title)'}</span>
                <span className="shrink-0 text-xs text-slate-500">{DAY_LABEL[row.day] || ''} {formatTime(row)}</span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {row.included ? 'In the brief. ' : 'Not in the brief. '}{row.reasonText}
                {row.calendar ? <span className="text-slate-600"> · {row.calendar}</span> : null}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {row.canMute && <button type="button" disabled={busyId === row.id} onClick={() => act(row, 'mute')} className={buttonClass}>Mute</button>}
              {row.canPin && <button type="button" disabled={busyId === row.id} onClick={() => act(row, 'pin')} className={buttonClass}>Pin</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

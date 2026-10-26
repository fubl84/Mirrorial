import { useCallback, useEffect, useState } from 'react';
import {
  AUTH_REQUIRED_EVENT,
  fetchSecurityStatus,
  getStoredToken,
  installAuthInterceptors,
  storeToken,
} from '../api';

installAuthInterceptors();

const inputClass = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm';

function AuthGate({ children }) {
  const [state, setState] = useState('checking'); // checking | ok | login | unreachable
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const check = useCallback(async () => {
    try {
      const status = await fetchSecurityStatus();
      setState(status.authenticated ? 'ok' : 'login');
    } catch (requestError) {
      setState('unreachable');
    }
  }, []);

  useEffect(() => {
    check();
    const onAuthRequired = () => setState('login');
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  }, [check]);

  const submit = async (event) => {
    event.preventDefault();
    const candidate = token.trim();
    if (!candidate) {
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const status = await fetchSecurityStatus(candidate);
      if (status.authenticated) {
        storeToken(candidate);
        setToken('');
        setState('ok');
      } else {
        setError('That access token was not accepted.');
      }
    } catch (requestError) {
      setError(requestError.response?.status === 429
        ? 'Too many attempts. Wait a few minutes and try again.'
        : 'The Mirrorial backend could not be reached.');
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'ok') {
    return children;
  }

  if (state === 'checking') {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">Connecting to Mirrorial…</div>;
  }

  if (state === 'unreachable') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-200">
        <div className="max-w-md w-full rounded-[28px] border border-slate-800 bg-slate-900/60 p-8 space-y-4">
          <h1 className="text-xl font-bold">Backend not reachable</h1>
          <p className="text-sm text-slate-400">The Mirrorial backend did not answer. Check that it is running, then retry.</p>
          <button type="button" onClick={check} className="w-full rounded-xl bg-[#ff8bbf] text-slate-950 font-semibold py-3 text-sm">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-200">
      <form onSubmit={submit} className="max-w-md w-full rounded-[28px] border border-slate-800 bg-slate-900/60 p-8 space-y-5">
        <div>
          <h1 className="text-xl font-bold">Mirrorial access</h1>
          <p className="text-sm text-slate-400 mt-1">
            Enter the access token of your mirror. It is stored in the file <code className="text-slate-300">~/.config/mirrorial/access-token</code> on the
            device and printed in the backend log on first start.
          </p>
        </div>
        <input
          type="password"
          name="mirrorial-access-token"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Access token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className={inputClass}
        />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button
          type="submit"
          disabled={submitting || !token.trim() || getStoredToken() === token.trim()}
          className="w-full rounded-xl bg-[#ff8bbf] text-slate-950 font-semibold py-3 text-sm disabled:opacity-50"
        >
          {submitting ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}

export default AuthGate;

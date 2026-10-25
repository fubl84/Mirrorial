const { assertSafeOutboundUrl } = require('../security/urlGuard');
const { PublicError } = require('../security/errors');

// Calendar subscriptions are the primary way to connect calendars (Google "secret address", iCloud public
// link, Outlook "publish calendar", Nextcloud, ...). Users paste whatever link their provider shows, so
// this module makes that forgiving and safe.

const MAX_ICS_BYTES = 25 * 1024 * 1024;

// webcal:// is not a transport, it just means "subscribe to this iCalendar feed". Providers serve it over
// https nowadays; some old servers only speak http, so plain webcal:// falls back to http as a last resort.
const getSubscriptionUrlCandidates = (value) => {
  const url = `${value || ''}`.trim();
  if (!url) {
    return [];
  }
  if (/^webcals:\/\//i.test(url)) {
    return [url.replace(/^webcals:\/\//i, 'https://')];
  }
  if (/^webcal:\/\//i.test(url)) {
    return [url.replace(/^webcal:\/\//i, 'https://'), url.replace(/^webcal:\/\//i, 'http://')];
  }
  return [url];
};

const looksLikeIcs = (text) => /BEGIN:VCALENDAR/i.test(`${text || ''}`.slice(0, 4096));

// axios `beforeRedirect` hook: every hop of a redirect chain gets the same URL checks as the first request,
// otherwise a harmless public URL could bounce the request to a blocked address.
const assertSafeRedirectTarget = (options = {}) => {
  const host = `${options.hostname || options.host || ''}`;
  const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const port = options.port ? `:${options.port}` : '';
  try {
    assertSafeOutboundUrl(`${options.protocol || 'https:'}//${hostPart}${port}${options.path || '/'}`, 'Redirect target');
  } catch (error) {
    throw new PublicError(error.message);
  }
};

const ICS_NOT_A_CALENDAR_MESSAGE = 'The link did not return a calendar (ICS) file. Check that you copied the iCal/subscription link and that it is shared.';

// Turns transport errors into a sentence a non-technical user can act on. Never includes hosts, IPs or headers.
const describeFetchError = (error) => {
  if (error?.expose === true) {
    return error.message;
  }
  // follow-redirects wraps anything thrown inside `beforeRedirect` into a generic ERR_FR_REDIRECTION_FAILURE
  // (the original PublicError is not kept), so the code is the only reliable signal. The only thing that
  // throws there is the URL guard, so the cause is always "redirect to a blocked address".
  if (error?.code === 'ERR_FR_REDIRECTION_FAILURE') {
    return 'The calendar link redirects to an address that is not allowed.';
  }
  if (error?.code === 'ERR_FR_TOO_MANY_REDIRECTS') {
    return 'The calendar link redirects too many times.';
  }
  const status = error?.response?.status;
  if (status === 401 || status === 403) {
    return 'The calendar server refused access. Check the link, or the username and password.';
  }
  if (status === 404 || status === 410) {
    return 'The calendar link was not found. It may have been reset or un-shared.';
  }
  if (status === 429) {
    return 'The calendar server is limiting requests. Mirrorial will try again later.';
  }
  if (status >= 500) {
    return `The calendar server reported an error (${status}). Mirrorial will try again later.`;
  }

  const code = `${error?.code || ''}`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'The calendar server name could not be found. Check the link and the internet connection.';
  }
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return 'The calendar server refused the connection.';
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
    return 'The calendar server did not answer in time.';
  }
  if (code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' || /maxContentLength/i.test(`${error?.message || ''}`)) {
    return 'The calendar file is too large.';
  }
  return 'The calendar could not be loaded.';
};

// Fetches the first candidate that answers with a calendar. `request(url)` must return the response body text.
const fetchSubscriptionText = async ({ url, request }) => {
  const candidates = getSubscriptionUrlCandidates(url);
  if (candidates.length === 0) {
    throw new PublicError('No calendar link configured.');
  }

  let lastError = null;
  for (const candidate of candidates) {
    try {
      try {
        assertSafeOutboundUrl(candidate, 'Calendar URL');
      } catch (error) {
        throw new PublicError(error.message);
      }
      const text = await request(candidate);
      if (!looksLikeIcs(text)) {
        throw new PublicError(ICS_NOT_A_CALENDAR_MESSAGE);
      }
      return { text, url: candidate };
    } catch (error) {
      lastError = error;
      // A blocked address is never retried over another scheme.
      if (error?.expose === true && /blocked/i.test(error.message)) {
        break;
      }
    }
  }
  throw lastError;
};

module.exports = {
  ICS_NOT_A_CALENDAR_MESSAGE,
  MAX_ICS_BYTES,
  assertSafeRedirectTarget,
  describeFetchError,
  fetchSubscriptionText,
  getSubscriptionUrlCandidates,
  looksLikeIcs,
};

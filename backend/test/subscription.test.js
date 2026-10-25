const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchSubscriptionText,
  getSubscriptionUrlCandidates,
  looksLikeIcs,
  assertSafeRedirectTarget,
} = require('../src/calendar/subscription');
const {
  getCalendarNameFromIcs,
  isDeclinedForOwner,
  parseOwnerEmails,
  splitIcsContentLine,
} = require('../src/calendar/icsMeta');

const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';

test('webcal links become https first, with an http fallback for plain webcal', () => {
  assert.deepEqual(getSubscriptionUrlCandidates('webcal://cal.example.com/a.ics'), ['https://cal.example.com/a.ics', 'http://cal.example.com/a.ics']);
  assert.deepEqual(getSubscriptionUrlCandidates('WEBCALS://cal.example.com/a.ics'), ['https://cal.example.com/a.ics']);
  assert.deepEqual(getSubscriptionUrlCandidates(' https://cal.example.com/a.ics '), ['https://cal.example.com/a.ics']);
  assert.deepEqual(getSubscriptionUrlCandidates(''), []);
});

test('fetchSubscriptionText returns the first candidate that answers with a calendar', async () => {
  const seen = [];
  const result = await fetchSubscriptionText({
    url: 'webcal://cal.example.com/a.ics',
    request: async (url) => {
      seen.push(url);
      if (url.startsWith('https://')) {
        throw new Error('TLS handshake failed');
      }
      return ICS;
    },
  });
  assert.equal(result.url, 'http://cal.example.com/a.ics');
  assert.deepEqual(seen, ['https://cal.example.com/a.ics', 'http://cal.example.com/a.ics']);
});

test('fetchSubscriptionText explains when a link returns a web page instead of a calendar', async () => {
  await assert.rejects(
    fetchSubscriptionText({ url: 'https://cal.example.com/share', request: async () => '<html>Sign in</html>' }),
    /did not return a calendar/,
  );
});

test('fetchSubscriptionText refuses blocked targets before any request is made', async () => {
  let called = false;
  await assert.rejects(
    fetchSubscriptionText({ url: 'http://169.254.169.254/latest', request: async () => { called = true; return ICS; } }),
    /blocked/,
  );
  assert.equal(called, false);
  await assert.rejects(fetchSubscriptionText({ url: '', request: async () => ICS }), /No calendar link/);
});

test('describeFetchError gives friendly, leak-free messages', () => {
  const { describeFetchError } = require('../src/calendar/subscription');
  const { PublicError } = require('../src/security/errors');
  assert.match(describeFetchError({ response: { status: 401 } }), /refused access/);
  assert.match(describeFetchError({ response: { status: 404 } }), /not found/);
  assert.match(describeFetchError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND secret.internal' }), /could not be found/);
  assert.doesNotMatch(describeFetchError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND secret.internal' }), /secret\.internal/);
  assert.match(describeFetchError({ code: 'ETIMEDOUT' }), /in time/);
  assert.equal(describeFetchError(new PublicError('Calendar URL points to a blocked address.')), 'Calendar URL points to a blocked address.');
  assert.equal(describeFetchError(new Error('boom with 10.0.0.5')), 'The calendar could not be loaded.');
});

test('a blocked redirect is reported clearly, using the error shape axios/follow-redirects really produce', async () => {
  // Real round trip instead of a hand-made error: a local server redirects to the cloud-metadata address.
  const http = require('http');
  const axios = require('axios');
  const { describeFetchError, assertSafeRedirectTarget } = require('../src/calendar/subscription');

  const server = http.createServer((req, res) => {
    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    let captured = null;
    await axios.get(`http://127.0.0.1:${port}/`, {
      maxRedirects: 5,
      beforeRedirect: (options) => assertSafeRedirectTarget(options),
    }).catch((error) => { captured = error; });

    assert.ok(captured, 'the redirect must be refused');
    assert.equal(describeFetchError(captured), 'The calendar link redirects to an address that is not allowed.');
    assert.doesNotMatch(describeFetchError(captured), /169\.254/);
  } finally {
    server.close();
  }
});

test('looksLikeIcs only needs the header of the file', () => {
  assert.equal(looksLikeIcs(ICS), true);
  assert.equal(looksLikeIcs('<html></html>'), false);
  assert.equal(looksLikeIcs(null), false);
});

test('redirect targets are checked with the same URL guard', () => {
  assert.doesNotThrow(() => assertSafeRedirectTarget({ protocol: 'https:', hostname: 'cal.example.com', path: '/x.ics' }));
  assert.throws(() => assertSafeRedirectTarget({ protocol: 'http:', hostname: '169.254.169.254', path: '/' }), /blocked/);
  assert.throws(() => assertSafeRedirectTarget({ protocol: 'file:', hostname: '', path: '/etc/passwd' }));
});

test('splitIcsContentLine handles quoted parameters containing ; and :', () => {
  const parsed = splitIcsContentLine('ATTENDEE;CN="Doe; Jane: PhD";PARTSTAT=DECLINED:mailto:jane@example.com');
  assert.equal(parsed.key, 'ATTENDEE');
  assert.equal(parsed.params.CN, 'Doe; Jane: PhD');
  assert.equal(parsed.params.PARTSTAT, 'DECLINED');
  assert.equal(parsed.value, 'mailto:jane@example.com');

  const date = splitIcsContentLine('DTSTART;TZID=Europe/Berlin:20260410T100000');
  assert.deepEqual([date.key, date.params.TZID, date.value], ['DTSTART', 'Europe/Berlin', '20260410T100000']);
  assert.equal(splitIcsContentLine('no separator here'), null);
});

test('declined events are only detected for known owner addresses', () => {
  const props = {
    ATTENDEE: [
      { value: 'mailto:Anna@Example.com', params: { PARTSTAT: 'DECLINED' } },
      { value: 'mailto:bob@example.com', params: { PARTSTAT: 'ACCEPTED' } },
    ],
  };
  assert.equal(isDeclinedForOwner(props, ['anna@example.com']), true);
  assert.equal(isDeclinedForOwner(props, ['bob@example.com']), false);
  assert.equal(isDeclinedForOwner(props, []), false, 'no owner address, no guessing');
  assert.deepEqual(parseOwnerEmails('Anna@Example.com, anna@example.com; x'), ['anna@example.com']);
});

test('calendar name is read from X-WR-CALNAME, including folded and escaped values', () => {
  assert.equal(getCalendarNameFromIcs('BEGIN:VCALENDAR\r\nX-WR-CALNAME:Family\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR'), 'Family');
  assert.equal(getCalendarNameFromIcs('BEGIN:VCALENDAR\r\nX-WR-CALNAME:Work\\, Team\r\n  Calendar\r\nBEGIN:VEVENT\r\nEND:VEVENT'), 'Work, Team Calendar');
  assert.equal(getCalendarNameFromIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nX-WR-CALNAME:Inside event\r\nEND:VEVENT'), '');
});

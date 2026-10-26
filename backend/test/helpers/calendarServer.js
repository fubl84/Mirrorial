const http = require('http');

// A fake calendar server on a random local port. Speaks a plain ICS feed (/feed.ics) and a minimal CalDAV
// (/dav/ PROPFIND, /dav/cal/ REPORT). Its behaviour is switched while a test runs:
//   server.set({ mode: 'fail' })      -> every calendar request answers 500
//   server.set({ events: [...] })     -> what the feed contains: [{ uid, title, startHours, endHours, location }]
//   server.stats.feed / .propfind / .report count the requests that arrived
// Events are placed relative to "the start of this hour", so they do not move while a test runs.

const pad = (value) => String(value).padStart(2, '0');
const stamp = (ms) => {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
};

const startCalendarServer = async () => {
  const base = Math.floor(Date.now() / 3600000) * 3600000;
  const state = {
    mode: 'ok',
    name: 'Fake Family',
    events: [
      { uid: 'a', title: 'Zahnarzt Dr. Weber', startHours: 3, endHours: 4, location: 'Praxis Weber' },
      { uid: 'b', title: 'Elternabend', startHours: 3.5, endHours: 5, location: 'Grundschule' },
    ],
  };
  const stats = { feed: 0, propfind: 0, report: 0 };

  const vevents = () => state.events.map((event) => [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp(base)}`,
    `DTSTART:${stamp(base + (event.startHours * 3600000))}`,
    `DTEND:${stamp(base + (event.endHours * 3600000))}`,
    `SUMMARY:${event.title}`,
    ...(event.location ? [`LOCATION:${event.location}`] : []),
    'END:VEVENT',
  ].join('\r\n')).join('\r\n');
  const calendarText = () => ['BEGIN:VCALENDAR', 'VERSION:2.0', `X-WR-CALNAME:${state.name}`, vevents(), 'END:VCALENDAR'].join('\r\n');

  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (state.mode === 'fail') {
        res.writeHead(500);
        return res.end('calendar server down');
      }
      if (req.method === 'GET' && req.url === '/feed.ics') {
        stats.feed += 1;
        res.writeHead(200, { 'content-type': 'text/calendar' });
        return res.end(calendarText());
      }
      if (req.method === 'PROPFIND' && req.url.startsWith('/dav/')) {
        stats.propfind += 1;
        res.writeHead(207, { 'content-type': 'application/xml' });
        return res.end('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
          + '<d:response><d:href>/dav/cal/</d:href><d:propstat><d:prop>'
          + `<d:displayname>${state.name}</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype>`
          + '</d:prop></d:propstat></d:response></d:multistatus>');
      }
      if (req.method === 'REPORT' && req.url.startsWith('/dav/cal/')) {
        stats.report += 1;
        res.writeHead(207, { 'content-type': 'application/xml' });
        return res.end('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
          + '<d:response><d:href>/dav/cal/all.ics</d:href><d:propstat><d:prop>'
          + `<c:calendar-data>${calendarText()}</c:calendar-data>`
          + '</d:prop></d:propstat></d:response></d:multistatus>');
      }
      res.writeHead(404);
      return res.end('not found');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    port,
    feedUrl: `http://127.0.0.1:${port}/feed.ics`,
    davUrl: `http://127.0.0.1:${port}/dav/`,
    stats,
    set: (changes) => Object.assign(state, changes),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

module.exports = { startCalendarServer };

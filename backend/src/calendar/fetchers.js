// Fetches calendar sources over the network and turns them into Mirrorial events.
// Two kinds of source: an ICS subscription link and a CalDAV account. Both go through the same safety checks
// as saving a source does (no internal or cloud-metadata addresses, also not after a redirect) and a size limit.
// fetchCalendarSourceBundle never throws: a failing source comes back as { status: 'error', error } so one dead
// calendar cannot stop the others.

const axios = require('axios');
const { assertSafeOutboundUrl } = require('../security/urlGuard');
const {
  MAX_ICS_BYTES,
  assertSafeRedirectTarget,
  describeFetchError,
  fetchSubscriptionText,
} = require('./subscription');
const { getCalendarNameFromIcs } = require('./icsMeta');
const { parseIcsEvents } = require('./icsParser');

const decodeXmlEntities = (value = '') => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, '\'');

const formatCalDavDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const iso = date.toISOString().replace(/[-:]/g, '');
  return `${iso.slice(0, 15)}Z`;
};


const buildSourceCalendarId = (sourceId, rawCalendarId) => `${sourceId}:${rawCalendarId}`;

const buildSourceCalendar = ({ source, rawCalendarId, summary }) => ({
  id: buildSourceCalendarId(source.id, rawCalendarId),
  summary: summary || source.name || source.url || source.id,
  primary: false,
  backgroundColor: source.color || '',
  foregroundColor: '',
  accessRole: source.type,
  sourceId: source.id,
  sourceType: source.type,
});

const buildBasicAuthConfig = (username, password = '') => {
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  if (!normalizedUsername) {
    return {};
  }
  return {
    auth: {
      username: normalizedUsername,
      password,
    },
  };
};

const parseXmlResponseBlocks = (xml = '') => {
  const matches = xml.match(/<[^>]*response[^>]*>[\s\S]*?<\/[^>]*response>/gi);
  return matches || [];
};

const extractXmlTagValue = (xml = '', localName = '') => {
  const match = xml.match(new RegExp(`<[^>]*${localName}[^>]*>([\\s\\S]*?)<\\/[^>]*${localName}>`, 'i'));
  return match ? decodeXmlEntities(match[1].trim()) : '';
};

const normalizeCalendarPath = (baseUrl, href) => {
  if (!href) {
    return baseUrl;
  }
  try {
    return new URL(href, baseUrl).toString();
  } catch (error) {
    return href;
  }
};

const discoverCalDavCalendars = async ({ source, password }) => {
  const response = await axios.request({
    method: 'PROPFIND',
    url: source.url,
    headers: {
      Depth: '1',
      'content-type': 'application/xml; charset=utf-8',
    },
    data: `<?xml version="1.0" encoding="utf-8" ?>
      <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:prop>
          <d:displayname />
          <d:resourcetype />
        </d:prop>
      </d:propfind>`,
    ...buildCalendarRequestOptions(source, password, 15000),
  });

  const blocks = parseXmlResponseBlocks(response.data);
  const calendars = blocks
    .map((block, index) => {
      const href = extractXmlTagValue(block, 'href');
      const isCalendar = /<[^>]*calendar\b/i.test(block);
      if (!href || !isCalendar) {
        return null;
      }
      return {
        rawId: href || `${source.id}_${index + 1}`,
        url: normalizeCalendarPath(source.url, href),
        summary: extractXmlTagValue(block, 'displayname') || source.name || href,
      };
    })
    .filter(Boolean);

  return calendars.length
    ? calendars
    : [{
      rawId: source.url,
      url: source.url,
      summary: source.name || source.url,
    }];
};

const buildCalendarRequestOptions = (source, password, timeout = 15000) => ({
  timeout,
  maxContentLength: MAX_ICS_BYTES,
  maxBodyLength: MAX_ICS_BYTES,
  maxRedirects: 5,
  beforeRedirect: (options) => assertSafeRedirectTarget(options),
  ...buildBasicAuthConfig(source.username, password),
});

const fetchCalDavEvents = async ({ source, password, timeMin, timeMax }) => {
  assertSafeOutboundUrl(source.url, 'Calendar URL');
  const calendars = await discoverCalDavCalendars({ source, password });
  const results = [];

  for (const calendar of calendars) {
    const response = await axios.request({
      method: 'REPORT',
      url: calendar.url,
      headers: {
        Depth: '1',
        'content-type': 'application/xml; charset=utf-8',
      },
      data: `<?xml version="1.0" encoding="utf-8" ?>
        <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
          <d:prop>
            <d:getetag />
            <c:calendar-data />
          </d:prop>
          <c:filter>
            <c:comp-filter name="VCALENDAR">
              <c:comp-filter name="VEVENT">
                <c:time-range start="${formatCalDavDateTime(timeMin)}" end="${formatCalDavDateTime(timeMax)}" />
              </c:comp-filter>
            </c:comp-filter>
          </c:filter>
        </c:calendar-query>`,
      ...buildCalendarRequestOptions(source, password, 20000),
    });

    const blocks = parseXmlResponseBlocks(response.data);
    blocks.forEach((block) => {
      const calendarData = extractXmlTagValue(block, 'calendar-data');
      if (!calendarData) {
        return;
      }
      const normalizedCalendar = buildSourceCalendar({
        source,
        rawCalendarId: calendar.rawId,
        summary: calendar.summary,
      });
      results.push(
        ...parseIcsEvents({
          sourceId: source.id,
          calendarId: normalizedCalendar.id,
          calendarSummary: normalizedCalendar.summary,
          calendarColor: normalizedCalendar.backgroundColor,
          text: calendarData,
          defaultUrl: calendar.url,
          timeMin,
          timeMax,
          ownerEmails: source.ownerEmails,
        }),
      );
    });
  }

  return {
    calendars: calendars.map((calendar) => buildSourceCalendar({
      source,
      rawCalendarId: calendar.rawId,
      summary: calendar.summary,
    })),
    events: results,
  };
};

const fetchIcsEvents = async ({ source, password, timeMin, timeMax }) => {
  const { text, url } = await fetchSubscriptionText({
    url: source.url,
    request: async (candidateUrl) => {
      const response = await axios.get(candidateUrl, {
        ...buildCalendarRequestOptions(source, password, 15000),
        responseType: 'text',
        transformResponse: (data) => data,
      });
      return typeof response.data === 'string' ? response.data : `${response.data || ''}`;
    },
  });

  // The feed usually knows its own name; an entered name always wins.
  const feedName = getCalendarNameFromIcs(text);
  const calendar = buildSourceCalendar({
    source,
    rawCalendarId: source.url,
    summary: source.name || feedName || source.url,
  });

  return {
    calendars: [calendar],
    feedName,
    events: parseIcsEvents({
      sourceId: source.id,
      calendarId: calendar.id,
      calendarSummary: calendar.summary,
      calendarColor: calendar.backgroundColor,
      text,
      defaultUrl: url,
      timeMin,
      timeMax,
      ownerEmails: source.ownerEmails,
    }),
  };
};

const fetchCalendarSourceBundle = async ({ source, secrets, timeMin, timeMax }) => {
  if (!source.enabled || !source.url) {
    return { calendars: [], events: [], source: { id: source.id, type: source.type, status: 'disabled' } };
  }

  try {
    const password = secrets?.calendarSources?.[source.id]?.password || '';
    const payload = source.type === 'caldav'
      ? await fetchCalDavEvents({ source, password, timeMin, timeMax })
      : await fetchIcsEvents({ source, password, timeMin, timeMax });
    return {
      calendars: payload.calendars,
      events: payload.events,
      source: {
        id: source.id,
        type: source.type,
        name: source.name || payload.feedName || source.url,
        status: 'ready',
        eventCount: payload.events.length,
      },
    };
  } catch (error) {
    return {
      calendars: [],
      events: [],
      source: {
        id: source.id,
        type: source.type,
        name: source.name || source.url,
        status: 'error',
        error: describeFetchError(error),
      },
    };
  }
};

module.exports = {
  buildSourceCalendar,
  fetchCalDavEvents,
  fetchCalendarSourceBundle,
  fetchIcsEvents,
};

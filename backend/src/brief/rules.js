// Signals and user rules that decide whether a calendar event is worth mentioning.
// Everything here is pure (no I/O) and provider-neutral: it only looks at title, description, location and
// calendar name, which every calendar source (Google, ICS subscription, CalDAV) provides.

const MAX_KEYWORDS = 100;

// Lower-case and strip diacritics so "Ärztin", "ärztin" and "Arztin" are the same, and so \b works for German text.
// "ß" is not a diacritic (NFD leaves it alone), so it is folded to "ss" explicitly: "Fußball" == "Fussball".
const normalizeText = (value) => `${value ?? ''}`
  .toLowerCase()
  .replace(/ß/g, 'ss')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const normalizeKeywordList = (value) => {
  const source = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/\r?\n|,/) : []);
  const seen = new Set();
  const result = [];
  source.forEach((entry) => {
    const keyword = `${entry ?? ''}`.trim();
    const key = normalizeText(keyword);
    if (keyword.length >= 2 && keyword.length <= 60 && !seen.has(key) && result.length < MAX_KEYWORDS) {
      seen.add(key);
      result.push(keyword);
    }
  });
  return result;
};

// services.context.rules
//   alwaysShow    - events whose title/place/calendar contains one of these words are never hidden
//   neverShow     - events containing one of these words are always hidden
//   routineHints  - RECURRING events containing one of these words count as routine (lessons, shifts, ...)
const normalizeContextRules = (raw = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    alwaysShow: normalizeKeywordList(source.alwaysShow),
    neverShow: normalizeKeywordList(source.neverShow),
    routineHints: normalizeKeywordList(source.routineHints),
  };
};

// Pin / mute from the remote UI: changes the same lists the rules editor shows, so nothing is hidden away.
//   pin    -> alwaysShow. "Never show" beats "Always show", so every never-show word that matches the event
//             is removed too; otherwise the pin would silently do nothing. The removed words are returned.
//   mute   -> neverShow (it wins over alwaysShow, so nothing has to be removed)
//   clear  -> the exact keyword leaves both lists
// Returns { rules, removed }: the new normalized rules (the input is not modified) and the words that were
// dropped on the way, so the UI can say so. Throws on an unusable keyword or action.
const applyRuleAction = (rules, action, keyword, event = null) => {
  const normalized = normalizeContextRules(rules);
  const word = `${keyword ?? ''}`.replace(/\s+/g, ' ').trim();
  if (!['pin', 'mute', 'clear'].includes(action)) {
    throw new Error('Unknown action.');
  }
  if (word.length < 2 || word.length > 60) {
    throw new Error('The keyword must be 2 to 60 characters long.');
  }
  const key = normalizeText(word);
  const sameWord = (entry) => normalizeText(entry) === key;
  const removed = [];

  let { alwaysShow, neverShow } = normalized;
  alwaysShow = alwaysShow.filter((entry) => !sameWord(entry));
  neverShow = neverShow.filter((entry) => !sameWord(entry));

  if (action === 'pin') {
    const text = getEventRuleText(event || { title: word });
    neverShow = neverShow.filter((entry) => {
      if (text.includes(normalizeText(entry))) {
        removed.push(entry);
        return false;
      }
      return true;
    });
    alwaysShow = [...alwaysShow, word];
  } else if (action === 'mute') {
    neverShow = [...neverShow, word];
  }
  return { rules: normalizeContextRules({ ...normalized, alwaysShow, neverShow }), removed };
};

const getEventRuleText = (event) => normalizeText([
  event?.title || '',
  event?.location || '',
  event?.calendarSummary || '',
].join('\n'));

const matchesKeywords = (event, keywords = []) => {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return null;
  }
  const text = getEventRuleText(event);
  return keywords.find((keyword) => text.includes(normalizeText(keyword))) || null;
};

// A change to the normal schedule is the most valuable thing a mirror can say, even for a recurring event.
const CHANGE_SIGNAL_PATTERN = /\b(ersatz\w*|entf(?:a|ae)llt|verschoben|verlegt|abgesagt|ausgefallen|vertretung|nachhol\w*|cancel+ed|moved|rescheduled|postponed|substitut\w*|replacement)\b/;

// Appointments with doctors, therapists and the like. Recurring ones (weekly physio) still matter.
const MEDICAL_SIGNAL_PATTERN = /\b(?:[a-z]*arzt[a-z]*|doctor|dentist|clinic|klinik\w*|hospital|krankenhaus\w*|ambulanz|physio\w*|therap\w*|infusion\w*|mrt|mri|blutabnahme|impf\w*|vaccin\w*|vorsorge|check-?up)\b/;

const hasChangeSignal = (event) => CHANGE_SIGNAL_PATTERN.test(normalizeText(`${event?.title || ''}\n${event?.description || ''}`));

const hasMedicalSignal = (event) => MEDICAL_SIGNAL_PATTERN.test(normalizeText(`${event?.title || ''}\n${event?.description || ''}\n${event?.location || ''}`));

module.exports = {
  applyRuleAction,
  CHANGE_SIGNAL_PATTERN,
  MEDICAL_SIGNAL_PATTERN,
  hasChangeSignal,
  hasMedicalSignal,
  matchesKeywords,
  normalizeContextRules,
  normalizeKeywordList,
  normalizeText,
};

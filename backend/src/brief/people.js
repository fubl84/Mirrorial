// "Could these two appointments involve the same person?" Used so that two family members' appointments at the
// same time are not reported as a collision.
//
// The only information available is which calendars a household member follows (household.members[].calendarIds).
//   - two events in the SAME calendar always compete: one calendar is one agenda
//   - events in calendars of DIFFERENT members do not compete
//   - an event in a calendar nobody owns (a shared "Family" calendar) could involve anyone, so it competes with all
//   - without any assignment there is no information, and everything competes (the behaviour before this existed)

const buildAgendaScope = (household) => {
  const members = (Array.isArray(household?.members) ? household.members : [])
    .filter((member) => Array.isArray(member?.calendarIds) && member.calendarIds.some(Boolean));
  if (members.length === 0) {
    return null;
  }

  const ownersByCalendar = new Map();
  members.forEach((member, index) => {
    const memberKey = member.id || `member_${index}`;
    member.calendarIds.filter(Boolean).forEach((calendarId) => {
      if (!ownersByCalendar.has(calendarId)) {
        ownersByCalendar.set(calendarId, new Set());
      }
      ownersByCalendar.get(calendarId).add(memberKey);
    });
  });

  const ownersOf = (event) => ownersByCalendar.get(event?.calendarId) || new Set();

  const couldConflict = (first, second) => {
    if (first?.calendarId && first.calendarId === second?.calendarId) {
      return true;
    }
    const firstOwners = ownersOf(first);
    const secondOwners = ownersOf(second);
    if (firstOwners.size === 0 || secondOwners.size === 0) {
      return true;
    }
    return Array.from(firstOwners).some((owner) => secondOwners.has(owner));
  };

  return { couldConflict, ownersOf };
};

// Always returns a usable predicate.
const getConflictPredicate = (household) => buildAgendaScope(household)?.couldConflict || (() => true);

module.exports = {
  buildAgendaScope,
  getConflictPredicate,
};

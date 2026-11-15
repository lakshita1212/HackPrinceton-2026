// Dial positions and rooms. `date`, `pack` and the role ids are sent to the host as-is
// (see CONTRACT.md). `era` picks how the rooms are drawn. 2026 is the personal station
// and has no pack, so it never calls the host.
//
// `onAir` is placeholder text for what the TV/radio shows that day. It only says what
// the public could know on that date; the host's source packets are the real content.
export const STATIONS = [
  { date: '1962-10-16', label: 'Oct 16', day: 'Tuesday, October 16, 1962', era: '1962', pack: 'cmc-1962',
    onAir: 'Regular programming. Nothing unusual on the evening news.' },
  { date: '1962-10-22', label: 'Oct 22', day: 'Monday, October 22, 1962', era: '1962', pack: 'cmc-1962',
    onAir: '7 PM: President Kennedy addresses the nation about Soviet missiles in Cuba.' },
  { date: '1962-10-24', label: 'Oct 24', day: 'Wednesday, October 24, 1962', era: '1962', pack: 'cmc-1962',
    onAir: 'The naval quarantine of Cuba is now in effect.' },
  { date: '1962-10-27', label: 'Oct 27', day: 'Saturday, October 27, 1962', era: '1962', pack: 'cmc-1962',
    onAir: 'Reports that an American reconnaissance plane is missing over Cuba.' },
  { date: '1962-10-28', label: 'Oct 28', day: 'Sunday, October 28, 1962', era: '1962', pack: 'cmc-1962',
    onAir: 'Radio Moscow: Khrushchev agrees to remove the missiles from Cuba.' },
  { date: '1969-07-20', label: '1969', day: 'Sunday, July 20, 1969', era: '1969', pack: 'apollo-1969',
    onAir: 'Live from the Moon: Apollo 11 has landed.' },
  { date: '1989-11-09', label: '1989', day: 'Thursday, November 9, 1989', era: '1989', pack: 'berlin-1989',
    onAir: 'Crowds gather at the Berlin Wall as the border crossings open.' },
  { date: '2026-11-15', label: '2026', day: 'Today', era: '2026', pack: null,
    onAir: 'Your own station.' },
];

export const ROLES = [
  { id: 'citizen', name: 'Citizen' },
  { id: 'journalist', name: 'Journalist' },
  { id: 'official', name: 'Official' },
  { id: 'historian', name: 'Historian' },
];

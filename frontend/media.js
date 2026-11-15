// Clips that play on each room's TV (video) and radio (audio).
// Put files in frontend/media/ and log each one's source and rights in MEDIA.md.
//   date   a station date from stations.js
//   kind   'video' (TV) or 'audio' (radio)
//   label  'archival' (real footage) or 'narration' (our own recording)
//   roles  rooms that get it; leave out for every room
//   source where it's from, shown under the big screen (e.g. 'JFK Library, public domain')
export const MEDIA = [
  // { date: '1962-10-22', kind: 'video', src: 'media/kennedy-address.mp4',
  //   title: "Kennedy's address to the nation", label: 'archival', roles: ['citizen', 'journalist'] },
];

export function mediaFor(date, role, kind) {
  return MEDIA.find((m) => m.date === date && m.kind === kind && (!m.roles || m.roles.includes(role)));
}

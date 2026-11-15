// Clips for the room TVs (video) and radios (audio). Every clip that fits the
// station and the role is one channel on the TV or one frequency on the radio,
// so each room tunes in its own mix. Files live in frontend/media/; log each
// one's source and rights in MEDIA.md.
//
//   era    the dial era it plays in: '1962', '1969' or '1989'
//   from   the first station date it may play on, so nothing airs before it happened
//   kind   'video' (TV) or 'audio' (radio)
//   roles  rooms that get it
//   gain   volume boost for clips recorded much quieter than the rest (NASA's Moon
//          TV is about 20 dB down); the big screen plays through a limiter
//   title, label ('archival'), source: shown on the card under the big screen
const PD = 'public domain';

export const MEDIA = [
  // ── 1962 ──────────────────────────────────────────────────────────────
  { era: '1962', from: '1962-10-22', kind: 'video', src: 'media/kennedy-address-1962-10-22.mp4', gain: 1.8,
    roles: ['citizen', 'journalist', 'official', 'historian'],
    title: "President Kennedy's address on Cuba", label: 'archival',
    source: `U.S. Information Agency film, National Archives · ${PD}` },
  { era: '1962', kind: 'video', src: 'media/civil-defense-duck-and-cover.mp4',
    roles: ['citizen', 'historian'],
    title: 'Duck and Cover: civil defense film for schools', label: 'archival',
    source: `Federal Civil Defense Administration, National Archives · ${PD}` },
  { era: '1962', kind: 'video', src: 'media/vienna-summit-1961.mp4', gain: 2.5,
    roles: ['official', 'journalist', 'historian'],
    title: 'Kennedy and Khrushchev meet in Vienna, June 1961', label: 'archival',
    source: `U.S. Information Agency film, National Archives · ${PD}` },
  { era: '1962', from: '1962-10-22', kind: 'audio', src: 'media/kennedy-address-1962-10-22.mp3',
    roles: ['citizen', 'journalist', 'official', 'historian'],
    title: "President Kennedy's address to the nation on Cuba", label: 'archival',
    source: `Oval Office broadcast, 7 PM, Oct 22, 1962 · ${PD}` },
  { era: '1962', kind: 'audio', src: 'media/civil-defense-duck-and-cover.m4a',
    roles: ['citizen'],
    title: 'Civil defense: "Duck and cover"', label: 'archival',
    source: `Federal Civil Defense Administration · ${PD}` },

  // ── 1969 ──────────────────────────────────────────────────────────────
  { era: '1969', kind: 'video', src: 'media/apollo11-first-step.mp4', gain: 7,
    roles: ['citizen', 'journalist', 'official', 'historian'],
    title: 'Live from the Moon: Armstrong steps off the ladder', label: 'archival',
    source: `NASA television, restored 2009 · ${PD}` },
  { era: '1969', kind: 'video', src: 'media/apollo11-flag.mp4', gain: 10,
    roles: ['citizen', 'historian'],
    title: 'Armstrong and Aldrin raise the flag', label: 'archival',
    source: `NASA television, restored 2009 · ${PD}` },
  { era: '1969', kind: 'video', src: 'media/apollo11-aldrin-running.mp4', gain: 7,
    roles: ['citizen', 'journalist'],
    title: 'Aldrin tries out walking and running on the Moon', label: 'archival',
    source: `NASA television, restored 2009 · ${PD}` },
  { era: '1969', kind: 'video', src: 'media/apollo11-nixon-call.mp4', gain: 6,
    roles: ['official', 'journalist', 'historian'],
    title: 'President Nixon calls the astronauts on the Moon', label: 'archival',
    source: `NASA television, restored 2009 · ${PD}` },
  { era: '1969', kind: 'video', src: 'media/apollo11-tv-panorama.mp4', gain: 6,
    roles: ['official', 'historian'],
    title: "Armstrong's TV panorama of Tranquility Base", label: 'archival',
    source: `NASA television, restored 2009 · ${PD}` },
  { era: '1969', kind: 'audio', src: 'media/apollo11-landing.m4a',
    roles: ['official', 'journalist', 'citizen', 'historian'],
    title: 'Mission audio: "The Eagle has landed"', label: 'archival',
    source: `NASA mission audio, July 20, 1969 · ${PD}` },
  { era: '1969', kind: 'audio', src: 'media/apollo11-first-step.m4a',
    roles: ['citizen', 'journalist', 'historian'],
    title: 'Mission audio: "One small step"', label: 'archival',
    source: `NASA mission audio, July 20, 1969 · ${PD}` },
  { era: '1969', kind: 'audio', src: 'media/apollo11-launch.m4a',
    roles: ['journalist', 'official', 'historian'],
    title: 'Launch day: liftoff from Cape Kennedy', label: 'archival',
    source: `NASA mission audio, July 16, 1969 · ${PD}` },

  // ── 1989 ──────────────────────────────────────────────────────────────
  // No public-domain footage of the Wall opening exists, so the channels
  // replay public-domain archive material about the Wall.
  { era: '1989', kind: 'video', src: 'media/berlin-border-1961.mp4',
    roles: ['citizen', 'journalist', 'official', 'historian'],
    title: 'From the archive: U.S. tanks at the new border, August 1961 (silent film)', label: 'archival',
    source: `U.S. Army Signal Corps film, National Archives · ${PD}` },
  { era: '1989', kind: 'audio', src: 'media/kennedy-ich-bin-ein-berliner-1963.mp3',
    roles: ['citizen', 'journalist', 'official', 'historian'],
    title: 'From the archive: Kennedy in Berlin, June 1963', label: 'archival',
    source: `"Ich bin ein Berliner," presidential recording · ${PD}` },
];

// Every clip for this station and role, in channel order.
export function clipsFor(station, role, kind) {
  return MEDIA.filter((m) => m.era === station.era && m.kind === kind
    && (!m.from || station.date >= m.from)
    && (!m.roles || m.roles.includes(role)));
}

// What the knob shows: TV channels for video, radio frequencies for audio.
const CHANNELS = [2, 4, 5, 7, 9, 11, 13];
const AM = [640, 770, 880, 1010, 1130, 1450];
const FM = ['88.5', '93.9', '97.1', '101.1', '104.3'];
export function channelName(kind, era, i) {
  if (kind === 'video') return `CH ${CHANNELS[i % CHANNELS.length]}`;
  return era === '1989' ? `FM ${FM[i % FM.length]}` : `AM ${AM[i % AM.length]}`;
}

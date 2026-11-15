# Media

Clips that play on the TVs and radios (`frontend/media/`, listed in `frontend/media.js`). Only use material that is public domain, and log every clip here.

Each TV has channels and each radio has stations: every clip that fits the station and the role is one more stop, so each room gets its own mix. A clip never plays on a station dated before it happened. The room's own TV plays a random channel silently.

## 1962

| File | Plays on | What it is | Source | Rights |
|---|---|---|---|---|
| `kennedy-address-1962-10-22.mp4` | TV from Oct 22, every role | The opening 4:49 of "Kennedy Address, Cuba": title card, the press cameras in the room, then the start of the speech. | [archive.org `gov.archives.arc.51510`](https://archive.org/details/gov.archives.arc.51510), U.S. Information Agency film, National Archives (ARC 51510) | Public domain (U.S. government work) |
| `kennedy-address-1962-10-22.mp3` | Radio from Oct 22, every role | Kennedy's full address on Cuba, 17:39. | [archive.org `jfks19621022`](https://archive.org/details/jfks19621022) | Public domain (official presidential address) |
| `civil-defense-duck-and-cover.mp4` / `.m4a` | TV: citizen, historian. Radio: citizen | *Duck and Cover* (1951), the civil defense film for schools, first 2:30. | [archive.org `171-66`](https://archive.org/details/171-66), Federal Civil Defense Administration, [NARA 38174](https://catalog.archives.gov/id/38174) | Public domain (U.S. government work) |
| `vienna-summit-1961.mp4` | TV: official, journalist, historian | Kennedy and Khrushchev at the Vienna summit, June 1961 (1:00–3:00 of the film). | [archive.org `gov.archives.arc.52685`](https://archive.org/details/gov.archives.arc.52685), U.S. Information Agency film (ARC 52685) | Public domain (U.S. government work) |

## 1969

| File | Plays on | What it is | Source | Rights |
|---|---|---|---|---|
| `apollo11-first-step.mp4` | TV, every role | Live TV from the Moon: Armstrong comes down the ladder and steps off. | NASA partially restored Apollo 11 video (2009), [EVA scene 1](https://archive.org/details/PartiallyRestoredVideoNeilArmstrongClimbsDownTheLunarModuleLadder) | Public domain (NASA) |
| `apollo11-flag.mp4` | TV: citizen, historian | Raising the flag. | [EVA scene 6](https://archive.org/details/PartiallyRestoredVideoNeilArmstrongAndBuzzAldrinRaiseTheAmerican) | Public domain (NASA) |
| `apollo11-aldrin-running.mp4` | TV: citizen, journalist | Aldrin tries walking and running. | [EVA scene 7](https://archive.org/details/PartiallyRestoredVideoBuzzAldrinWalkingAndRunning) | Public domain (NASA) |
| `apollo11-nixon-call.mp4` | TV: official, journalist, historian | The astronauts take President Nixon's call. | [EVA scene 8](https://archive.org/details/PartiallyRestoredVideoAstronautsTalkingWithPresidentNixon) | Public domain (NASA) |
| `apollo11-tv-panorama.mp4` | TV: official, historian | Armstrong's TV panorama of Tranquility Base. | [EVA scene 4](https://archive.org/details/PartiallyRestoredVideoNeilArmstrongsTelevisionPanorama) | Public domain (NASA) |
| `apollo11-landing.m4a` | Radio, every role | Mission audio from 2,000 feet to "The Eagle has landed" (Day 5 highlights, 3:20–7:30). | [NASA Apollo 11 audio highlights](https://www.nasa.gov/history/apollo-11-audio-highlights/), Day 5 | Public domain (NASA) |
| `apollo11-first-step.m4a` | Radio: citizen, journalist, historian | Mission audio: down the ladder to "one small step" (Day 5, 10:40–13:10). | Same, Day 5 | Public domain (NASA) |
| `apollo11-launch.m4a` | Radio: journalist, official, historian | Launch-day audio: countdown, liftoff and staging, July 16 (Day 1, 1:40–5:30). | Same, Day 1 | Public domain (NASA) |

## 1989

No public-domain footage of the Wall opening exists (the TV coverage belongs to the networks), so these channels replay public-domain archive material about the Wall.

| File | Plays on | What it is | Source | Rights |
|---|---|---|---|---|
| `berlin-border-1961.mp4` | TV, every role | U.S. tanks and military police at the new sector border, Aug 23–24, 1961 (silent). | [archive.org `111-lc-44802`](https://archive.org/details/111-lc-44802), Army Signal Corps, [NARA 28459](https://catalog.archives.gov/id/28459) | Public domain (U.S. government work) |
| `kennedy-ich-bin-ein-berliner-1963.mp3` | Radio, every role | Kennedy's "Ich bin ein Berliner" speech, June 26, 1963, 8:37. | [archive.org `jfks19630626`](https://archive.org/details/jfks19630626) | Public domain (official presidential address) |

## Room sound

Background sound for the offices and the study (`frontend/media/ambience/`, used by `frontend/ambience.js`). From Wikimedia Commons; the CC BY and CC BY-SA files need the credit shown here, which also goes on the Devpost.

| File | Room | Source | License |
|---|---|---|---|
| `typewriter-smith-corona.ogg` | Newsroom, 1962 and 1969 | ["Smith-Corona Prestige Auto 12 typing"](https://commons.wikimedia.org/wiki/File:Smith-Corona_Prestige_Auto_12_typing.ogg) by lonemonk | CC BY 3.0 |
| `keyboard-model-m-1986.ogg` | Newsroom and office, 1989 | ["Typing - Model M 1986"](https://commons.wikimedia.org/wiki/File:Typing_-_Model_M_1986.ogg) by Raymangold22 | CC0 |
| `keyboard-modern.ogg` | Newsroom and office, 2026 | ["Keyboard noise"](https://commons.wikimedia.org/wiki/File:Keyboard_noise.ogg) | Public domain |
| `clock-ticking.ogg` | Government office | ["Clock ticking"](https://commons.wikimedia.org/wiki/File:Clock_ticking.ogg) by natalie | Public domain |
| `grandfather-clock.ogg` | Historian's study | ["Grandfather Clock Ticking"](https://commons.wikimedia.org/wiki/File:Grandfather_Clock_Ticking.ogg) by Jud McCranie | CC BY-SA 4.0 |

In the living rooms, the TV on the set plays softly instead. A "Sound on/off" button at the top right of the room mutes all of it.

## How the clips were made

All cuts were made with macOS `avconvert`: `PresetPassthrough` where the source was already small (no re-encoding), `PresetAppleM4VWiFi` for the two large films, and `PresetAppleM4A` for audio. The restored NASA clips start 6 seconds in, to skip NASA's title card. The moments in the NASA audio were found by transcribing samples.

**Not used:** Universal Newsreel vol. 35 release 86 (archive.org `un-un-v35-r86`) has a good Oct 22, 1962 story, but the National Archives catalog marks it "Restricted - Possibly" for copyright (NAID 234274655).

To add a clip, put the file in `frontend/media/`, add a line to `frontend/media.js`, and log it here.

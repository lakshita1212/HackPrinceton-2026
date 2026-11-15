# Media

Clips that play on the TVs and radios (`frontend/media/`, listed in `frontend/media.js`). Only use material that is public domain or openly licensed, and log every clip here.

| File | Plays on | What it is | Source | Rights |
|---|---|---|---|---|
| `kennedy-address-1962-10-22.mp4` | TV, Oct 22, 1962, every room | The opening 4:49 of "Kennedy Address, Cuba": title card, the press cameras in the room, then the start of the speech through the evidence of missile sites in Cuba. 320×240. | [Internet Archive `gov.archives.arc.51510`](https://archive.org/details/gov.archives.arc.51510) (FedFlix), U.S. Information Agency film held by the National Archives (ARC 51510, local id 306.5292) | Public domain: made by a U.S. government agency. Marked public domain on the Internet Archive. |
| `kennedy-address-1962-10-22.mp3` | Radio, Oct 22, 1962, every room | President Kennedy's full address to the nation on the Soviet arms buildup in Cuba, Oval Office, 7 PM ET, 17:39. | [Internet Archive `jfks19621022`](https://archive.org/details/jfks19621022) (64 kbps MP3) | Public domain: an official presidential address, a work of the U.S. government. |

**How the clips were made**
- **TV:** the archive's 512 kbps MP4 (18:42), trimmed to the first 4:49 at a pause in the speech with macOS `avconvert -p PresetPassthrough --duration 289`. It is not re-encoded.
- **Radio:** the archive's 64 kbps MP3, unchanged.

**Not used:** Universal Newsreel vol. 35 release 86 (Oct 22, 1962, archive.org `un-un-v35-r86`) has a good Kennedy story, but the National Archives catalog marks it "Restricted - Possibly" for copyright (NAID 234274655), so it isn't public domain for certain.

To add a clip, put the file in `frontend/media/`, add a line to `frontend/media.js`, and log it here.

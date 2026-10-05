# Design notes

## Direction
Dark, content-first, with one blue accent and gold reserved for scores and live moments.
The video and the score are the stars; everything else stays quiet.

## Where the style comes from
Live sports sites could not be captured (no internet access in the build environment, and
web search returned buyer guides rather than design details), so the look is adapted from
brand design systems in the design library plus well-known sports-streaming conventions:

| Source | What we took |
|---|---|
| Spotify | Near-black surfaces in layers, pill chips, circular play buttons, one accent, UI recedes behind content |
| Nike | Huge uppercase condensed display type over imagery, filter pills, photo-first cards |
| Lamborghini | True dark base with a single gold highlight used sparingly |
| Sports-streaming conventions (DAZN, ESPN style) | LIVE badge, scoreboard strip under the video, horizontal card rails, score-first replay cards |

Still to do: compare against screenshots of real streaming sites once available.

## Tokens (see `:root` in `src/styles.css`)
- Background `#0a0f1a`, surfaces `#111827` / `#182033`, lines `#263149`
- Accent blue `#2563eb` (placeholder, replace with the logo's blue), gold `#f6b93b` (placeholder)
- Display font: Barlow Condensed 700, uppercase. Text font: Inter. Two fonts only.
- Radius 16px, tap targets 44px or more, transitions 200ms, reduced motion respected

## Signature detail
The owl-eye mark: used as the logo, the LIVE badge (the pupils blink slowly) and the
empty-video state.

## Photos
Cards have a gradient placeholder. Add `cover` image paths in `data/games.json` (or a
YouTube `replayId`, which uses the video thumbnail) once photos are approved.

# Design notes

## Direction (updated with the supplied "Editorial Cinematic" spec)
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

## Editorial Cinematic spec: what was applied and what was adapted
Applied as written: Instrument Serif (400) for display with tight tracking (H1 80px desktop,
48px mobile, line-height 0.95, letter-spacing -0.031em, which equals -2.46px at 80px), Inter for
UI, centered full-screen hero with a video layer, 3-column nav (logo, four links, pill button),
fade-rise entrance (0.8s ease-out, 0.2s stagger, 24px), pill buttons that scale to 1.03 on hover,
HSL(201,100%,13%) fallback behind the media, 0.2 dark overlay on the media.

Adapted for this site:
- The spec's navy text (#0f172a) and black pill assume a bright video. A dark sports site needs
  light text, so the default tone is `dark` (white text, white pill). Set `"heroTone": "light"`
  in `site.config.json` to get the spec's navy text and black pill for bright footage.
- Gold stays reserved for scores and LIVE.
- The trademark symbol on the logo was left out (TIS Owls Live is not a registered mark).
- Condensed Barlow was dropped, so the site still uses exactly two fonts.

## Visuals
- `src/assets/hero-pitch.svg`: drawn night pitch with two floodlight beams (placeholder for
  real footage). To use video, put an mp4 in `src/assets/` and set `"heroVideo": "/assets/your.mp4"`.
- Cards without a photo show line art of the sport's court or pitch (football, basketball, volleyball).
- Recommendation: real, consent-approved footage or photos of TIS games beat AI-generated
  athletes. Avoid realistic AI images of children on this site.

# Zolto Instagram short — generation prompts for AI video

> Companion to [`instagram-short-brief.md`](./instagram-short-brief.md), which
> holds the pitch, the audience, and — read it first — **§5, the claims we may
> not make**. This file is only the production route: the same 45-second script,
> rewritten as prompts for a text-to-video model instead of a call sheet.
>
> Written for **Veo-3-class models** (Google's video generation family — native
> audio, ~8-second clips, 9:16 output). The prompt shape ports to Runway, Kling
> and Sora with minor edits; the constraints in §1 apply to all of them.
>
> Written 2026-08-06.

---

## 1. Read this before generating anything

**This script is close to the worst case for AI video, for one specific
reason: it is about a product on a screen.** Current models cannot render a
legible, correct user interface. They will produce a phone showing plausible
smeared UI-like shapes, with garbled text. Three of our seven beats are screen
beats, and if the viewer can't read the product grid in beat 4 the video has no
subject.

**So do not ask the model to render the product.** The workable route is a
hybrid:

| Layer | How |
|---|---|
| Person, location, lake, motion, atmosphere | **AI-generated** — models are genuinely good at this now |
| Phone and laptop **screen content** | **Composited in post** — screen-replacement onto a tracked rectangle |
| Captions, logo, end card | **Post** — never generate on-screen text |
| Voice | **One recorded or TTS track over the whole cut** — not per-clip generated dialogue |

Every prompt below is therefore written to give the compositor a clean, trackable
screen: device held steady, screen flat to camera, **screen off or a plain solid
colour**, hand not covering the display.

Three more constraints worth knowing before you start:

1. **~8 seconds per generation.** The 45s piece is 7 separate clips, stitched.
   Nothing carries between them except what you put in the prompt.
2. **Character drift is the main failure.** The same woman must appear in all
   seven. Paste the character block in §2 *verbatim* into every prompt, and use
   the last frame of each clip as the reference image for the next one.
3. **Generate 4–6 variants per beat.** Expect to keep one. Budget for that
   rather than being surprised by it.

---

## 2. Blocks to paste into every prompt, unchanged

Consistency comes from repetition, not from the model remembering. These two
blocks go in **every** generation, word for word.

### CHARACTER (do not reword between clips)

```
A 32-year-old Swiss woman, warm and relaxed, shoulder-length dark blonde hair
loosely tied back with strands escaping in the wind, light freckles across the
nose, minimal natural makeup. She wears an unbuttoned cream linen overshirt over
a plain white t-shirt, straight-leg indigo jeans, small gold hoop earrings, and
a tan canvas crossbody bag. Natural skin texture with visible pores and fine
lines. Ordinary, believable, not a model.
```

### STYLE (do not reword between clips)

```
Shot on a modern smartphone in 4K, vertical 9:16 aspect ratio. Handheld with
slight natural sway and micro-jitter, as if held by a friend walking backwards.
Shallow depth of field, background softly out of focus. Golden hour in Zürich,
low warm sunlight raking across Lake Zürich, water sparkling behind her.
Documentary realism. Natural colour, no cinematic teal-and-orange grade, no lens
flares, no slow motion. Candid social-media footage, not an advertisement.
```

### NEGATIVE PROMPT (every clip)

```
on-screen text, subtitles, captions, watermarks, logos, user interface elements,
readable screen content, distorted hands, extra fingers, warped faces, plastic
skin, oversaturated colours, slow motion, drone shot, cinematic colour grade,
studio lighting, stock-footage look, crowds staring at camera
```

---

## 3. The seven clips

Each prompt is self-contained. Dialogue is listed separately in §4 — **do not
put it in the prompt** unless you are deliberately testing native audio (see §5).

---

### Clip 1 · 0–5s · The hook

> **[CHARACTER]** walks slowly toward the camera along the wide stone promenade
> at Bürkliplatz in Zürich, talking directly to the lens with an easy, unforced
> expression, one hand gesturing lightly. Behind her, Lake Zürich stretches out
> with small moored boats, a passenger ferry in the middle distance, and the
> faint silhouette of the Alps on the horizon. A few pedestrians and a cyclist
> pass naturally in the background, none of them looking at the camera.
> The camera walks backwards ahead of her, keeping her from the waist up, her
> eyeline just above lens height. **[STYLE]**
> Ambient audio: light wind, water lapping, distant gulls, footsteps on stone.

---

### Clip 2 · 5–11s · The other half of the job

> **[CHARACTER]** continues walking toward the camera along the Zürich lakeside
> promenade, now counting items off on the fingers of her right hand, one at a
> time, with a small wry shrug at the end. Plane trees line the path on her
> right; the lake glitters on her left. The camera continues to walk backwards
> ahead of her at the same distance and height as before. **[STYLE]**
> Ambient audio: wind, footsteps, a distant tram bell.

---

### Clip 3 · 11–19s · The notebook

> **[CHARACTER]** stops walking on the Utoquai promenade beside Lake Zürich and
> turns side-on to the camera. She holds a small open notebook filled with
> handwritten lines in one hand, and raises a smartphone in the other to
> photograph the page. She then turns the phone to face the camera, holding it
> steady and flat, screen fully visible and unobstructed by her fingers. **The
> phone screen is a plain matte dark grey rectangle with no content on it.**
> Dappled light through plane trees, lake visible behind her shoulder. Camera
> static at chest height, slight handheld sway. **[STYLE]**
> Ambient audio: wind in leaves, water, a passing jogger's footsteps.

*Post: track the grey rectangle, composite the real product grid onto it.*

---

### Clip 4 · 19–27s · The till — **the money shot**

> **[CHARACTER]** walks slowly along the Zürich lakeside promenade holding a
> smartphone flat in her left hand, screen up and angled toward the camera,
> tapping the screen twice with her right thumb in a deliberate, unhurried
> motion. **The phone screen is a plain matte dark grey rectangle with no
> content on it.** Her fingers stay clear of the display. She glances from the
> phone to the camera and back with a small satisfied nod. Lake and low golden
> sun behind her. The camera tracks alongside her at chest height, close enough
> that the phone fills a third of the frame. **[STYLE]**
> Ambient audio: footsteps, wind, lake water, faint city hum.

*Post: composite the POS grid, then the TWINT / card / cash row, timed to her
two taps. This is the beat the whole video exists for — spend the most time
here.*

---

### Clip 5 · 27–35s · One stock count

> **[CHARACTER]** sits on a wooden bench on the Utoquai promenade in Zürich with
> an open silver laptop on her knees and a smartphone lying flat on the bench
> beside her, both screens angled up and visible to the camera. **Both screens
> are plain matte dark grey rectangles with no content on them.** She looks from
> the laptop to the phone and back, then to the camera, raising her eyebrows
> slightly. Lake Zürich fills the background behind the bench, low sun on the
> water. Camera static, slightly above, framing bench, laptop, phone and lake.
> **[STYLE]**
> Ambient audio: water, distant voices, a boat engine far off.

*Post: composite the storefront on the laptop and the POS on the phone, and
animate the same stock number changing on both at the same instant.*

---

### Clip 6 · 35–41s · The concession

> Close-up of **[CHARACTER]** standing on the Zürich lakeside promenade, framed
> from the shoulders up, speaking directly to camera. She gives a small honest
> shrug and a brief genuine half-laugh mid-sentence, then becomes matter-of-fact.
> Wind moves a strand of hair across her face and she tucks it back without
> breaking eye contact. Lake and warm evening light thrown out of focus behind
> her. Camera handheld, static, slightly closer than the previous clips.
> **[STYLE]**
> Ambient audio: wind close on the microphone, water, distant gulls.

*This is the most persuasive six seconds in the piece. Generate the most
variants here and pick the one where the laugh looks involuntary.*

---

### Clip 7 · 41–45s · Sign-off

> **[CHARACTER]** turns and walks away from the camera along the Zürich lakeside
> promenade, then glances back over her shoulder and says one last line with a
> small smile before turning forward again. The low sun is ahead of her, the
> lake to her left, the path stretching out empty in front. Camera static,
> letting her walk into the distance. **[STYLE]**
> Ambient audio: footsteps receding, wind, water, a distant church bell.

*Post: end card over the last second — logo, CHF 0/month, zolto.ch.*

---

## 4. The voice track

Record or synthesise **one continuous take** over the finished cut. Do not
generate dialogue per clip — seven separately generated voices will not match,
and the joins are audible in a way viewers register as "AI" even when they can't
say why.

| Clip | Line |
|---|---|
| 1 | "If you make things for a living in Switzerland — this is the part nobody warns you about." |
| 2 | "You're not just making the thing. You're photographing it, writing it up, building the website, keeping the stock list, and doing the maths at eleven at night." |
| 3 | "So this one is interesting. She photographed a page of her notebook — and that's the catalogue. Names, prices, quantities. She didn't type any of it." |
| 4 | "And at a market, this is the till. She taps the photo of the actual piece — then TWINT, card or cash, same screen. That's the bit the card companies don't do." |
| 5 | "Same piece is already on her website — written up in German, French, Italian and English. One stock count across both. Sell it here, it's gone there. Instantly." |
| 6 | "Is it the cheapest way to take a card? No. It isn't. But that's not what she's paying for — she's paying to not spend her evenings doing admin." |
| 7 | "Zolto. It's Swiss, and it's free to start." |

**Delivery: third person, unpolished, one or two natural stumbles left in.** She
is describing what a maker gets, not selling. Beat 6 must sound offhand — an
aside, not a line. A German-language version is worth producing from the same
picture cut.

---

## 5. If you want the model to speak the lines

Veo-3-class models can generate lip-synced dialogue. It is tempting and it is
usually the wrong call here, for two reasons: the voice will drift in timbre and
accent across seven clips, and the delivery tends toward presenter cadence —
which is precisely the register this script is written against.

If you try it anyway:

- Append to the prompt: `She says, in a warm Swiss-accented English voice, with
  natural pacing and no presenter cadence: "…"`
- Generate every clip in one session with the same seed.
- Judge clip 6 first. If the concession sounds performed, abandon the approach
  — that beat carries the credibility of the whole video.

---

## 6. Assembly

1. **Stitch** the seven clips in order. Trim to the timings in §3; AI clips
   usually need 0.5–1s off each end where motion settles.
2. **Screen-replace** clips 3, 4 and 5. Corner-pin or planar-track the grey
   rectangles. The product must be legible for **at least 2 seconds** in each.
3. **Voice** over the whole cut, then nudge picture to speech rather than the
   other way round.
4. **Captions** — bold condensed sans, word-by-word pop-on, white with a hard
   dark outline, gold `#B8963E` on one or two key words. Safe areas in
   1080×1920: **120px top, 420px bottom, 60px sides.** Instagram's own UI covers
   the bottom fifth.
5. **Ambience bed** under the voice — lake, wind, gulls, a tram. Keep it; a
   clean-room mix is what makes AI footage feel synthetic.
6. **Export** 1080×1920, H.264. Also cut a 15-second version from clips 1, 4, 6
   and 7.

---

## 7. Disclosure

If the finished piece is materially AI-generated, label it. Instagram requires
disclosure of realistic AI-generated content, and this video's whole persuasive
strategy is honesty about what Zolto is and isn't — the same site now publishes
a table showing our card rate is the dearest of the three. Getting caught
passing off a synthetic person as a real reviewer would cost more than the
video could earn.

Use Instagram's AI-content label, and keep the on-screen claims to the list in
[`instagram-short-brief.md`](./instagram-short-brief.md) §5.

**One consequence worth weighing before committing to this route:** a synthetic
presenter cannot be a *testimonial*. She can describe the product, which is what
this script has her do. She cannot say she uses it, and no caption on the post
should imply a real person's experience. If the goal is a genuine creator
endorsement, the live-action brief is the route — this one is a product film
with a presenter in it.

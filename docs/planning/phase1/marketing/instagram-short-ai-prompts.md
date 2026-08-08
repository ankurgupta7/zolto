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
| Phone and laptop **screen content** | **Real screen recordings, cut to full frame** — see §3a |
| Captions, logo, end card | **Post** — never generate on-screen text |
| Voice | **One recorded or TTS track over the whole cut** — not per-clip generated dialogue |

### Cut away to the screen; don't composite onto it

There are three ways to get a real interface into an AI-generated clip, and the
obvious one is the worst one:

| | Route | Tooling | Verdict |
|---|---|---|---|
| **A** | **Cut away to a full-frame screen recording** — her hand and the phone in the AI shot, hard cut to the real app filling the frame, cut back | Any editor. Descript, Canva, CapCut | **Do this** |
| B | Screen recording as a floating card beside her, picture-in-picture | Any editor | Fine for beat 5 (laptop) |
| C | Tracked screen replacement — corner-pin the recording onto the moving phone | After Effects + Mocha, or CapCut's tracker | Not worth it here |

**Route C is what "screen replacement" normally means, and neither Descript nor
Canva can do it** — both can overlay a rectangle, neither can motion-track one
onto a phone moving through frame. Attempting it there gives you a sticker
sliding around on top of her hand.

Route A is also just better. A phone held at arm's length in a wide shot gives
the interface maybe 300px of frame height; a full-frame screen recording gives
it 1920. The legibility problem doesn't get solved, it gets deleted. And
cutting to a screen recording is native Instagram grammar — creators do it in
every second video, so it reads as normal rather than as a compositing trick.

Every prompt below is therefore written so the phone is held **naturally, screen
angled away from or dark to the lens** — we are never asking the model to sell
the screen, only the person holding one.

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
> photograph the page, framing it the way people photograph a document. **The
> phone is seen from behind and from the side; its screen is angled away from
> the camera and never legible.** She lowers it and looks at it, pleased.
> Dappled light through plane trees, lake visible behind her shoulder. Camera
> static at chest height, slight handheld sway. **[STYLE]**
> Ambient audio: wind in leaves, water, a passing jogger's footsteps.

*Edit: cut away to screen recording **S1** on "and that's the catalogue", then
back to her for the last sentence.*

---

### Clip 4 · 19–27s · The till — **the money shot**

> **[CHARACTER]** walks slowly along the Zürich lakeside promenade holding a
> smartphone in her left hand and tapping it twice with her right thumb in a
> deliberate, unhurried motion. **The phone is seen from behind and above her
> hand; its screen is tilted away from the camera and never legible.** She
> glances from the phone to the camera and back with a small satisfied nod.
> Lake and low golden sun behind her. The camera tracks alongside her at chest
> height, close enough that her hand and the phone fill a third of the frame.
> **[STYLE]**
> Ambient audio: footsteps, wind, lake water, faint city hum.

*Edit: this beat is mostly **S2** — cut to the full-frame screen recording on
"this is the till" and stay there through the tap and the payment row, coming
back to her only for the last sentence. This is the beat the whole video exists
for; give the screen more time than her.*

---

### Clip 5 · 27–35s · One stock count

> **[CHARACTER]** sits on a wooden bench on the Utoquai promenade in Zürich with
> an open silver laptop on her knees and a smartphone lying on the bench beside
> her. **The camera is behind her right shoulder, so both screens are seen at a
> steep oblique angle and neither is legible.** She looks from the laptop to the
> phone and back, then half-turns to the camera, raising her eyebrows slightly.
> Lake Zürich fills the background beyond the bench, low sun on the water.
> Camera static, slightly above and behind. **[STYLE]**
> Ambient audio: water, distant voices, a boat engine far off.

*Edit: **S3** — a split screen, storefront above and POS below, with the same
stock number ticking down on both at the same instant. This is the one beat
where route B (a picture-in-picture card over her shoulder) also works, and
looks good.*

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

## 3a. The three screen recordings

These are the actual subject of the video. Capture them from a real store with
real stock — not placeholder text — on a phone at 1080×1920 and a laptop at
1920×1080. Screen-record with the device's own recorder; do not film a screen
with a camera.

| | What | Device | Length | Cuts into |
|---|---|---|---|---|
| **S1** | Notebook page photographed → the catalogue fills in, names and prices and quantities appearing as rows | Phone, 9:16 | 4s | Clip 3 |
| **S2** | The POS grid of product photographs → thumb taps one → the TWINT / card / cash row → TWINT chosen | Phone, 9:16 | 5s | Clip 4 |
| **S3** | Storefront listing above, POS below, one stock count dropping on both together | Laptop + phone, composed as a 9:16 split | 4s | Clip 5 |

Notes that matter:

- **S1 and S2 are already 9:16.** A phone screen recording drops into this edit
  full-frame with no cropping and no letterbox. That is most of why route A is
  the easy one.
- **S3 is the awkward one** — a 16:9 browser window in a 9:16 frame. Compose it
  as a split (storefront top, POS bottom) rather than shrinking the whole
  browser; a full desktop window scaled to fit is illegible again, which is the
  problem we started with.
- **Slow the interactions down.** Record at a deliberate, almost stately pace.
  Real usage speed is unreadable at Reels length, and speeding a recording up in
  the edit is easy while slowing one down is not.
- **Hide the clock and notifications.** Do Not Disturb, full battery, no banner
  sliding in mid-take.
- **Match the light.** Golden hour outdoors is warm; a screen recording is not.
  A slight warm grade on the recordings stops the cutaways feeling pasted in.

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
2. **Drop in the cutaways** — S1 into clip 3, S2 into clip 4, S3 into clip 5,
   full frame, hard cuts both ways. The product must be legible for **at least
   2 seconds** in each. No transitions; a dissolve here reads as a corporate
   video.
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
should imply a real person's experience.

### 7a. "But I want her to say she used it"

This is the natural instinct, because first person is more persuasive than
third. It is also the one thing this route cannot give you, and no amount of
production quality changes that: a person who does not exist cannot have used
anything. A generated woman saying *"I've been using this at markets all
summer"* is a fabricated endorsement — the same category as a written review
from a customer who isn't real, and not a category that gets rescued by the
video looking good.

The exposures are concrete, not theoretical. Swiss unfair-competition law
(UWG Art. 3) covers misleading statements about a business; the Swiss
Lauterkeitskommission takes complaints from anyone, including competitors, and
we are about to start naming two of them on our own comparison pages.
Instagram's synthetic-media rules require the label, and the label sitting over
a first-person usage claim is itself the disclosure that the claim is false.
And the whole positioning
we rebuilt in August is *"we tell you the unflattering number"* — the site now
publishes a table showing our card rate is the dearest of the three. A faked
testimonial is expensive precisely because of the strategy it contradicts.
*(Not legal advice — worth ten minutes with a Swiss lawyer before publishing
either way.)*

**So: if you want first person, get a real person.** Three ways, all cheaper
than they sound:

| | Route | What it costs | What you get |
|---|---|---|---|
| **1** | **A creator who actually uses it.** Standard influencer arrangement — give them a store, real stock and a market day, a week before the shoot. | A fee, a week's lead time, a `#bezahltePartnerschaft` disclosure | Everything. First person, true, and they'll write better lines than we did |
| **2** | **The pilot maker.** She already uses it. Signed release (`../legal/content-release-form.md`), shoot her at her own stall. | Almost nothing | The most credible version, and real product on the screens |
| **3** | **You, on camera.** First person, but as the founder. | Nothing | Honest, and beat 6 lands differently — a founder conceding the price is not the cheapest is *more* striking than a reviewer doing it, not less |

Route 1 is the one you were reaching for. Note that it makes most of this file
redundant: once a real person is on camera, the AI generation is only useful for
b-roll you couldn't get on the day.

**And if you keep the synthetic presenter, keep her in the third person.** The
script as written is already the workaround — she describes what *a maker*
gets, which is true, checkable, and needs no one to have used anything. That is
why it was written that way.

### 7b. The hearsay workaround, which is not one

The next instinct after §7a is to soften rather than drop it: *"some people say
it's really nice"*, *"everyone I've spoken to loves it"*, *"it's got a bit of a
following"*. This reads as safer because it is vaguer. It isn't safer, for a
reason specific to where we are: **Zolto has no users yet**
([`../../positioning-pricing-revision.md`](../../positioning-pricing-revision.md)
§ on `unverified` confidence). There are no some-people. Attributing an opinion
to unnamed others who don't exist is the same fabrication as claiming it
yourself, with the source hidden so it can't be checked — which is a worse
position to be found in, not a better one.

It is also, straightforwardly, the weakest sentence available. Vague praise is
the register this entire script is written against; put *"some people say it's
super nice"* next to *"she taps the photo of the actual piece"* and the second
line does all the work. Beat 6 is persuasive **because** nothing around it is
vague.

**What you actually want from that line — outside validation — the script
already has**, at the end of beat 4:

> "That's the bit the card companies don't do."

That is a claim about the market rather than about her, it is the positioning
we spent August substantiating, and the compare page carries the sources and
retrieval dates behind it. A presenter may state a sourced fact freely. What she
may not do is report an experience she didn't have, at first or second hand.

Three lines that are true today and need no user base:

| Line | Standing behind it |
|---|---|
| "That's the bit the card companies don't do." | The capability matrix — one has the grid without TWINT, the other the reverse, both sourced |
| "It's built in Zürich, and the money lands in your own account." | `SOVEREIGNTY`, shipped |
| "Is it the cheapest way to take a card? No. It isn't." | Our own published table, where our card rate is the dearest of the three |

And the real answer to wanting social proof: it is **weeks away, not years**.
Five makers actually using it and *"the people using it say…"* becomes true,
quotable, and screenshottable — worth waiting for rather than counterfeiting a
thin version of now.

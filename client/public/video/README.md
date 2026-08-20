# Homepage explainer video

The first chapter of the homepage reel (`client/src/marketing/pages/Landing.tsx`)
renders `<ExplainerVideo>` against these two paths:

| Path                                | In the repo | Notes                                                                   |
| ----------------------------------- | ----------- | ----------------------------------------------------------------------- |
| `/video/gwinn-explainer-poster.svg` | yes         | Drawn poster frame, 16/10, in the marketing palette.                    |
| `/video/gwinn-explainer.mp4`        | **no**      | The cut itself. Drop the file here and it starts playing; nothing else. |

The mp4 is deliberately not committed — a marketing video is a binary that gets
re-cut, and this repo is not where its versions should live. Until it lands, the
component renders the poster and the play button: `ExplainerVideo` paints the
poster as the frame's background as well as passing it to the `<video>`, so a
missing or failed video is a still image rather than a black box.

When you add it:

- **H.264 / AAC in an MP4**, `faststart` (moov atom first) so it starts on the
  first range request rather than after the whole file.
- **16:10** to match the poster frame (`aspect-[16/10]`); anything else is
  letterboxed by `object-cover`.
- **Silent-legible.** It loops muted until the reader clicks, so whatever the
  narration says has to also be readable from the picture.
- Keep it small — this is above the fold on the homepage. Under ~4 MB for a
  two-minute cut is achievable at 1280×800.

```bash
ffmpeg -i cut.mov -vf scale=1280:800 -c:v libx264 -crf 24 -preset slow \
       -c:a aac -b:a 96k -movflags +faststart \
       client/public/video/gwinn-explainer.mp4
```

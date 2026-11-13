# AI 360 test (experiment, not part of the site)

Cheap test from `advisor-notes/idea-ai-360-splat.md`, 2026-11-05.

- Input: one existing AI photo of the stock Golf (`renders/22803791ae24d6ff733dccfd.jpg`, already paid for, no new cost).
- Tool: free Hugging Face Space `trellis-community/TRELLIS` (image to 3D), no account. About 2 minutes.
- Output: `out/golf.glb` (textured 3D model), `out/preview.mp4` (TRELLIS turntable), `out/cutout.png`.
- The Gaussian splat file (`.ply`) was not saved: its download timed out, and the retry was blocked because it re-uploads the photo to a public server. It needs Ryan's OK.
- View: run the `site` preview and open `/experiments/ai-360/`.

Verdict: recognisably a white Golf-like hatchback, but toy-like and blurry. The front and the far side are guessed, because the photo only showed the side and the rear. Not real enough yet.

## Next: 6-photo try (waiting for the free limit to reset, ~2026-11-06 21:45)
The no-account free limit ran out on 2026-11-05. Ryan chose to wait a day.
Run from the project folder (uses 6 angles from the existing AI turntable in `renders/`):
`py experiments/ai-360/run_multi.py experiments/ai-360/out-multi renders/39b40eb3cf4f0bcf3c40a7c7.jpg renders/34bb4d25c08361339c9fe79e.jpg renders/d737a67e4a1c40f3b3db5b77.jpg renders/cf4579c05c893b9725bf296c.jpg renders/22803791ae24d6ff733dccfd.jpg renders/b36ee4bdcb7e61c814d82101.jpg`
(create `out-multi` first). Ryan has approved uploading these photos to the free Hugging Face tool.

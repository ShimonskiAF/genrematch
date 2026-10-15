# GenreMatch

Free, static, client-side genre reader. Audio is decoded and measured in the browser and is never uploaded or stored.

## Run locally
    npm test          # unit tests (node:test, Node 18+)
    npm run harness   # synthetic audio harness (writes test-audio/)
    npm run serve     # then open http://localhost:8080  (file:// won't work)

## Deploy
Push to GitHub, then go to Settings → Pages → Source: GitHub Actions. `.github/workflows/pages.yml` runs the tests and then deploys.

## Layout
index.html / 404.html; css/ (Overlap kit, unmodified, plus app.css for layout); assets/ (kit logos and icons, brief template); data/ (genre_profiles.json, atlas_lite.json); js/ (analyser, scoring, market, brief, app); tools/ (synth, harness); test/.

## Limitations
- Genre profiles and feature divisors are starting estimates, not yet calibrated on real tracks.
- Only synthetic audio has been tested. Texture reads low on synthetic club loops, so their fits are low or medium.
- PDF export uses the browser print dialog (Save as PDF).
- The harness reads 16-bit WAV only. Which formats the browser can decode depends on the browser.

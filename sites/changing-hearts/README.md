# Changing Hearts website

A static, multi-page site built from the v3 prototype (`changing_hearts_experience_v3.html`).
It has no framework and no build step to deploy: upload this folder to any static host.

Designed by EJ Success & Faithful · SuccessFlix Design Council. Their doctrine, the materials used here and
the scorecard for this pass are in [`DESIGN.md`](DESIGN.md).

## Pages
| File | Page |
|---|---|
| `index.html` | Home: cinematic intro, hero, programs, stories, partner banner, approach, calls to action |
| `programs.html` | Reading Room, Welcome Moment, Story Corner in detail; how a program starts; FAQ |
| `stories.html` | Changing Hearts Stories (magazine and film series), story nomination form, newsletter |
| `legacy.html` | Preserve a Story: family keepsake packages, FAQ, request form |
| `partners.html` | Sponsorship levels, who partners, partner inquiry form |
| `approach.html` | How we work, impact numbers, dignity and consent promises |
| `contact.html` | Contact form with "I am…" chips (`?interest=community / sponsor / volunteer / legacy` prefills it) |
| `privacy.html`, `404.html` | Privacy note and not-found page |

## Before going live: edit `assets/config.js`
1. **Forms.** Set `formEndpoint` to a form service URL. With [Formspree](https://formspree.io), create a
   form and paste its `https://formspree.io/f/...` URL. Every form (contact, partner, legacy, nomination,
   newsletter) then delivers to your inbox, tagged with a `form` field. Alternatively, set only
   `contactEmail`, and forms open the visitor's email app with the message pre-addressed to you.
   **With neither set, forms show "Our message inbox is being set up"** and send nothing.
2. **Payments (optional).** Paste Stripe Payment Links into `payments`. A "Pay now" button appears
   only for the packages you fill in.
3. **Impact numbers.** Fill `impact` with real numbers. Each one stays hidden until it is set.
   Never publish estimates.
4. **Social links.** Links show only once a URL is filled in.
5. **Prices.** Package and sponsorship prices are written in `legacy.html` and `partners.html`.
   They are suggested starting prices, so confirm them before launch.

## Media (photographs and the home film)
Pages expect these files in `assets/media/`: `hero`, `reading`, `welcome`, `story`, `film`, `care`
(each as `NAME.webp` and `NAME-sm.webp`) plus `hero-loop.mp4` / `hero-loop.webm`. **Until they exist, every
frame shows its warm color art and an emblem instead, so nothing looks broken.**

Build them with one command (needs `ffmpeg` and internet access to figma.com):

```bash
bash tools/make-media.sh          # downloads the six council stills, builds webp + the 12s film loop
bash tools/make-media.sh --local  # builds from your own photos in media-src/ (hero.png, reading.png, ...)
```

The six stills were generated with AI (Figma) for this redesign. They show no faces and no real residents.
Their download links expire **2026-10-16**. Swap in real, consented photographs from your sessions whenever
you have them (same file names in `media-src/`, then `--local`). Real photos will do more for trust than
anything else on the site.

## Editing shared parts
The head, header and footer live in `partials/`. After changing one, run `node build.mjs` to copy it
into every page. It also marks the current page in the menu.

## Deploying
- **Netlify / Cloudflare Pages:** drag this folder in, or point the project at `sites/changing-hearts`.
- **Vercel:** new project from this repo with **Root Directory** `sites/changing-hearts` and framework "Other".
- After you have a domain, change `og:image` in `partials/head.html` to the full URL
  (e.g. `https://yourdomain.com/assets/img/og-card.jpg`) and rebuild, so link previews show the logo.

## Notes
- The original v3 page was ~5 MB because the logo was embedded four times. The logo is now served
  as compressed WebP files (11–145 KB).
- Motion respects "reduce motion" settings; the intro plays once per visit and can be skipped.

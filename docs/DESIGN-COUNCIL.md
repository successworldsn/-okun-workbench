# The Design Council on God's Eye

The God's Eye desks go through the same two fictional creative directors as
SuccessFlix (`successflix/DESIGN.md`):

> **Faithful:** "Does the human want to enter?"
> **EJ Success:** "Is the structure worthy of what they entered?"

The rules applied here:
- **HQ is chrome.** Precision tools wear the chrome material.
- **Money is a monument.** Each desk opens on one sentence that says what needs
  you, then four monument numbers.
- **The abnormal is the brightest thing on screen.** Attention required gets
  the lit alarm material; nothing else is red.
- **Gold is jewelry.** It's used for the primary pill and the selected card,
  never as a gold sheet.
- **Real media first, credited.** The Capital Desk shows real satellite
  photos of each power node ("Imagery © Esri, Maxar, Earthstar Geographics")
  and the real transmission grid.
- **EJ rejects:**
  - glowing AI effects, so the scan line, radar sweep and neon glows are gone
  - spinning dashboards
  - animation everywhere. Motion now appears only on touch: the light that
    travels across the pill.

Where it lives:
- `src/app/globals.css` and `tools/godseye-preview/preview.css`, under
  "The Design Council". These hold the `.council` type voice (Big Shoulders
  Display, Instrument Sans, Chakra Petch), the materials (`mat-obsidian`,
  `mat-chrome`, `mat-gold`, `mat-alarm`), `.lit` stage lighting (key light
  top-left, cool rim, violet floor glow), `.monument` numerals, the `.pill`
  action and the film grain.
- Visual instruments in `src/components/capital/viz.tsx`.

## Scorecard

Each screen is scored on twelve points out of 10. Six belong to Faithful
(experience) and six to EJ Success (architecture). The Design Score is the
sum × 100 ÷ 120.

| Screen | Emotion | Discovery | Clarity | Story | Delight | Mobile | Proportion | Hierarchy | Material | Depth | Consistency | Permanence | Design Score | Primary deficiency |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Capital Desk, before | 3 | 4 | 4 | 3 | 2 | 4 | 4 | 3 | 2 | 3 | 5 | 5 | **35** | media: text walls, no pictures |
| Capital Desk, after | 7 | 7 | 7 | 6 | 6 | 5 | 7 | 8 | 7 | 7 | 7 | 7 | **68** | mobile: the three-column desk stacks but stays dense |
| Deal Desk Today, before | 3 | 4 | 5 | 3 | 2 | 4 | 4 | 3 | 2 | 3 | 5 | 5 | **36** | hierarchy: everything the same weight |
| Deal Desk Today, after | 6 | 6 | 7 | 5 | 5 | 5 | 7 | 8 | 7 | 6 | 7 | 7 | **63** | media: no property photos yet |

## Next on the list

1. **Deal Desk media.** Add an aerial photo of each top lead, pulled by the
   Atlanta feed on GitHub's runners. Store it in the private bucket next to
   the feed, because addresses tie to owners.
2. **Dossier and queue on both desks.** Give them the same pass, with picture
   tiles in the queue and monuments for value, equity and ARV.
3. **Mobile.** Make one column the default under 640px, with the sentence
   and monuments first.

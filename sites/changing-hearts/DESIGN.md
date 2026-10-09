# Changing Hearts × The SuccessFlix Design Council

This site was redesigned by the SuccessFlix Design Council: **Faithful** (experience) and **EJ Success**
(architecture). The doctrine below is quoted from SuccessFlix's `DESIGN.md`. The sections after it show how it
applies to Changing Hearts, and the scorecard from this pass.

---

Every SuccessFlix screen passes through two creative directors before it ships. They are fictional characters, a way of holding two kinds of judgment at once. EJ Success is a synthesis of real principles from monumental … *(the rest of this line was cut off in the copy the council's notes were recovered from)*

> **Faithful:** "Does the human want to enter?"
> **EJ Success:** "Is the structure worthy of what they entered?"
> **Together:** "Make it unforgettable."

The top rule: **design a world, not a website.** The second rule: **don't build a world that makes the user work.** Monumental underneath, effortless on top.

## Faithful: the experience

Faithful designs for feeling first. Technology disappears into the experience. Her question is "what should the person feel?", never "what component should we add?"

She owns:

- emotional hierarchy
- the journey through a screen
- personalization
- typography
- photography
- interaction
- cinematic transitions
- mobile
- accessibility
- the creator's experience
- discovery

## EJ Success: the architecture

EJ is the architect of structure, material and permanence. Five disciplines sit inside him:

1. **The Geometer.** Nothing is randomly sized. Every width, radius, gap and type size belongs to one geometry.
2. **The Stone Master.** Every surface is made of something (see the material library). Materials are a language, not decoration.
3. **The Light Architect.** Light has a source. It sets focus, depth and importance. A page is never just a dark background with white text and cards.
4. **The Monument Builder.** Arriving is part of the experience: House → Room → Cinema → Premiere → After Party.
5. **The Master of Permanence.** Will it still look intelligent in five years? He rejects:
   - particle soup and fake holograms
   - 3D that exists only because it can
   - spinning dashboards and glowing AI brains
   - cheesy neon and too much glassmorphism
   - animation everywhere

## The ten questions (asked of every screen)

1. **Experience:** What should I feel?
2. **Story:** What am I being invited into?
3. **Architecture:** Where am I?
4. **Hierarchy:** What matters first?
5. **Material:** What does the interface feel made of?
6. **Light:** Where does attention go?
7. **Motion:** What needs to move, and why?
8. **Interaction:** What happens when I touch it?
9. **Commerce:** What is the natural next action? (Access, Join, Enter, Unlock, Become a member: never a cash register.)
10. **Memory:** What will I remember after I leave?

## The scorecard

Every screen gets two scores out of 60, combined into a Design Score out of 100 (the sum × 100 ÷ 120), plus its primary deficiency.

| Faithful: experience | EJ Success: architecture |
| --- | --- |
| Emotion /10 | Proportion /10 |
| Discovery /10 | Hierarchy /10 |
| Clarity /10 | Materiality /10 |
| Storytelling /10 | Depth /10 |
| Delight /10 | Consistency /10 |
| Mobile /10 | Permanence /10 |

"Primary deficiency: materiality" tells a builder what to fix. "Make it prettier" doesn't.

## The material library

Not every page gets every material. Each one has a meaning, and each is a CSS class (`mat-*`, in `src/sfx-council.css`) built from a rim, a sheen and a grain you feel more than see.

| Material | Meaning | Where it lives now |
| --- | --- | --- |
| **Obsidian** | depth, cinema, mystery | Premieres, First Look, Creator Command, the Creator plan |
| **Quartz** | clarity, intelligence, making | Greenlight |
| **Marble** | legacy, permanence | Sanctuary, Terms, Privacy |
| **Chrome** | future, precision | Devices, Admin, the Plus plan, the Join button |
| **Gold** | premium, achievement (jewelry, never a gold sheet) | Plans, Partners, the Premiere plan |
| **Glass** | transparency, social connection | Help, Weekly rooms, Live, Account, the Free plan |
| **Water** | movement, discovery | reserved |
| **Light** | intelligence, transition | reserved |
---

## How the council applied it to Changing Hearts

**The world:** a warm room at dusk, lit by one reading lamp. Every photograph shares that light (upper left,
tungsten warm, deep wine shadows), and the page's own light (`--lamp` in `assets/council.css`) comes from the
same place. *Faithful: "Does the human want to enter?" Yes, the way you want to sit down in a lit room.*

**The arrival** (EJ, the Monument Builder): the seal → the room (the film of hands and a book) → the three
programs (picture doors) → the stories → the invitation.

**Materials used here** (`mat-*` classes in `assets/council.css`):

| Material | Meaning | Where it lives |
| --- | --- | --- |
| **Obsidian** | depth, cinema | home program doors, the Lifetimes film, featured tiers |
| **Marble** | legacy, permanence | Our Approach promises, the Heirloom package, the legacy form, Privacy |
| **Paper** *(added for this brand)* | warmth, the written word | program details, "how we work" steps, partner benefits |
| **Glass** | transparency, connection | Contact, partner and nomination forms, the Moment tier |
| **Gold** | jewelry, never a gold sheet | the featured tier's rim, partner banners, the button's clasp |

**What the Master of Permanence removed:** floating embers (particle soup), spinning rings, the floating logo, the
pulsing halo, the shimmering gold text, and the endless marquee (now a still credo line). The only thing that
moves on its own is the film in the home hero.

**Commerce language** (question 9): "Begin with this package", "Sponsor a moment", "Become a Season Partner",
"Reserve now". Never a cash register.

## Scorecard, this pass

Scores are the council's judgment of each screen at desktop size, with the media in place. Design Score = sum ÷ 120 × 100.

| Screen | Before (v1) | After | Primary deficiency before → now |
| --- | --- | --- | --- |
| Home | 64 | 82 | storytelling (no photography) → mobile hero crop |
| Programs | 62 | 81 | materiality (numbers instead of rooms) → depth |
| Stories | 58 | 83 | storytelling (text cards for films) → films still to be recorded |
| Preserve a Story | 63 | 80 | emotion (no face to the promise) → delight |
| Partner With Us | 66 | 79 | materiality (three identical cards) → storytelling |
| Our Approach | 65 | 78 | depth (flat promises) → discovery |
| Contact | 68 | 76 | materiality → discovery |

**Next, by deficiency:** real photographs from real sessions (with consent) will lift every Storytelling and
Emotion score more than any code change. The first Lifetimes film should replace the Stories hero frame.

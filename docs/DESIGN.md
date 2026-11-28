# Custom Cars design system

**Who it's for:** UK drivers modifying their first or second car (a Golf GTI, a used BMW 440i, a Fiesta).
**What it does:** gets them from "my car" to a build that's fitted in 3D and priced.
**Brief (Ryan, advisor-notes/idea-redesign-premium.md):** dark, premium, like a car-maker's site, with silver buttons and no clutter.

## Colour
| Name | Value | Use |
|---|---|---|
| Tarmac | `#0f1114` | Page background |
| Gunmetal | `#181b1f` | Raised panels: the 3D view, option panels, menus |
| Kerb | `#2b2f35` | Hairlines and dividers |
| Headlamp | `#eef0f2` | Main text |
| Fog | `#9aa1aa` | Secondary text |
| Brushed silver | `#e6e8eb` to `#a9adb3` | Buttons and the active tab only |

Plate yellow (`#f7c600`) stays where it already means something: the UK number-plate input and the new-feature dot.

## Type
One family: **Archivo**, using its width axis.
- **Wide (wdth 118–125, weight 700–800):** page headlines and the logo, set like the badging on a boot lid. This is the site's voice.
- **Normal width (wdth 100, weight 400–600):** everything else.
- Prices and numbers use tabular figures in Archivo, not a monospace font.
- Labels are sentence case at normal letter-spacing (no spaced-out capitals).

Scale (1.25 ratio): 13 · 14 · 16 · 20 · 25 · 31 · 39, plus the hero at clamp(44px, 7.4vw, 104px).

## Layout
Left-aligned, like a car-maker's site. Headlines sit on the left; supporting text sits to the right of them or underneath.

```
Home
+------------------------------------------------------+
| nav                                                  |
| BUILD YOUR          (full-bleed photo; car in the    |
| PERFECT CAR.         lower right, never covered)     |
| one line of text                                     |
| [Build yours] [Explore builds]                       |
+------------------------------------------------------+
| 1 Pick a car  | 2 Say what you want | 3 See it in 3D | <- one row on a hairline, no boxes
| Try saying: (chips)                                  |
| Popular builds                         See all builds|
| [photo] [photo] [photo]                              | <- photo tiles, text on the page
+------------------------------------------------------+

Models
| Pick a build to start from          short intro text |
| (filter tabs)                                        |
| [photo]   [photo]   [photo]   [photo]                |
| Name      Name ...                                   |
| car, price                                           |
| tags                                                 |
| [Build this]                                         |
```

## Principles
1. **The car is the hero.** Photos and the 3D view get the space; the interface stays quiet around them.
2. **The one bold move is the wide headline type.** Nothing else competes: no gradients on text, no glows, no animated entrances.
3. **Structure carries meaning.** Boxes are only for things you work inside (the 3D view, option panels, menus). Lists of builds are photo tiles on the page, not boxed cards.
4. **Silver means "press this."** It appears only on main buttons and the selected tab.
5. **Plain words.** Buttons say what happens ("Build this", "Next: Your build"), with no arrows or symbols.

## Checked against the usual generated looks
- **Near-black with one accent:** the brief asks for dark with silver, so we follow it. The accent is a metal finish, not a bright colour, and it's only used for things you press.
- **The same rounded card everywhere:** removed. Build lists are photo tiles. The "How it works" steps are a numbered row, which is fine because they really are a sequence.
- **Spaced-out capital labels and monospace labels:** changed to sentence-case Archivo.
- **One word of a headline in another colour, and → on buttons:** removed.

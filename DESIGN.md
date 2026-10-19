---
name: Cap Drafter
description: Live auction prices for Yahoo fantasy basketball salary cap drafts, read off an arena scoreboard.
colors:
  seam: "#000000"
  page: "#121212"
  deep: "#0b0b0b"
  panel: "#1a1a1a"
  panel-2: "#1c1c1c"
  board: "#161616"
  row-alt: "#1a1a1a"
  hover: "#232323"
  line: "#2a2a2a"
  edge: "#3a3a3a"
  ink: "#e8e4d8"
  ink-2: "#a39e92"
  ink-3: "#8a857a"
  amber: "#f2a51a"
  amber-hi: "#ffc04d"
  on-amber: "#121212"
  home: "#241a08"
  home-hot: "#2a1c04"
  home-ink: "#e0c48c"
  coral: "#ff6b6b"
  up: "#8fb0ff"
  drafted: "#8a857a"
  good-1: "#17294a"
  on-good-1: "#c9dbff"
  good-2: "#1d3a66"
  on-good-2: "#d6e4ff"
  good-3: "#2f5fb3"
  on-good-3: "#ffffff"
  bad-1: "#3d1a1d"
  on-bad-1: "#ffcfca"
  bad-2: "#5a1d22"
  on-bad-2: "#ffd7d3"
  bad-3: "#a3202b"
  on-bad-3: "#ffffff"
  bar-pos: "#4a7fd6"
  bar-neg: "#d0434f"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(72px, 7vw, 104px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Barlow Semi Condensed, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(36px, 3.6vw, 56px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  title:
    fontFamily: "Barlow Semi Condensed, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(28px, 2.8vw, 40px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  price:
    fontFamily: "Barlow Semi Condensed, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  section:
    fontFamily: "Barlow Semi Condensed, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    letterSpacing: "0.16em"
  body:
    fontFamily: "Barlow Semi Condensed, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  label:
    fontFamily: "Barlow Semi Condensed, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.16em"
  control:
    fontFamily: "Barlow Semi Condensed, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.08em"
  hint:
    fontFamily: "Barlow Semi Condensed, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  none: "0px"
spacing:
  seam: "2px"
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "16px"
  gutter: "24px"
  gutter-mobile: "16px"
  control: "44px"
  row: "38px"
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.amber-hi}"
    textColor: "{colors.on-amber}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  button-quiet-hover:
    backgroundColor: "{colors.hover}"
  input-field:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "44px"
  scoreboard-tick:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    padding: "14px 20px 12px"
  scoreboard-tick-home:
    backgroundColor: "{colors.home}"
    textColor: "{colors.amber}"
    typography: "{typography.headline}"
    padding: "14px 20px 12px"
  bid-bay:
    backgroundColor: "{colors.home-hot}"
    textColor: "{colors.amber}"
    typography: "{typography.display}"
    padding: "18px 24px"
  board-row:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "38px"
  board-row-alt:
    backgroundColor: "{colors.row-alt}"
  board-row-picked:
    backgroundColor: "{colors.home-hot}"
    textColor: "{colors.amber}"
  cat-cell-help-3:
    backgroundColor: "{colors.good-3}"
    textColor: "{colors.on-good-3}"
  cat-cell-hurt-3:
    backgroundColor: "{colors.bad-3}"
    textColor: "{colors.on-bad-3}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.control}"
    height: "48px"
  tab-selected:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.home-ink}"
    padding: "0 5px"
---

# Design System: Cap Drafter

## Overview

**Creative North Star: "The Arena Scoreboard"**

The board is the scoreboard over the court: a matte black fascia, panels butted together and split by hard 2px black seams, and figures lit in amber where money is at stake. The room's money left, spots left and inflation are the score and the clock; the player on the block and his Bid to are the shot clock everyone looks at. Everything is built to be glanced at under a 30-second bid timer, beside the Yahoo draft room at half a laptop screen, so the system is dense, calm and numeric, never playful or gamified.

Legibility outranks theatre. The scoreboard is evoked by material (black fascia, seams, amber lamp colour, square heavy-edged controls) and by one motion, never by imitation hardware type: every figure is set in one crisp condensed sans with tabular digits and no glow, because these numbers are re-read after every pick. Pixel art exists in exactly two places, the two marks. The world rejects the category default of white panels, zebra tables in pastel and pill badges.

**Key Characteristics:**
- Matte black fascia (#121212) with flat near-black panels, separated only by 2px black seams.
- Amber is money and the primary action; nothing else glows warm.
- One face, Barlow Semi Condensed, bold, tabular, unglowing, for every figure.
- Square corners everywhere (0px), 2px control borders, 44px controls.
- Category cells: blue helps, red hurts, three steps each, always printing the number.
- One signature motion: a hard-edged amber band relights changed figures after a sale or undo.

## Colors

A near-monochrome black fascia carrying one warm lamp colour for money, a home-team amber tint for "mine", and a strictly fenced blue/red pair for category strength.

### Primary
- **Lamp Amber** (amber): live money and the primary action. League money left, my budget, my max bid, Bid to (column, bay and cell), sold prices in the strip, my roster prices, the Log pick and Import buttons, links, checkbox/radio accent, caret and text selection.
- **Lamp Amber Hot** (amber-hi): hover state of amber links and primary buttons only.
- **Scoreboard Black on Amber** (on-amber): text on amber fills.

### Secondary
- **Home Bay Umber** (home): background of the home-team bay (My budget, My max bid) and of a selected league option.
- **Shot Clock Umber** (home-hot): the Bid to bay and the row of the player on the block; a touch warmer than the home bay so the bid reads as the hottest panel.
- **Home Bay Parchment** (home-ink): labels and notes inside the home bay, small tags, Yahoo warnings.

### Tertiary
- **Refusal Coral** (coral): over-max bids, refused or invalid picks and failed actions (error status lines). Chosen over horn red #c8102e, which measures about 3.2:1 on the fascia and fails small text.
- **Signal Blue** (up): the live-sync status lamp.
- **Category Help Blues** (good-1 / good-2 / good-3, with on-good-1..3): category z-scores of +0.25, +0.75 and +1.5 and above.
- **Category Hurt Reds** (bad-1 / bad-2 / bad-3, with on-bad-1..3): category z-scores of −0.25, −0.75 and −1.5 and below.
- **Strength Bar Blue / Red** (bar-pos / bar-neg): the diverging category bars in My team.

### Neutral
- **Seam Black** (seam): the 2px seams between every panel; drawn as the background showing through 2px gaps.
- **Fascia Black** (page): the page.
- **Deep Fascia** (deep): masthead, footer, tab rail, sold strip, sync bar and every input well.
- **Panel Black** (panel / panel-2): scoreboard ticks, setup, side panel, the block.
- **Board Black** (board / row-alt): the player table, with a barely visible alternate row.
- **Hover Black** (hover): hover fill for rows, quiet buttons, tabs and the setup bar.
- **Rule Grey** (line): inner rules, table header underline, column separators.
- **Edge Grey** (edge): 2px borders on inputs and quiet buttons.
- **Off-white Ink** (ink): primary text and the focus outline.
- **Label Ink** (ink-2): labels, notes, secondary figures (pre-draft value).
- **Faint Ink** (ink-3 / drafted): hints, ranks, placeholder, drafted players.

### Named Rules
**The Money Is Amber Rule.** Amber marks money that is live and the one primary action on a panel. Labels, headings and decoration never take it.

**The Coral Means No Rule.** Coral appears only when the tool is refusing something: an over-max bid, a refused pick, a failed action. It never marks a price change, a category or a heading.

**The Uncoloured Inflation Rule.** Inflation is always printed in ink. Its sign (+/−) and its note carry the direction; it is never green, red or amber.

**The Number Always Prints Rule.** A category cell always prints its z-score. Blue helps and red hurts in three steps, but colour is never the only signal.

## Typography

**Display Font:** Barlow Semi Condensed (self-hosted woff2, latin + latin-ext, weights 400, 500, 600, 700), falling back to system-ui
**Body Font:** Barlow Semi Condensed
**Label/Mono Font:** none; labels are the same face, uppercase and tracked

**Character:** One condensed grotesque does everything, like the house font of a modern arena board: tall, narrow, firm at 700, quiet at 400. Tabular digits are on globally so columns of money align.

### Hierarchy
- **Display** (700, clamp(72px, 7vw, 104px), 0.95; 56px under 720px): the Bid to figure only, the largest thing on the page.
- **Headline** (700, clamp(36px, 3.6vw, 56px), 1; 26px under 720px): scoreboard figures (money left, spots left, inflation, my budget, my max bid).
- **Title** (700, clamp(28px, 2.8vw, 40px), 1.05): the name of the player on the block.
- **Price** (700, 30px, 1): pre-draft and live prices in the block.
- **Section** (700, 14px, 0.16em, uppercase): section headings such as Player board, the setup bar and panel headings (12px, 0.14em).
- **Body** (400, 15px, 1.4): table text and prose; Bid to cells step up to 17px 700, notes run 13–14px, capped at 70–110ch.
- **Label** (600, 12px, 0.16em, uppercase): the label naming each scoreboard figure and price, and table column heads (0.1em).
- **Control** (600–700, 13px, 0.08–0.1em, uppercase): buttons and tabs; Log pick at 16px.
- **Hint** (400, 12px): helper text beside form labels.

### Named Rules
**The Readable Figure Rule.** Every figure, scoreboard included, is Barlow Semi Condensed, bold, tabular, with no glow, text-shadow or bloom. No segment, dot-matrix or pixel digits anywhere: these numbers are read after every pick.

**The Label Names The Figure Rule.** Uppercase tracked labels exist only to name the figure or control directly beneath or beside them. They are never decorative eyebrows or kickers above a heading.

## Layout

A full-bleed stack of bands, each a row of panels butted together with 2px seam gaps (gap: 2px on a seam-black parent), with no outer margins: masthead, one-line setup, scoreboard, the block, sold strip, then board and side panel. Inner gutters are 24px (16px under 720px); panels pad 14–20px. Controls and touch targets are 44px; table rows are 38px (46px on phone).

- **Scoreboard:** three room ticks then a two-tick home bay, wrapping on flex-basis 180px; under 720px it becomes a three-column grid with the home bay spanning the full row and tick notes hidden.
- **The block:** player (3 parts), prices (1), Bid to bay (1), Log form (2), wrapping. From 721 to 1180px the Log form collapses to one row so the board keeps the screen.
- **Board and side:** the board takes all spare width (min 640px) beside a 320px side panel; below that they stack. The table scrolls inside its own frame with a sticky header and a sticky player column.
- **Breakpoints:** 720px (phone) and 1180px (half laptop, beside the Yahoo room). The "room-wide" extras appear only above 1180px.

## Elevation & Depth

Flat. There are no drop shadows. Depth is tonal and structural: the deep fascia (#0b0b0b) recesses wells and rails, panels sit one step lighter, and 2px black seams cut every panel from its neighbour. Inset box-shadows are used only as lines (the 2px header underline, 2px column separators, the 3px selected-tab underline), never as lift. The only overlay is the league-picker dialog, a 2px-edged panel over a 60% black backdrop.

### Named Rules
**The Seam Not Shadow Rule.** Panels are separated by a 2px black seam showing through, never by a shadow, a card border or a gap of page colour.

## Shapes

Every corner is square (0px): inputs, buttons, tabs, cells, dialog, tags. Controls carry heavy 2px borders like the scorer's table; small secondary controls (roster undo, "more" in the sold strip, tags) drop to 1px. The only geometry beyond rectangles is the drawn carets (two 2px borders rotated) and the pixel-grid marks.

### The Marks
- **Cap Drafter ball** (top left): a 13×13 amber pixel basketball, crisp-edged SVG, 26px (22px on phone), beside the uppercase CAP DRAFTER wordmark (700, 18px, 0.14em).
- **gurn3k wordmark** (top right, and small in the footer signature): links to https://www.gurn3k.com. A pixelated amber "gurn" and a smooth off-white "3k". This is a deliberate reversal of the two-tone used on the user's other builds; do not "correct" it.

**The Two Marks Rule.** Pixel art is reserved for the two marks. No pixel type, pixel icons or pixel borders appear anywhere else.

## Components

### Buttons
Square, heavy-edged, uppercase and tracked.
- **Shape:** square (0px), 2px border, 44px minimum height, 0 16px padding.
- **Primary:** amber fill and border, scoreboard-black text, 700 at 0.1em. One per panel: Log pick (48px, 16px type, full width), Import from Yahoo, Import league.
- **Hover / Focus:** primary brightens to amber-hi; quiet buttons take the hover fill and a #555 border. Focus is a 2px off-white outline offset 2px.
- **Quiet:** transparent with the 2px edge-grey border and ink text (Yahoo defaults, Disconnect, Cancel).

### Chips
- **Tag:** 11px uppercase 600, home-ink text, 1px current-colour border, square, 0 5px; used for Rookie, No 2025-26 stats and short-games players.

### Cards / Containers
- **Corner Style:** square (0px).
- **Background:** panel or panel-2 on a seam-black parent; the home bay and Bid to bay take the umber tints.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** none; the 2px seam is the border.
- **Internal Padding:** 14–20px on ticks and side panels, 18px 24px in the block.

### Inputs / Fields
- **Style:** deep-fascia well, 2px edge-grey border, square, 44px high, 10px side padding; money inputs carry a faint "$" prefix inside the same well.
- **Focus:** the border turns off-white; no glow.
- **Error / Disabled:** errors are reported in the coral status line beneath the form, not by recolouring the field.

### Navigation
- **Tabs (side panel):** a deep rail of equal tabs, 48px, uppercase control type in label ink. Selected tab lifts to the panel colour with off-white text and a 3px off-white inset underline. Hover takes the hover fill.

### Scoreboard Tick
A label, a headline figure, and a one-line note, stacked in a panel. Room ticks print figures in ink, except league money left in amber; the home bay prints its figures in amber on umber with parchment labels.

### Jersey Plate
A square deep-fascia plate (104px, 72px on phones) with a 2px edge-grey border, at the left of the block. It shows the team code over the jersey number in display amber (52px, 700), with the position underneath, both labels 11px uppercase in label ink. Empty, it shows a dim "#". It stands in for a headshot: licensed player photos aren't available, and the plate fits the scoreboard better.

### Bid To Bay
The hottest panel on the page: shot-clock umber, an amber BID TO label, the display-size amber figure, and a parchment note explaining the cap. Empty, the figure dims to parchment at 50%.

### Player Board
Dense table on board black with a barely-there alternate row, right-aligned tabular figures, a sticky header with uppercase 12px heads (the Bid to head in amber), and 2px rule-grey column separators between groups. The player on the block gets the umber row and an amber name; drafted rows go faint with a struck-through name. Category cells fill with the help/hurt steps and always print the value.

### Relight (signature motion)
After a sale or undo re-prices the room, every figure that changed relights once: a hard-edged amber band (amber at 40%, hard stops, about 16% of the width) sweeps left to right across the figure in 380ms, cubic-bezier(0.33, 1, 0.68, 1). It applies to scoreboard figures, Live and Bid to cells. Under prefers-reduced-motion there is no sweep (and the sync lamp stops pulsing); the new figure simply appears.

**The One Sweep Rule.** Relight is the system's only expressive motion. It runs once per change, never loops, never glows. Other motion is limited to the 160ms setup caret turn and the slow 1.6s pulse of the live-sync lamp.

## Do's and Don'ts

### Do:
- **Do** split every panel from its neighbours with a 2px seam-black gap and keep all corners square (0px).
- **Do** set every figure in Barlow Semi Condensed 700 with tabular digits, and size the Bid to figure larger than anything else on the page.
- **Do** keep amber for live money and one primary action per panel.
- **Do** print the number in every category cell, using the three blue help steps and three red hurt steps.
- **Do** reserve coral for over-max bids, refused picks and failed actions.
- **Do** relight changed figures with the 380ms left-to-right amber band after a sale or undo, and drop it entirely under prefers-reduced-motion.
- **Do** keep 44px controls and 2px control borders, and the 2px off-white focus outline.

### Don't:
- **Don't** use segment, dot-matrix or pixel digits, or any glow, bloom or text-shadow on figures.
- **Don't** add pixel art beyond the Cap Drafter ball and the gurn3k wordmark, and don't swap the wordmark's amber pixel "gurn" / smooth off-white "3k" split.
- **Don't** colour inflation; let its sign and note carry the direction.
- **Don't** use horn red (#c8102e) for text or small marks; it fails contrast on the fascia.
- **Don't** put eyebrow or kicker labels above headings.
- **Don't** put coloured accent stripes on tiles or panels.
- **Don't** use rounded corners, pill badges, drop shadows, white panels or pastel zebra tables.

# Soccer Coacher

A touch-friendly chalkboard for showing U12 players where to line up. Drag colored
dots around a soccer field, save each shape by name, then tap between shapes so the
players *slide* from one position to the next — the movement is the teaching tool.

Built as three static files with no framework, no build step and no backend. Everything
you create is stored in the browser's `localStorage` on that one device.

## Running it

Open `index.html` in a browser. That's it.

To use it on a tablet, put the three files on any static host — GitHub Pages, Netlify
drop, S3, a folder on your own machine. For local testing over the network:

```sh
cd soccer-coacher
python3 -m http.server 8000
# then browse to http://<your-computer-ip>:8000 from the tablet
```

Designed for a **tablet held in landscape**. Add it to your home screen (Safari →
Share → Add to Home Screen) to get it full screen without browser chrome.

## Using it

Tap the **gear** in the top-right corner for everything.

**Add Player** drops a new dot on the field. New dots are spread out in a grid so
they never land on top of each other.

**Tap a dot** (a tap, not a drag) to open its editor: give it a label like `GK`, `LB`
or `CM`, pick a color, or remove it. **Drag a dot** to move it. Same for the ball.

**Add Ball / Remove Ball** puts a ball on the field. If a ball is present it gets
saved along with the positions.

**Field View** — `Defense`, `Full Field` and `Attack` jump between framings, and the
zoom slider fine-tunes it. Zooming in makes the lines and players bigger, which costs
you some of the sidelines (see *A note on zoom* below).

**Save Current Positions…** asks for a name and adds a button along the bottom of the
screen. Make a `Default`, then a `Corner`, then an `Attack Right`. Saving a name that
already exists offers to replace it.

Tap any button at the bottom to move the team into that shape. On a laptop, keys
`1`–`9` trigger the first nine.

Under **Saved Positions** in the settings drawer each saved shape can be reordered
(`↑` `↓`), overwritten with whatever is currently on the field (`Update`), renamed, or
deleted. **Animation speed** controls how long the slide takes — slower is usually
better for kids.

## How players are matched between positions

This is the part that makes the animation useful. When you switch to a saved position,
each player in the target is matched against a player on the field:

- **By label first.** A dot labeled `LB` in *Default* and a dot labeled `LB` in
  *Corner* are treated as the same kid, so that dot slides from one spot to the other.
  Matching ignores case and surrounding spaces.
- **By internal id** for dots you never bothered to label.

Matched players slide. Players only in the new position fade in where they belong.
Players only in the old position fade out. Same rules for the ball.

So label your dots — that's what lets a player follow the shape across every saved
position instead of one dot vanishing and another appearing.

## A note on zoom

A soccer field is about 105m × 68m, so its shape is much wider than it is tall. A
tablet screen in landscape is wider still. That means when you zoom in to fill the
screen with just your defensive end, there is no way to keep both sidelines on
screen — the crop has to come off the top and bottom.

The presets pick a balance that keeps your goal, penalty area and the halfway line
visible, and the zoom slider lets you decide how much sideline you're willing to lose.
If you'd rather see the full width of a single half, a future version could rotate the
field to vertical (goal at the bottom, like a tactics board), which fits a half-field
on a landscape screen without cropping the width.

## Data & privacy

Nothing leaves the device. There is no account, no server and no analytics. **Reset
Everything** under *Display* wipes the saved data for good.

Because it's per-device `localStorage`, saved positions do not sync between your phone
and your tablet, and clearing your browser's site data will delete them.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Markup for the field container, gear button, settings drawer, player editor and modal |
| `styles.css` | All styling, including the transition rules that animate between positions |
| `app.js` | Field geometry and SVG drawing, state + `localStorage`, dragging, and formation reconciliation |

Field coordinates are stored in metres (`0–105` by `0–68`) rather than pixels, so saved
positions stay correct across screen sizes, orientations and zoom levels.

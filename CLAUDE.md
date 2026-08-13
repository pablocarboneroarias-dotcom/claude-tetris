# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A playable Tetris clone in vanilla JavaScript, HTML5 Canvas, and CSS — no dependencies, no build step, no `package.json`. The entire game logic lives in `game.js` (~300 lines).

## Running the game

There is no build/lint/test tooling. To run:

```bash
open index.html        # macOS — just opens the file
```

or serve it locally (needed if you hit CORS/file:// issues):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

There are no automated tests. Verify changes by opening the game in a browser and playing it (movement, rotation, line clears, scoring, pause, game over/restart).

## Architecture

Three files, each with a single responsibility:

- `index.html` — DOM structure: the `#board` canvas (300×600, i.e. `COLS×BLOCK` by `ROWS×BLOCK`), the `#next-canvas` preview (120×120), the score/lines/level panel, and the pause/game-over `#overlay`.
- `style.css` — dark/retro arcade visual theme only.
- `game.js` — all game logic, structured around global state and a `requestAnimationFrame` loop. No modules/classes; everything is top-level functions operating on shared mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.).

### Core model

- **Board**: a `ROWS × COLS` matrix (`createBoard`) where each cell is `0` (empty) or a color index `1–7` identifying which piece type locked there.
- **Pieces**: defined in `PIECES` as square matrices; `randomPiece()` picks one of the 7 standard tetrominoes. Rotation (`rotateCW`) is a transpose + reverse, no per-piece rotation tables.
- **Collision** (`collide`): checks a shape against board bounds and already-locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until one doesn't collide, otherwise the rotation is discarded.
- **Locking** (`lockPiece` → `merge` + `clearLines` + `spawn`): merges the current piece into the board, clears full rows (shifting rows down, unshifting empty rows at top), then spawns the next piece.
- **Ghost piece** (`ghostY`): projects the current piece straight down to where it would land; drawn at `globalAlpha = 0.2` in `draw()`.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level` on line clears; hard drop adds 2 points/row dropped, soft drop adds 1 point/row.
- **Leveling**: `level` increases every 10 lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms controls fall speed.

### Game loop

`init()` sets up state and kicks off `requestAnimationFrame(loop)`. `loop(ts)` accumulates delta time; once it exceeds `dropInterval` the piece drops one row (or locks if it can't). Every frame calls `draw()` (grid + board + ghost + current piece). Input is handled via a single `keydown` listener (arrow keys, `X` to rotate, `Space` for hard drop, `P` to pause). `spawn()` promotes `next` to `current` and generates a new `next`; if the new piece immediately collides, `endGame()` fires and shows the Game Over overlay.

### Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS×BLOCK` by `ROWS×BLOCK`).

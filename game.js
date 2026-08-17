'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca
];

// HOLE: colisiona como una celda normal, pero nunca se dibuja ni se fija en el tablero.
const HOLE = -1;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,HOLE,8],[8,8,8]],               // N - tuerca
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');
const skinSelect = document.getElementById('skin-select');

const THEME_STORAGE_KEY = 'tetris-theme';
const GRID_COLORS = { dark: '#22222e', light: '#d6d6e4' };

const SKIN_STORAGE_KEY = 'tetris-skin';

const SKIN_PALETTES = {
  retro: COLORS,
  neon: [
    null,
    '#00faff', // I
    '#faff00', // O
    '#ff00ff', // T
    '#39ff14', // S
    '#ff073a', // Z
    '#0080ff', // J
    '#ff8c00', // L
    '#e0e0e0', // N
  ],
  pastel: [
    null,
    '#b3e5e8', // I
    '#fff3c4', // O
    '#dcc6e0', // T
    '#c8e6c9', // S
    '#f5c6c6', // Z
    '#c9e0f7', // J
    '#ffd9b3', // L
    '#d8dce0', // N
  ],
  pixel: COLORS,
};

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let currentTheme = 'dark';
let currentSkin = 'retro';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c] === 0) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c] > 0)
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function roundedRectPath(context, x, y, w, h, radius) {
  if (context.roundRect) {
    context.beginPath();
    context.roundRect(x, y, w, h, radius);
    return;
  }
  const r = Math.min(radius, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawNeonBlock(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(px, py, size, 4);
}

function drawPastelBlock(context, px, py, size, color) {
  roundedRectPath(context, px, py, size, size, 6);
  context.fillStyle = color;
  context.fill();
  context.save();
  roundedRectPath(context, px, py, size, size, 6);
  context.clip();
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px, py, size, 4);
  context.restore();
}

function drawPixelTexture(context, px, py, size) {
  const half = size / 2;
  context.fillStyle = 'rgba(0,0,0,0.15)';
  context.fillRect(px, py, half, half);
  context.fillRect(px + half, py + half, size - half, size - half);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + half, py, size - half, half);
  context.fillRect(px, py + half, half, size - half);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (colorIndex <= 0) return;
  const palette = SKIN_PALETTES[currentSkin] || COLORS;
  const color = palette[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;

  context.globalAlpha = alpha ?? 1;

  if (currentSkin === 'neon') {
    drawNeonBlock(context, px, py, s, color);
  } else if (currentSkin === 'pastel') {
    drawPastelBlock(context, px, py, s, color);
  } else {
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    // highlight
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px, py, s, 4);
    if (currentSkin === 'pixel') {
      drawPixelTexture(context, px, py, s);
    }
  }

  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = currentSkin === 'neon' ? '#2c2c40' : GRID_COLORS[currentTheme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function applyTheme(theme) {
  currentTheme = theme;
  document.body.classList.toggle('light-theme', theme === 'light');
  themeSwitch.checked = theme === 'light';
  themeSwitch.setAttribute('aria-checked', String(theme === 'light'));
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  if (current) draw();
  if (next) drawNext();
}

function applySkin(skin) {
  currentSkin = SKIN_PALETTES[skin] ? skin : 'retro';
  skinSelect.value = currentSkin;
  document.body.classList.toggle('skin-neon', currentSkin === 'neon');
  localStorage.setItem(SKIN_STORAGE_KEY, currentSkin);
  if (current) draw();
  if (next) drawNext();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

const FORM_TAGS = ['SELECT', 'INPUT', 'TEXTAREA', 'BUTTON'];

document.addEventListener('keydown', e => {
  if (FORM_TAGS.includes(e.target.tagName)) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeSwitch.addEventListener('change', () => {
  applyTheme(themeSwitch.checked ? 'light' : 'dark');
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
});

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
applySkin(localStorage.getItem(SKIN_STORAGE_KEY) || 'retro');
init();

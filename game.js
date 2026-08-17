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
const highscoreListEl = document.getElementById('highscore-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const nameSubmitBtn = document.getElementById('name-submit-btn');
const overlayRecords = document.getElementById('overlay-records');
const overlayHighscoreList = document.getElementById('overlay-highscore-list');

const THEME_STORAGE_KEY = 'tetris-theme';
const HIGHSCORES_STORAGE_KEY = 'tetris-highscores';
const BEST_COMBO_STORAGE_KEY = 'tetris-best-combo';
const MAX_LINES_STORAGE_KEY = 'tetris-max-lines';
const MAX_HIGHSCORES = 5;
const GRID_COLORS = { dark: '#22222e', light: '#d6d6e4' };

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo;
let currentTheme = 'dark';

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
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (colorIndex <= 0) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLORS[currentTheme];
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

function loadHighScores() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIGHSCORES_STORAGE_KEY));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && typeof e.name === 'string' && typeof e.score === 'number');
  } catch {
    return [];
  }
}

function saveHighScores(list) {
  localStorage.setItem(HIGHSCORES_STORAGE_KEY, JSON.stringify(list));
}

function qualifiesForHighScore(list, candidateScore) {
  return list.length < MAX_HIGHSCORES || candidateScore > list[list.length - 1].score;
}

function renderRecords(highlightIndex, list) {
  list = list || loadHighScores();
  const bestCombo = parseInt(localStorage.getItem(BEST_COMBO_STORAGE_KEY), 10) || 0;
  const maxLinesEver = parseInt(localStorage.getItem(MAX_LINES_STORAGE_KEY), 10) || 0;

  const renderInto = el => {
    el.innerHTML = '';
    list.forEach((entry, i) => {
      const li = document.createElement('li');
      li.textContent = `${i + 1}. ${entry.name} — ${entry.score.toLocaleString()}`;
      if (i === highlightIndex) li.classList.add('highlight');
      el.appendChild(li);
    });
  };
  renderInto(highscoreListEl);
  renderInto(overlayHighscoreList);

  bestComboEl.textContent = bestCombo;
  maxLinesEl.textContent = maxLinesEver;
}

function showNameEntry() {
  overlayRecords.classList.add('hidden');
  nameEntry.classList.remove('hidden');
  restartBtn.disabled = true;
  nameInput.value = '';
  nameInput.focus();
}

function submitHighScore() {
  const name = (nameInput.value.trim() || 'AAA').slice(0, 10);
  const list = loadHighScores();
  const entry = { name, score, lines, level };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, MAX_HIGHSCORES);
  saveHighScores(list);

  nameEntry.classList.add('hidden');
  overlayRecords.classList.remove('hidden');
  restartBtn.disabled = false;
  renderRecords(list.indexOf(entry), list);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');

  const storedMaxLines = parseInt(localStorage.getItem(MAX_LINES_STORAGE_KEY), 10) || 0;
  if (lines > storedMaxLines) localStorage.setItem(MAX_LINES_STORAGE_KEY, String(lines));

  const storedBestCombo = parseInt(localStorage.getItem(BEST_COMBO_STORAGE_KEY), 10) || 0;
  if (maxCombo > storedBestCombo) localStorage.setItem(BEST_COMBO_STORAGE_KEY, String(maxCombo));

  const highScores = loadHighScores();
  renderRecords(-1, highScores);

  if (qualifiesForHighScore(highScores, score)) {
    showNameEntry();
  } else {
    overlayRecords.classList.remove('hidden');
  }
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
  combo = 0;
  maxCombo = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  overlayRecords.classList.add('hidden');
  restartBtn.disabled = false;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (document.activeElement === nameInput) return;
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

nameSubmitBtn.addEventListener('click', submitHighScore);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') submitHighScore();
});

let resetConfirmTimeout = null;
resetRecordsBtn.addEventListener('click', () => {
  if (resetRecordsBtn.dataset.confirming === 'true') {
    localStorage.removeItem(HIGHSCORES_STORAGE_KEY);
    localStorage.removeItem(BEST_COMBO_STORAGE_KEY);
    localStorage.removeItem(MAX_LINES_STORAGE_KEY);
    resetRecordsBtn.textContent = 'Reiniciar récords';
    resetRecordsBtn.dataset.confirming = 'false';
    clearTimeout(resetConfirmTimeout);
    renderRecords(-1);
  } else {
    resetRecordsBtn.textContent = '¿Seguro? Confirmar';
    resetRecordsBtn.dataset.confirming = 'true';
    resetConfirmTimeout = setTimeout(() => {
      resetRecordsBtn.textContent = 'Reiniciar récords';
      resetRecordsBtn.dataset.confirming = 'false';
    }, 3000);
  }
});

renderRecords(-1);
applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
init();

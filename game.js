'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

function drawRoundedRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Skins registry: each skin owns its own 1-based color table (null padding at
// index 0, then I/O/T/S/Z/J/L/+ at 1..8) plus its own block-paint function.
// `paint` receives the already-resolved CSS color for the cell, never the
// raw index, and must save/restore any canvas state it mutates.
const SKINS = {
  retro: {
    label: 'Retro',
    boardBg: null, // falls through to the CSS --panel-bg
    gridColor: null, // falls through to the theme's --grid-color
    colors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#b39ddb', // J - light purple
      '#ffb74d', // L - orange
      '#4dd0e1', // + - cyan
    ],
    paint(context, x, y, color, size, alpha) {
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.restore();
    },
  },
  neon: {
    label: 'Neón',
    boardBg: '#000000',
    // Default gridColor (from --grid-color) is nearly invisible on a pure
    // black board, so this skin overrides it with a faint white grid.
    gridColor: 'rgba(255,255,255,0.08)',
    colors: [
      null,
      '#00fff2', // I
      '#faff00', // O
      '#ff00e6', // T
      '#39ff14', // S
      '#ff3131', // Z
      '#bd00ff', // J
      '#ff8c00', // L
      '#00fff2', // +
    ],
    paint(context, x, y, color, size, alpha) {
      context.save();
      context.globalAlpha = alpha;
      // Kept modest (rather than a larger radius) since this runs for every
      // occupied cell, every frame, including a filled board late-game.
      context.shadowBlur = size * 0.35;
      context.shadowColor = color;
      context.fillStyle = color;
      context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      context.restore();
    },
  },
  pastel: {
    label: 'Pastel',
    boardBg: null,
    colors: [
      null,
      '#a8dfe6', // I
      '#fff3b0', // O
      '#d8b4e2', // T
      '#b5e8b5', // S
      '#f4b8b8', // Z
      '#c9c2f0', // J
      '#ffcf9e', // L
      '#a8dfe6', // +
    ],
    paint(context, x, y, color, size, alpha) {
      context.save();
      context.globalAlpha = alpha;
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      const r = Math.max(2, s * 0.22);
      drawRoundedRect(context, px, py, s, s, r);
      context.fillStyle = color;
      context.fill();
      drawRoundedRect(context, px, py, s, Math.max(r, s * 0.4), r);
      context.fillStyle = 'rgba(255,255,255,0.28)';
      context.fill();
      context.restore();
    },
  },
  pixel: {
    label: 'Pixel art',
    boardBg: null,
    colors: [
      null,
      '#00e5ff', // I
      '#ffee58', // O
      '#ab47bc', // T
      '#66bb6a', // S
      '#ef5350', // Z
      '#7e57c2', // J
      '#ffa726', // L
      '#00e5ff', // +
    ],
    paint(context, x, y, color, size, alpha) {
      context.save();
      context.globalAlpha = alpha;
      const px = x * size;
      const py = y * size;
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // dithered texture: alternating darker squares over a small grid
      const cell = Math.max(2, Math.floor(size / 4));
      context.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < size; i += cell * 2) {
        for (let j = 0; j < size; j += cell * 2) {
          context.fillRect(px + i, py + j, cell, cell);
          context.fillRect(px + i + cell, py + j + cell, cell, cell);
        }
      }
      context.strokeStyle = 'rgba(0,0,0,0.45)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      context.restore();
    },
  },
};

// Guard the color-index contract: every skin's colors array must line up
// 1:1 with PIECES (null padding at 0, then one entry per piece type) or a
// future piece added/reordered in PIECES could silently desync a skin.
for (const [name, skin] of Object.entries(SKINS)) {
  if (skin.colors.length !== 9) {
    console.error(`Skin "${name}" has ${skin.colors.length} colors, expected 9 (null + I/O/T/S/Z/J/L/+).`);
  }
}

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // +
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
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;
// currentSkin is a user preference, not per-game state: it is set once at
// startup (and on skin-select change), never reset by init().
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
      if (!shape[r][c]) continue;
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
      if (current.shape[r][c])
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin];
  const color = skin.colors[colorIndex];
  skin.paint(context, x, y, color, size, alpha ?? 1);
}

function drawGrid() {
  ctx.strokeStyle = SKINS[currentSkin].gridColor || gridColor;
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
  const boardBg = SKINS[currentSkin].boardBg;
  if (boardBg) {
    ctx.fillStyle = boardBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
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
  const boardBg = SKINS[currentSkin].boardBg;
  if (boardBg) {
    nextCtx.fillStyle = boardBg;
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggleBtn.textContent = theme === 'light' ? '🌙 Oscuro' : '☀️ Claro';
  localStorage.setItem(THEME_KEY, theme);
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
}

function toggleTheme() {
  applyTheme(document.body.classList.contains('light') ? 'dark' : 'light');
}

function populateSkinOptions() {
  if (!skinSelect) return;
  for (const [key, skin] of Object.entries(SKINS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = skin.label;
    skinSelect.appendChild(opt);
  }
}

function applySkin(skin) {
  currentSkin = SKINS[skin] ? skin : 'retro';
  localStorage.setItem(SKIN_KEY, currentSkin);
  if (skinSelect) skinSelect.value = currentSkin;
  // Apply without reload: the running loop's draw() picks up the new skin
  // on its own, but drawNext() only runs inside spawn(), and nothing redraws
  // while paused/game-over (the frame is cancelled, not gated) — so refresh
  // both explicitly. Guard against calling before the first game exists.
  if (next) drawNext();
  if (current) draw();
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

document.addEventListener('keydown', e => {
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
themeToggleBtn.addEventListener('click', toggleTheme);
if (skinSelect) skinSelect.addEventListener('change', e => applySkin(e.target.value));

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
populateSkinOptions();
applySkin(localStorage.getItem(SKIN_KEY) || 'retro');
init();

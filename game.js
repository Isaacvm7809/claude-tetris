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
  '#b39ddb', // J - light purple
  '#ffb74d', // L - orange
  '#4dd0e1', // + - cyan
];

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

const nameEntry = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayRecordsPanel = document.getElementById('overlay-records-panel');
const overlayRecordsList = document.getElementById('overlay-records-list');
const overlayBestCombo = document.getElementById('overlay-best-combo');
const overlayMaxLines = document.getElementById('overlay-max-lines');

const startOverlay = document.getElementById('start-overlay');
const playBtn = document.getElementById('play-btn');
const startRecordsList = document.getElementById('start-records-list');
const startBestCombo = document.getElementById('start-best-combo');
const startMaxLines = document.getElementById('start-max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const THEME_KEY = 'tetris-theme';
const RECORDS_KEY = 'tetris-records';
const STATS_KEY = 'tetris-stats';
const LAST_NAME_KEY = 'tetris-last-name';
const MAX_RECORDS = 5;
const MAX_NAME_LEN = 12;
const DEFAULT_NAME = 'Anónimo';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;
// Per-game combo counter and the id of a record just added by the current
// game (used to highlight it in the table). Both are reset in init().
let combo, lastRecordId;

// Persistent, cross-game data. Loaded once at startup and mutated in place
// as records/stats are earned; not part of init()'s per-game reset.
let records = loadRecords();
let stats = loadStats();

function lsGetJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function lsSetJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // localStorage unavailable or full — value just won't persist.
  }
}

function loadRecords() {
  const parsed = lsGetJSON(RECORDS_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(r => r && typeof r.score === 'number' && typeof r.name === 'string')
    .map(r => ({
      name: r.name,
      score: r.score,
      lines: typeof r.lines === 'number' ? r.lines : 0,
      level: typeof r.level === 'number' ? r.level : 1,
      id: typeof r.id === 'number' ? r.id : Math.random(),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
}

function saveRecords(list) {
  lsSetJSON(RECORDS_KEY, list);
}

function loadStats() {
  const parsed = lsGetJSON(STATS_KEY, null);
  return {
    bestCombo: Number(parsed && parsed.bestCombo) || 0,
    maxLines: Number(parsed && parsed.maxLines) || 0,
  };
}

function saveStats(s) {
  lsSetJSON(STATS_KEY, s);
}

function loadLastName() {
  const name = lsGetJSON(LAST_NAME_KEY, '');
  return typeof name === 'string' ? name : '';
}

function saveLastName(name) {
  lsSetJSON(LAST_NAME_KEY, name);
}

function qualifiesForTop(s) {
  if (records.length < MAX_RECORDS) return true;
  return s > records[records.length - 1].score;
}

function addRecord(name, s, lns, lvl) {
  const entry = { name, score: s, lines: lns, level: lvl, id: Date.now() + Math.random() };
  records.push(entry);
  records.sort((a, b) => b.score - a.score);
  records = records.slice(0, MAX_RECORDS);
  saveRecords(records);
  return entry.id;
}

function renderRecordsList(listEl) {
  listEl.innerHTML = '';
  if (!records.length) {
    const li = document.createElement('li');
    li.className = 'record-empty';
    li.textContent = 'Sin récords todavía';
    listEl.appendChild(li);
    return;
  }
  records.forEach(rec => {
    const li = document.createElement('li');
    li.className = 'record-item' + (rec.id === lastRecordId ? ' highlight' : '');

    const row = document.createElement('div');
    row.className = 'record-row';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'record-name';
    nameSpan.textContent = rec.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'record-score';
    scoreSpan.textContent = rec.score.toLocaleString();
    row.appendChild(nameSpan);
    row.appendChild(scoreSpan);

    const meta = document.createElement('span');
    meta.className = 'record-meta';
    meta.textContent = `Nv. ${rec.level} · ${rec.lines} líneas`;

    li.appendChild(row);
    li.appendChild(meta);
    listEl.appendChild(li);
  });
}

function refreshRecordsUI() {
  renderRecordsList(startRecordsList);
  renderRecordsList(overlayRecordsList);
  startBestCombo.textContent = stats.bestCombo;
  startMaxLines.textContent = stats.maxLines;
  overlayBestCombo.textContent = stats.bestCombo;
  overlayMaxLines.textContent = stats.maxLines;
}

function showNameEntryIfQualifies() {
  if (qualifiesForTop(score)) {
    nameEntry.classList.remove('hidden');
    playerNameInput.value = loadLastName();
    playerNameInput.focus();
  } else {
    nameEntry.classList.add('hidden');
  }
}

function saveScoreName() {
  let name = playerNameInput.value.trim().slice(0, MAX_NAME_LEN);
  if (!name) name = DEFAULT_NAME;
  saveLastName(name);
  lastRecordId = addRecord(name, score, lines, level);
  nameEntry.classList.add('hidden');
  refreshRecordsUI();
}

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
    combo++;
    let statsChanged = false;
    if (combo > stats.bestCombo) {
      stats.bestCombo = combo;
      statsChanged = true;
    }
    if (cleared > stats.maxLines) {
      stats.maxLines = cleared;
      statsChanged = true;
    }
    if (statsChanged) saveStats(stats);
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
  if (!colorIndex) return;
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
  ctx.strokeStyle = gridColor;
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  lastRecordId = null;
  overlayRecordsPanel.classList.remove('hidden');
  showNameEntryIfQualifies();
  refreshRecordsUI();
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
    nameEntry.classList.add('hidden');
    overlayRecordsPanel.classList.add('hidden');
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
  combo = 0;
  lastRecordId = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  overlayRecordsPanel.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!current) return; // start screen: no game running yet
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

restartBtn.addEventListener('click', () => {
  if (!nameEntry.classList.contains('hidden')) {
    const discard = confirm('Tu puntuación todavía no se ha guardado en los récords. ¿Reiniciar de todas formas?');
    if (!discard) return;
  }
  init();
});
themeToggleBtn.addEventListener('click', toggleTheme);

playBtn.addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  init();
});

saveScoreBtn.addEventListener('click', saveScoreName);
playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveScoreName();
});

resetRecordsBtn.addEventListener('click', () => {
  const confirmed = confirm('¿Seguro que deseas borrar todos los récords y estadísticas guardadas? Esta acción no se puede deshacer.');
  if (!confirmed) return;
  records = [];
  stats = { bestCombo: 0, maxLines: 0 };
  saveRecords(records);
  saveStats(stats);
  lastRecordId = null;
  refreshRecordsUI();
});

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
refreshRecordsUI();

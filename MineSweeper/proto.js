(function () {
  const LEVELS = {
    easy:   { rows: 9,  cols: 9,  mines: 10 },
    medium: { rows: 12, cols: 12, mines: 25 },
    hard:   { rows: 16, cols: 16, mines: 51 },
  };

  const ABILITIES = {
    horizontal: { icon: '↔️', label: 'Sapu Horizontal', drop: 0.045, max: 2 },
    vertical:   { icon: '↕️', label: 'Sapu Vertikal',    drop: 0.045, max: 2 },
    cross:      { icon: '✛',  label: 'Sapu Silang',      drop: 0.02,  max: 1 },
    bomb:       { icon: '💣', label: 'Bom Area',          drop: 0.035, max: 2 },
  };
  // Total peluang dapat ability per klik (bukan per petak) ≈ 14.5%.
  // Ability menjinakkan ranjau di area sapuannya (ranjau hilang, angka
  // sekitar dihitung ulang) lalu membuka petak di area itu — aman dipakai.

  const boardEl = document.getElementById('board');
  const mineCountEl = document.getElementById('mineCount');
  const timerEl = document.getElementById('timer');
  const restartBtn = document.getElementById('restartBtn');
  const statusLine = document.getElementById('statusLine');
  const toastEl = document.getElementById('toast');
  const diffButtons = document.querySelectorAll('.diff-btn');
  const abilityBarEl = document.getElementById('abilityBar');

  let level = LEVELS.easy;
  let grid = [];          // {mine, revealed, flagged, count}
  let firstClick = true;
  let gameOver = false;
  let flagsUsed = 0;
  let revealedCount = 0;
  let remainingMines = 0;
  let timerInterval = null;
  let seconds = 0;
  let inventory = {};     // { horizontal: 2, vertical: 0, ... }
  let armedAbility = null;
  let toastTimeout = null;

  function pad(n) { return String(n).padStart(3, '0'); }

  function updateHud() {
    mineCountEl.textContent = pad(Math.max(0, remainingMines - flagsUsed));
    timerEl.textContent = pad(Math.min(999, seconds));
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      seconds++;
      updateHud();
    }, 1000);
  }
  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function setStatus(text, cls) {
    statusLine.textContent = text;
    statusLine.className = 'status-line' + (cls ? ' ' + cls : '');
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  function inBounds(r, c) {
    return r >= 0 && r < level.rows && c >= 0 && c < level.cols;
  }

  function neighbors(r, c) {
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        if (inBounds(r + dr, c + dc)) list.push([r + dr, c + dc]);
      }
    }
    return list;
  }

  function buildGrid() {
    grid = [];
    for (let r = 0; r < level.rows; r++) {
      const row = [];
      for (let c = 0; c < level.cols; c++) {
        row.push({ mine: false, revealed: false, flagged: false, count: 0 });
      }
      grid.push(row);
    }
  }

  function placeMines(excludeR, excludeC) {
    const excluded = new Set(neighbors(excludeR, excludeC).map(([r, c]) => r + ',' + c));
    excluded.add(excludeR + ',' + excludeC);

    let placed = 0;
    while (placed < level.mines) {
      const r = Math.floor(Math.random() * level.rows);
      const c = Math.floor(Math.random() * level.cols);
      const key = r + ',' + c;
      if (grid[r][c].mine || excluded.has(key)) continue;
      grid[r][c].mine = true;
      placed++;
    }
    remainingMines = level.mines;

    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        if (grid[r][c].mine) continue;
        let count = 0;
        for (const [nr, nc] of neighbors(r, c)) {
          if (grid[nr][nc].mine) count++;
        }
        grid[r][c].count = count;
      }
    }
  }

  function renderInventory() {
    abilityBarEl.innerHTML = '';
    Object.keys(ABILITIES).forEach(key => {
      const ab = ABILITIES[key];
      const count = inventory[key] || 0;
      const btn = document.createElement('button');
      btn.className = 'ability-btn';
      if (count === 0) btn.classList.add('empty');
      if (armedAbility === key) btn.classList.add('armed');
      btn.disabled = count === 0 || gameOver;
      btn.title = ab.label;
      btn.innerHTML = `<span class="ability-icon">${ab.icon}</span><span class="ability-count">${count}</span>`;
      btn.addEventListener('click', () => onAbilityClick(key));
      abilityBarEl.appendChild(btn);
    });
  }

  function onAbilityClick(key) {
    if (gameOver) return;
    if (!inventory[key]) return;
    if (firstClick) {
      setStatus('Buka satu petak dulu sebelum pakai ability.', '');
      return;
    }
    armedAbility = armedAbility === key ? null : key;
    renderInventory();
    if (armedAbility) {
      setStatus(`${ABILITIES[armedAbility].icon} ${ABILITIES[armedAbility].label} siap — klik kotak target di papan.`, '');
    } else {
      setStatus('\u00A0');
    }
  }

  function maybeDropAbility() {
    const roll = Math.random();
    let cumulative = 0;
    for (const key of Object.keys(ABILITIES)) {
      cumulative += ABILITIES[key].drop;
      if (roll < cumulative) {
        const cap = ABILITIES[key].max;
        const current = inventory[key] || 0;
        if (current >= cap) return; // sudah penuh, tidak dapat tambahan
        inventory[key] = current + 1;
        showToast(`🎁 Dapat ability: ${ABILITIES[key].icon} ${ABILITIES[key].label}!`);
        renderInventory();
        return;
      }
    }
  }

  function render() {
    boardEl.style.gridTemplateColumns = `repeat(${level.cols}, 1fr)`;
    boardEl.innerHTML = '';
    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        const cellData = grid[r][c];
        const div = document.createElement('div');
        div.className = 'cell';
        div.dataset.r = r;
        div.dataset.c = c;

        if (cellData.revealed) {
          div.classList.add('revealed');
          if (cellData.mine) {
            div.classList.add('mine');
            div.textContent = '●';
          } else if (cellData.count > 0) {
            div.classList.add('n' + cellData.count);
            div.textContent = cellData.count;
          }
        } else if (cellData.flagged) {
          div.classList.add('flagged');
          div.textContent = '⚑';
        }

        if (armedAbility) div.classList.add('targetable');

        div.addEventListener('click', onLeftClick);
        div.addEventListener('contextmenu', onRightClick);
        boardEl.appendChild(div);
      }
    }
  }

  function revealCell(r, c) {
    const cellData = grid[r][c];
    if (cellData.revealed || cellData.flagged) return;
    cellData.revealed = true;
    revealedCount++;

    if (cellData.count === 0 && !cellData.mine) {
      for (const [nr, nc] of neighbors(r, c)) {
        if (!grid[nr][nc].revealed) revealCell(nr, nc);
      }
    }
  }

  function defuseMineAt(r, c) {
    if (!grid[r][c].mine) return;
    grid[r][c].mine = false;
    remainingMines--;
    grid[r][c].count = neighbors(r, c).filter(([nr, nc]) => grid[nr][nc].mine).length;
    for (const [nr, nc] of neighbors(r, c)) {
      if (!grid[nr][nc].mine) {
        grid[nr][nc].count = Math.max(0, grid[nr][nc].count - 1);
      }
    }
    if (grid[r][c].flagged) {
      grid[r][c].flagged = false;
      flagsUsed--;
    }
  }

  function getAreaCells(key, r, c) {
    const cells = [];
    if (key === 'horizontal' || key === 'cross') {
      for (let cc = 0; cc < level.cols; cc++) cells.push([r, cc]);
    }
    if (key === 'vertical' || key === 'cross') {
      for (let rr = 0; rr < level.rows; rr++) cells.push([rr, c]);
    }
    if (key === 'bomb') {
      cells.push([r, c]);
      for (const n of neighbors(r, c)) cells.push(n);
    }
    const seen = new Set();
    return cells.filter(([rr, cc]) => {
      const k = rr + ',' + cc;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function applyAbility(key, r, c) {
    const cells = getAreaCells(key, r, c).filter(([rr, cc]) => {
      const cellData = grid[rr][cc];
      return !cellData.revealed && !cellData.flagged;
    });

    inventory[key]--;
    armedAbility = null;

    // Ability menjinakkan ranjau di area itu (aman), lalu membuka petaknya.
    for (const [rr, cc] of cells) {
      if (grid[rr][cc].mine) defuseMineAt(rr, cc);
      revealCell(rr, cc);
    }

    updateHud();
    render();
    renderInventory();

    if (checkWin()) {
      endGame(true);
    } else {
      setStatus('\u00A0');
    }
  }

  function revealAllMines(hitR, hitC) {
    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        if (grid[r][c].mine) grid[r][c].revealed = true;
      }
    }
    render();
    const hitEl = boardEl.querySelector(`[data-r="${hitR}"][data-c="${hitC}"]`);
    if (hitEl) hitEl.classList.add('mine-hit');
  }

  function checkWin() {
    const totalSafe = level.rows * level.cols - remainingMines;
    return revealedCount >= totalSafe;
  }

  function endGame(won, hitR, hitC) {
    gameOver = true;
    stopTimer();
    armedAbility = null;
    renderInventory();
    if (won) {
      restartBtn.textContent = '😎';
      setStatus('Selesai! Semua petak aman sudah terbuka.', 'win');
    } else {
      restartBtn.textContent = '💥';
      revealAllMines(hitR, hitC);
      setStatus('Kena ranjau. Coba lagi?', 'lose');
    }
  }

  function onLeftClick(e) {
    if (gameOver) return;
    const r = Number(e.currentTarget.dataset.r);
    const c = Number(e.currentTarget.dataset.c);

    if (armedAbility) {
      applyAbility(armedAbility, r, c);
      return;
    }

    const cellData = grid[r][c];
    if (cellData.flagged || cellData.revealed) return;

    if (firstClick) {
      placeMines(r, c);
      firstClick = false;
      startTimer();
    }

    if (cellData.mine) {
      cellData.revealed = true;
      render();
      endGame(false, r, c);
      return;
    }

    revealCell(r, c);
    maybeDropAbility(); // satu roll per klik, bukan per petak yang terbuka
    render();
    renderInventory();

    if (checkWin()) {
      endGame(true);
    }
  }

  function onRightClick(e) {
    e.preventDefault();
    if (gameOver) return;
    const r = Number(e.currentTarget.dataset.r);
    const c = Number(e.currentTarget.dataset.c);
    const cellData = grid[r][c];
    if (cellData.revealed) return;

    if (cellData.flagged) {
      cellData.flagged = false;
      flagsUsed--;
    } else {
      if (flagsUsed >= remainingMines) return;
      cellData.flagged = true;
      flagsUsed++;
    }
    updateHud();
    render();
  }

  function newGame() {
    stopTimer();
    seconds = 0;
    flagsUsed = 0;
    revealedCount = 0;
    remainingMines = level.mines;
    firstClick = true;
    gameOver = false;
    armedAbility = null;
    inventory = {};
    restartBtn.textContent = '🙂';
    setStatus('\u00A0');
    buildGrid();
    updateHud();
    render();
    renderInventory();
  }

  restartBtn.addEventListener('click', newGame);

  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      diffButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      level = LEVELS[btn.dataset.level];
      newGame();
    });
  });

  newGame();
})();

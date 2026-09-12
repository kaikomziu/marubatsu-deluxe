// ○×DELUXE メインゲームロジック
const idx = aiIdx;

const MODE_LABELS = { normal: "ノーマル", misere: "ミゼール", gravity: "重力", wild: "ワイルド", randomblock: "ランダムブロック", timeattack: "タイムアタック", stack: "重ね取り" };
const DIFF_LABELS = { easy: "弱い", normal: "普通", hard: "強い", extreme: "激強" };
const SIZE_LABELS = { 1: "小", 2: "中", 3: "大" };
const SIZE_SCALE = { 1: 0.55, 2: 0.78, 3: 1 };

const G = {
  size: 3, winLength: 3, mode: "normal", opponent: "cpu", difficulty: "easy",
  board: [], players: [], turnIndex: 0, startingIndex: 0, gameOver: false,
  moveCount: 0, scores: { p1: 0, p2: 0, draw: 0 }, symbolOf: {}, wildSymbolChoice: "X",
  timeAttack: { timer: null }, timeAttackTimeoutHappened: false, lastConfig: null,
  stacks: [], supply: {}, selectedSize: 1, stackCaptureHappened: false,
  myIndex: 0, online: null
};

function otherIndex(i) { return i === 0 ? 1 : 0; }
function isBoardFull(board) { return board.every(v => v !== null); }
function landingRowForCol(board, size, col) {
  for (let r = size - 1; r >= 0; r--) if (board[idx(size, r, col)] === null) return r;
  return -1;
}
function currentPlayerIsCPU() { return G.opponent === "cpu" && G.turnIndex === 1; }
function symbolForCurrentTurn() { return G.symbolOf[G.turnIndex]; }

// 盤面の入力をロックすべきか(CPUの番 / オンラインで相手の番)
function turnLocked() {
  if (G.opponent === "cpu") return currentPlayerIsCPU();
  if (G.opponent === "online") return G.turnIndex !== G.myIndex;
  return false;
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function newBoard(size, mode) {
  const board = new Array(size * size).fill(null);
  if (mode === "randomblock") {
    const total = size * size;
    const blockCount = Math.max(1, Math.floor(total * 0.15));
    const indices = [...Array(total).keys()];
    shuffleArr(indices);
    for (let i = 0; i < blockCount; i++) board[indices[i]] = "BLOCK";
  }
  return board;
}

// ---------- 重ね取りモード補助 ----------
function stackPieceCount(size) { return Math.max(2, size - 1); }

function defaultSelectableSize(playerIndex) {
  for (const sz of [1, 2, 3]) if (G.supply[playerIndex][sz] > 0) return sz;
  return 1;
}

function canPlaceStack(r, c, size, playerIndex) {
  if (!G.supply[playerIndex] || G.supply[playerIndex][size] <= 0) return false;
  const st = G.stacks[idx(G.size, r, c)];
  const topSize = st.length ? st[st.length - 1].size : 0;
  return size > topSize;
}

function hasAnyValidStackMove(playerIndex) {
  for (let i = 0; i < G.size * G.size; i++) {
    const st = G.stacks[i];
    const topSize = st.length ? st[st.length - 1].size : 0;
    for (const sz of [1, 2, 3]) {
      if (G.supply[playerIndex][sz] > 0 && sz > topSize) return true;
    }
  }
  return false;
}

// ---------- 実績/タイマー補助 ----------
function isDarkModeOn() { return document.documentElement.getAttribute("data-theme") === "dark"; }

function clearTimeAttackTimer() {
  if (G.timeAttack.timer) { clearTimeout(G.timeAttack.timer); G.timeAttack.timer = null; }
  const wrap = document.getElementById("timeattack-wrap");
  if (wrap) wrap.classList.add("hidden");
}

function startTimeAttackTimer() {
  const wrap = document.getElementById("timeattack-wrap");
  const bar = document.getElementById("timeattack-bar");
  wrap.classList.remove("hidden");
  const limit = G.size === 3 ? 8 : G.size === 4 ? 10 : 12;
  bar.style.transition = "none";
  bar.style.width = "100%";
  void bar.offsetWidth;
  bar.style.transition = `width ${limit}s linear`;
  bar.style.width = "0%";
  G.timeAttack.timer = setTimeout(handleTimeAttackTimeout, limit * 1000);
}

function handleTimeAttackTimeout() {
  if (G.gameOver) return;
  G.timeAttackTimeoutHappened = true;
  const mv = randomValidMove(G.board, G.size, G.mode);
  if (!mv) return;
  const sym = G.mode === "wild" ? (Math.random() < 0.5 ? "X" : "O") : symbolForCurrentTurn();
  showToast("⏰ 時間切れ！ランダム配置されました");
  commitMove(mv.r, mv.c, sym);
}

// ---------- ゲーム進行 ----------
function setupPlayers() {
  G.players = G.opponent === "cpu"
    ? [{ name: "あなた", isCPU: false }, { name: "CPU", isCPU: true }]
    : [{ name: "プレイヤー1", isCPU: false }, { name: "プレイヤー2", isCPU: false }];
}

function startGame(config) {
  G.lastConfig = config;
  G.size = config.size;
  G.winLength = config.size;
  G.mode = config.mode;
  G.opponent = config.opponent;
  G.difficulty = config.difficulty;
  G.scores = { p1: 0, p2: 0, draw: 0 };
  G.startingIndex = 0;
  setupPlayers();
  document.getElementById("mode-badge").textContent =
    `${config.size}並べ・${MODE_LABELS[config.mode]}${G.opponent === "cpu" ? "・CPU(" + DIFF_LABELS[G.difficulty] + ")" : "・2人対戦"}`;
  document.getElementById("btn-restart").classList.remove("hidden");
  document.getElementById("screen-setup").classList.add("hidden");
  document.getElementById("screen-online").classList.add("hidden");
  document.getElementById("screen-game").classList.remove("hidden");
  newRound(true);
}

function newRound(isFirst) {
  clearTimeAttackTimer();
  if (!isFirst) G.startingIndex = otherIndex(G.startingIndex);
  G.board = newBoard(G.size, G.mode);
  G.turnIndex = G.startingIndex;
  G.gameOver = false;
  G.moveCount = 0;
  G.timeAttackTimeoutHappened = false;
  G.symbolOf = {};
  G.symbolOf[G.startingIndex] = "X";
  G.symbolOf[otherIndex(G.startingIndex)] = "O";
  G.wildSymbolChoice = "X";
  G.stackCaptureHappened = false;
  if (G.mode === "stack") {
    G.stacks = Array.from({ length: G.size * G.size }, () => []);
    const count = stackPieceCount(G.size);
    G.supply = { 0: { 1: count, 2: count, 3: count }, 1: { 1: count, 2: count, 3: count } };
    G.selectedSize = defaultSelectableSize(G.turnIndex);
  }
  hideResultPanel();
  renderScoreboard();
  renderBoard([]);
  afterTurnSwitch();
}

function afterTurnSwitch() {
  clearTimeAttackTimer();
  if (G.mode === "stack" && !G.gameOver) G.selectedSize = defaultSelectableSize(G.turnIndex);
  updateTurnIndicator();
  updateWildToggleUI();
  updateStackTrayUI();
  if (G.mode === "stack") renderBoard([]);
  if (!G.gameOver) {
    if (G.mode === "timeattack" && !turnLocked()) startTimeAttackTimer();
    if (G.opponent === "cpu" && currentPlayerIsCPU()) setTimeout(cpuMove, 500);
  }
}

function handleCellClick(r, c) {
  if (G.gameOver) return;
  if (turnLocked()) return;
  if (G.mode === "stack") {
    if (!canPlaceStack(r, c, G.selectedSize, G.turnIndex)) return;
    commitStackMove(r, c, G.selectedSize);
    return;
  }
  let sym = G.mode === "wild" ? G.wildSymbolChoice : symbolForCurrentTurn();
  if (G.mode === "gravity") {
    const land = landingRowForCol(G.board, G.size, c);
    if (land === -1) return;
    r = land;
  } else if (G.board[idx(G.size, r, c)] !== null) {
    return;
  }
  commitMove(r, c, sym);
}

function cpuMove() {
  if (G.gameOver) return;
  if (G.mode === "stack") {
    const ctx = {
      stacks: G.stacks.map(st => st.slice()), size: G.size, winLength: G.winLength,
      supply: { 0: Object.assign({}, G.supply[0]), 1: Object.assign({}, G.supply[1]) },
      aiIndex: 1, humanIndex: 0,
      aiSymbol: symbolForCurrentTurn(), humanSymbol: symbolForCurrentTurn() === "X" ? "O" : "X",
      difficulty: G.difficulty
    };
    const mv = aiChooseStackMove(ctx);
    if (!mv) return;
    commitStackMove(mv.r, mv.c, mv.size);
    return;
  }
  const ctx = {
    board: G.board.slice(), size: G.size, winLength: G.winLength, mode: G.mode, difficulty: G.difficulty,
    aiSymbol: G.mode === "wild" ? null : symbolForCurrentTurn(),
    humanSymbol: G.mode === "wild" ? null : (symbolForCurrentTurn() === "X" ? "O" : "X")
  };
  const mv = aiChooseMove(ctx);
  if (!mv) return;
  commitMove(mv.r, mv.c, mv.sym);
}

function commitStackMove(r, c, size, opts) {
  opts = opts || {};
  clearTimeAttackTimer();
  const mover = G.turnIndex;
  const sym = symbolForCurrentTurn();
  const cellIdx = idx(G.size, r, c);
  if (G.stacks[cellIdx].length > 0) G.stackCaptureHappened = true;
  G.stacks[cellIdx].push({ sym, size });
  G.supply[mover][size]--;
  G.board[cellIdx] = sym;
  G.moveCount++;

  if (G.opponent === "online" && !opts.remote) {
    pushOnlineMove({ mover: mover === 0 ? "p1" : "p2", r, c, size });
  }

  const madeLine = checkWinAt(G.board, G.size, r, c, sym, G.winLength);
  if (madeLine) {
    const cells = getWinningLineCells(G.board, G.size, r, c, sym, G.winLength);
    renderBoard(cells);
    endGame(mover);
    return;
  }

  const nextIndex = otherIndex(mover);
  if (hasAnyValidStackMove(nextIndex)) {
    G.turnIndex = nextIndex;
    renderBoard([]);
    afterTurnSwitch();
  } else if (hasAnyValidStackMove(mover)) {
    showToast(`${G.players[nextIndex].name}は駒を置けないのでターンスキップ！`);
    renderBoard([]);
    afterTurnSwitch();
  } else {
    renderBoard([]);
    endGame(null);
  }
}

function commitMove(r, c, sym, opts) {
  opts = opts || {};
  clearTimeAttackTimer();
  const mover = G.turnIndex;
  G.board[idx(G.size, r, c)] = sym;
  G.moveCount++;

  if (G.opponent === "online" && !opts.remote) {
    pushOnlineMove({ mover: mover === 0 ? "p1" : "p2", r, c, sym });
  }

  const madeLine = checkWinAt(G.board, G.size, r, c, sym, G.winLength);
  let winnerIndex = null, isDraw = false;
  if (madeLine) {
    winnerIndex = G.mode === "misere" ? otherIndex(G.turnIndex) : G.turnIndex;
  } else if (isBoardFull(G.board)) {
    isDraw = true;
  }

  if (winnerIndex !== null) {
    const cells = getWinningLineCells(G.board, G.size, r, c, sym, G.winLength);
    renderBoard(cells);
    endGame(winnerIndex);
  } else if (isDraw) {
    renderBoard([]);
    endGame(null);
  } else {
    G.turnIndex = otherIndex(G.turnIndex);
    renderBoard([]);
    afterTurnSwitch();
  }
}

function getWinningLineCells(board, size, r, c, symbol, winLength) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    let cells = [{ r, c }];
    let rr = r + dr, cc = c + dc;
    while (aiInBounds(size, rr, cc) && board[idx(size, rr, cc)] === symbol) { cells.push({ r: rr, c: cc }); rr += dr; cc += dc; }
    rr = r - dr; cc = c - dc;
    while (aiInBounds(size, rr, cc) && board[idx(size, rr, cc)] === symbol) { cells.unshift({ r: rr, c: cc }); rr -= dr; cc -= dc; }
    if (cells.length >= winLength) return cells;
  }
  return [];
}

function endGame(winnerIndex) {
  clearTimeAttackTimer();
  G.gameOver = true;
  if (winnerIndex === 0) G.scores.p1++;
  else if (winnerIndex === 1) G.scores.p2++;
  else G.scores.draw++;
  renderScoreboard();
  updateTurnIndicator();
  updateWildToggleUI();
  updateStackTrayUI();
  updatePersistentStats(winnerIndex);
  showResultPanel(winnerIndex);
}

function updatePersistentStats(winnerIndex) {
  const stats = loadStats();
  stats.totalGames++;
  const fillRatio = G.board.filter(v => v !== null).length / (G.size * G.size);

  if (G.opponent === "pvp") {
    stats.pvpPlayed = true;
    if (winnerIndex === null) {
      stats.draws++;
      if (G.mode === "randomblock" && fillRatio >= 0.8) stats.boardFullBlockDraw = true;
    }
  } else {
    if (G.opponent === "online") stats.onlinePlayed = true;
    const myIdx = G.opponent === "online" ? G.myIndex : 0;
    if (winnerIndex === null) {
      stats.draws++;
      stats.currentStreak = 0;
      if (G.mode === "randomblock" && fillRatio >= 0.8) stats.boardFullBlockDraw = true;
    } else if (winnerIndex === myIdx) {
      stats.wins++;
      if (G.opponent === "online") stats.onlineWins = (stats.onlineWins || 0) + 1;
      stats.currentStreak++;
      if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
      stats.winsBySize[G.size] = (stats.winsBySize[G.size] || 0) + 1;
      stats.winsByMode[G.mode] = (stats.winsByMode[G.mode] || 0) + 1;
      if (G.opponent === "cpu") stats.winsByDifficulty[G.difficulty] = (stats.winsByDifficulty[G.difficulty] || 0) + 1;
      if (stats.fastestWin[G.size] === null || G.moveCount < stats.fastestWin[G.size]) stats.fastestWin[G.size] = G.moveCount;
    } else {
      stats.losses++;
      stats.currentStreak = 0;
    }
  }
  if (G.timeAttackTimeoutHappened) stats.timeoutExperienced = true;
  if (G.mode === "stack" && G.stackCaptureHappened) stats.stackCaptureUsed = true;
  if (isDarkModeOn()) stats.darkModeToggled = true;

  saveStats(stats);
  const newly = checkAchievements(stats);
  showAchievementToasts(newly);
  renderStatsPreview();
}

// ---------- オンライン対戦 ----------
const ONLINE_POLL_MS = 1600;

function buildOnlineInitPayload(config) {
  const payload = { board: newBoard(config.size, config.mode) };
  if (config.mode === "stack") {
    const count = stackPieceCount(config.size);
    payload.supply = { 0: { 1: count, 2: count, 3: count }, 1: { 1: count, 2: count, 3: count } };
    payload.stacks = Array.from({ length: config.size * config.size }, () => []);
  }
  return payload;
}

function openOnlineScreen(config) {
  G.onlinePendingConfig = config;
  document.getElementById("online-mode-badge").textContent = `${config.size}並べ・${MODE_LABELS[config.mode]}`;
  document.getElementById("online-name-input").value = MB.getName ? MB.getName() : "";
  showOnlineCard("choice");
  document.getElementById("screen-setup").classList.add("hidden");
  document.getElementById("screen-online").classList.remove("hidden");
}

function showOnlineCard(which) {
  document.getElementById("online-choice-card").classList.toggle("hidden", which !== "choice");
  document.getElementById("online-join-card").classList.toggle("hidden", which !== "join");
  document.getElementById("online-waiting-card").classList.toggle("hidden", which !== "waiting");
}

function saveOnlineNameFromInput() {
  const v = document.getElementById("online-name-input").value;
  if (MB.setName) MB.setName(v);
}

async function startOnlineQuickMatch() {
  if (!MB.online) { showToast("🌐 オンライン機能を利用できません"); return; }
  saveOnlineNameFromInput();
  const config = G.onlinePendingConfig;
  document.getElementById("online-waiting-title").textContent = "対戦相手を探しています…";
  document.getElementById("online-room-code-display").textContent = "";
  document.getElementById("online-waiting-hint").textContent = "同じ設定を選んだ人と自動でマッチングします";
  showOnlineCard("waiting");
  try {
    const matchId = await MB.net.matchmake(config.size, config.mode);
    if (!matchId) { showToast("マッチングに失敗しました"); showOnlineCard("choice"); return; }
    beginOnlineSession(matchId);
  } catch (e) {
    showToast("🌐 接続できませんでした");
    showOnlineCard("choice");
  }
}

async function startOnlineCreateRoom() {
  if (!MB.online) { showToast("🌐 オンライン機能を利用できません"); return; }
  saveOnlineNameFromInput();
  const config = G.onlinePendingConfig;
  const code = MB.genRoomCode();
  document.getElementById("online-waiting-title").textContent = "この合言葉を友だちに送ろう";
  document.getElementById("online-room-code-display").textContent = code;
  document.getElementById("online-waiting-hint").textContent = "相手が入ってくると自動で対戦が始まります";
  showOnlineCard("waiting");
  try {
    const matchId = await MB.net.room(code, config.size, config.mode);
    if (!matchId) { showToast("部屋を作れませんでした"); showOnlineCard("choice"); return; }
    beginOnlineSession(matchId);
  } catch (e) {
    showToast("🌐 接続できませんでした");
    showOnlineCard("choice");
  }
}

async function confirmOnlineJoinRoom() {
  if (!MB.online) { showToast("🌐 オンライン機能を利用できません"); return; }
  saveOnlineNameFromInput();
  const code = document.getElementById("online-join-code").value;
  if (!code || code.replace(/[^A-Za-z0-9]/g, "").length < 4) { showToast("合言葉を入力してください"); return; }
  document.getElementById("online-waiting-title").textContent = "参加しています…";
  document.getElementById("online-room-code-display").textContent = "";
  document.getElementById("online-waiting-hint").textContent = "";
  showOnlineCard("waiting");
  try {
    const matchId = await MB.net.room(code, null, null);
    if (!matchId) { showToast("その合言葉の部屋が見つかりません"); showOnlineCard("join"); return; }
    beginOnlineSession(matchId);
  } catch (e) {
    showToast("🌐 接続できませんでした");
    showOnlineCard("join");
  }
}

function beginOnlineSession(matchId) {
  G.online = { matchId, role: null, appliedMoveCount: 0, started: false, followingRematch: false, pollTimer: null };
  startOnlinePoll();
}

function startOnlinePoll() {
  stopOnlinePollTimerOnly();
  onlinePollTick();
  G.online.pollTimer = setInterval(onlinePollTick, ONLINE_POLL_MS);
}

function stopOnlinePollTimerOnly() {
  if (G.online && G.online.pollTimer) { clearInterval(G.online.pollTimer); G.online.pollTimer = null; }
}

function stopOnlinePoll() {
  stopOnlinePollTimerOnly();
  G.online = null;
}

async function onlinePollTick() {
  if (!G.online || !G.online.matchId) return;
  const matchId = G.online.matchId;
  let st;
  try { st = await MB.net.state(matchId); } catch (e) { return; }
  if (!G.online || matchId !== G.online.matchId) return; // 遅れて届いた古い結果や離脱後は無視
  if (!st || st.gone) { handleOnlineGone(); return; }

  if (st.rematch_id && st.rematch_id !== matchId) {
    transitionToNewOnlineMatch(st.rematch_id);
    return;
  }

  G.online.role = st.me;
  G.online.opponentName = st.opp_name || "相手";
  G.myIndex = st.me === "p1" ? 0 : 1;

  if (st.state === "setup") {
    updateOnlineWaitingUI(st);
    if (st.opp_joined && st.me === "p1" && !st.init) {
      MB.net.init(matchId, buildOnlineInitPayload({ size: st.size, mode: st.mode })).catch(() => {});
    }
    // 参加者(p2)側は、部屋を作った相手(p1)が居なくなっていないか確認する。
    // (p1側で呼ぶと「相手がまだ居ない = p2が null」を切断とみなして自分の待機を
    //  即キャンセルしてしまうため、p1 では絶対に呼ばない)
    if (st.me === "p2") MB.net.forfeit(matchId).catch(() => {});
    return;
  }

  if (st.state === "finished") { handleOnlineFinished(st); return; }

  if (st.state === "playing") {
    if (!G.online.started) {
      G.online.started = true;
      enterOnlineGame(st);
    }
    applyIncomingMoves(st.moves);
    updateOnlineStatus(st.opp_online);
    MB.net.forfeit(matchId).catch(() => {});
  }
}

function updateOnlineWaitingUI(st) {
  if (st.opp_joined) {
    document.getElementById("online-waiting-title").textContent = `${st.opp_name || "相手"} が参加しました！準備中…`;
  }
}

function applyOnlineInit(init) {
  G.board = (init && init.board) ? init.board.slice() : newBoard(G.size, G.mode);
  G.turnIndex = 0;
  G.startingIndex = 0;
  G.gameOver = false;
  G.moveCount = 0;
  G.timeAttackTimeoutHappened = false;
  G.stackCaptureHappened = false;
  G.symbolOf = { 0: "X", 1: "O" };
  G.wildSymbolChoice = "X";
  if (G.mode === "stack") {
    G.stacks = (init && init.stacks) ? init.stacks.map(st => st.slice()) : Array.from({ length: G.size * G.size }, () => []);
    const count = stackPieceCount(G.size);
    G.supply = (init && init.supply) ? JSON.parse(JSON.stringify(init.supply)) : { 0: { 1: count, 2: count, 3: count }, 1: { 1: count, 2: count, 3: count } };
    G.selectedSize = defaultSelectableSize(G.turnIndex);
  }
}

function enterOnlineGame(st) {
  G.size = st.size;
  G.winLength = st.size;
  G.mode = st.mode;
  G.opponent = "online";
  G.difficulty = null;
  G.scores = { p1: 0, p2: 0, draw: 0 };
  G.myIndex = st.me === "p1" ? 0 : 1;
  const myName = MB.getName ? MB.getName() : "あなた";
  G.players = st.me === "p1"
    ? [{ name: myName, isCPU: false }, { name: st.opp_name || "相手", isCPU: false }]
    : [{ name: st.opp_name || "相手", isCPU: false }, { name: myName, isCPU: false }];
  G.online.appliedMoveCount = 0;

  applyOnlineInit(st.init);
  document.getElementById("mode-badge").textContent = `${st.size}並べ・${MODE_LABELS[st.mode]}・🌐オンライン`;
  document.getElementById("btn-restart").classList.add("hidden");
  document.getElementById("online-status-row").classList.remove("hidden");
  document.getElementById("screen-online").classList.add("hidden");
  document.getElementById("screen-game").classList.remove("hidden");
  hideResultPanel();
  renderScoreboard();
  renderBoard([]);
  afterTurnSwitch();
}

function updateOnlineStatus(oppOnline) {
  const row = document.getElementById("online-status-row");
  if (G.opponent !== "online") { row.classList.add("hidden"); return; }
  row.classList.remove("hidden");
  const dot = document.getElementById("online-status-dot");
  const text = document.getElementById("online-status-text");
  dot.classList.toggle("offline", !oppOnline);
  text.textContent = oppOnline
    ? `${G.online.opponentName || "相手"} : 接続中`
    : `${G.online.opponentName || "相手"} : 応答なし…`;
}

function applyIncomingMoves(moves) {
  if (!moves || !G.online) return;
  while (G.online.appliedMoveCount < moves.length) {
    const mv = moves[G.online.appliedMoveCount];
    G.online.appliedMoveCount++;
    if (G.gameOver) continue;
    if (G.mode === "stack") commitStackMove(mv.r, mv.c, mv.size, { remote: true });
    else commitMove(mv.r, mv.c, mv.sym, { remote: true });
  }
}

function pushOnlineMove(moveObj) {
  if (!G.online || !G.online.matchId) return;
  G.online.appliedMoveCount++;
  MB.net.move(G.online.matchId, moveObj).catch(e => console.warn("mb_move failed", e));
}

function transitionToNewOnlineMatch(nid) {
  if (!G.online) return;
  G.online.matchId = nid;
  G.online.role = null;
  G.online.appliedMoveCount = 0;
  G.online.started = false;
}

function handleOnlineFinished(st) {
  const wasStarted = G.online && G.online.started;
  stopOnlinePoll();
  if (!wasStarted) {
    // まだ対局画面に入っていない(ロビー待機中)の切断/キャンセル
    if (st.end_reason === "leave" || st.end_reason === "timeout") showToast("相手が退出しました");
    else showToast("対戦相手が見つかりませんでした");
    showOnlineCard("choice");
    return;
  }
  if (G.gameOver) return;
  let text = "対戦が終了しました";
  let winForMe = null;
  if (st.end_reason === "leave") { text = `${st.opp_name || "相手"}が退出しました。あなたの勝ちです！`; winForMe = true; }
  else if (st.end_reason === "timeout") { text = `${st.opp_name || "相手"}との通信が切れました。あなたの勝ちです！`; winForMe = true; }
  else if (st.end_reason === "cancel") { text = "対戦相手が見つかりませんでした"; }
  endOnlineAbandoned(text, winForMe);
}

function handleOnlineGone() {
  const wasStarted = G.online && G.online.started;
  stopOnlinePoll();
  if (!wasStarted) {
    showToast("対戦データが見つかりませんでした");
    showOnlineCard("choice");
    return;
  }
  if (G.gameOver) return;
  endOnlineAbandoned("対戦データが見つかりませんでした", null);
}

function endOnlineAbandoned(text, winForMe) {
  clearTimeAttackTimer();
  G.gameOver = true;
  if (winForMe === true) {
    if (G.myIndex === 0) G.scores.p1++; else G.scores.p2++;
    updatePersistentStats(G.myIndex);
  }
  renderScoreboard();
  updateTurnIndicator();
  updateWildToggleUI();
  updateStackTrayUI();
  document.getElementById("result-text").textContent = text;
  document.getElementById("result-panel").classList.remove("hidden");
}

async function onlineClickAgain() {
  if (!G.online || !G.online.matchId) { showToast("再戦できませんでした"); return; }
  try {
    const nid = await MB.net.rematch(G.online.matchId);
    if (!nid) { showToast("再戦できませんでした(相手が見つかりません)"); return; }
    transitionToNewOnlineMatch(nid);
    hideResultPanel();
  } catch (e) {
    showToast("🌐 再戦の申し込みに失敗しました");
  }
}

function leaveOnlineMatch() {
  if (!G.online || !G.online.matchId) { G.online = null; return; }
  MB.net.leave(G.online.matchId).catch(() => {});
  stopOnlinePoll();
  document.getElementById("online-status-row").classList.add("hidden");
}

function cancelOnlineWaiting() {
  if (G.online && G.online.matchId) MB.net.leave(G.online.matchId).catch(() => {});
  stopOnlinePoll();
  showOnlineCard("choice");
}

function goBackFromOnlineScreen() {
  if (G.online) cancelOnlineWaiting();
  document.getElementById("screen-online").classList.add("hidden");
  document.getElementById("screen-setup").classList.remove("hidden");
  renderStatsPreview();
}

// ---------- 描画 ----------
function renderBoard(highlightCells) {
  if (G.mode === "stack") { renderStackBoard(highlightCells); return; }

  const boardEl = document.getElementById("board");
  boardEl.style.setProperty("--size", G.size);
  boardEl.style.gridTemplateColumns = `repeat(${G.size}, 1fr)`;
  boardEl.innerHTML = "";

  let colFull = [];
  if (G.mode === "gravity") {
    for (let c = 0; c < G.size; c++) colFull[c] = landingRowForCol(G.board, G.size, c) === -1;
  }

  for (let r = 0; r < G.size; r++) {
    for (let c = 0; c < G.size; c++) {
      const v = G.board[idx(G.size, r, c)];
      const btn = document.createElement("button");
      btn.className = "cell";
      if (v === "BLOCK") btn.classList.add("blocked");
      if (v === "X") btn.classList.add("sym-X");
      if (v === "O") btn.classList.add("sym-O");
      if (G.mode === "gravity") btn.classList.add("gravity-col");
      if (highlightCells && highlightCells.some(h => h.r === r && h.c === c)) btn.classList.add("win");
      btn.textContent = v === "X" ? "✕" : v === "O" ? "○" : "";
      const locked = turnLocked();
      btn.disabled = G.gameOver || locked || (G.mode === "gravity" ? colFull[c] : (v !== null));
      btn.addEventListener("click", () => handleCellClick(r, c));
      boardEl.appendChild(btn);
    }
  }
}

function renderStackBoard(highlightCells) {
  const boardEl = document.getElementById("board");
  boardEl.style.setProperty("--size", G.size);
  boardEl.style.gridTemplateColumns = `repeat(${G.size}, 1fr)`;
  boardEl.innerHTML = "";
  const locked = turnLocked();

  for (let r = 0; r < G.size; r++) {
    for (let c = 0; c < G.size; c++) {
      const i = idx(G.size, r, c);
      const st = G.stacks[i] || [];
      const top = st.length ? st[st.length - 1] : null;
      const btn = document.createElement("button");
      btn.className = "cell";
      if (top) {
        btn.classList.add("sym-" + top.sym);
        btn.classList.add("stk-" + top.size);
      }
      if (highlightCells && highlightCells.some(h => h.r === r && h.c === c)) btn.classList.add("win");
      const scale = top ? SIZE_SCALE[top.size] : 1;
      const symbolChar = top ? (top.sym === "X" ? "✕" : "○") : "";
      const badge = st.length > 1 ? `<span class="stack-badge">×${st.length}</span>` : "";
      btn.innerHTML = `<span class="piece-symbol" style="transform:scale(${scale})">${symbolChar}</span>${badge}`;
      btn.disabled = G.gameOver || locked || !canPlaceStack(r, c, G.selectedSize, G.turnIndex);
      btn.addEventListener("click", () => handleCellClick(r, c));
      boardEl.appendChild(btn);
    }
  }
}

function renderScoreboard() {
  const el = document.getElementById("scoreboard");
  if (!G.players.length) return;
  el.innerHTML = `
    <div class="score-item"><div class="score-name">${G.players[0].name}</div><div class="score-num">${G.scores.p1}</div></div>
    <div class="score-item"><div class="score-name">引分</div><div class="score-num">${G.scores.draw}</div></div>
    <div class="score-item"><div class="score-name">${G.players[1].name}</div><div class="score-num">${G.scores.p2}</div></div>
  `;
}

function updateTurnIndicator() {
  const el = document.getElementById("turn-indicator");
  if (G.gameOver) { el.textContent = ""; return; }
  const p = G.players[G.turnIndex];
  const symText = G.mode === "wild" ? "" : ` (${symbolForCurrentTurn() === "X" ? "✕" : "○"})`;
  el.textContent = `${p.name}の番${symText}`;
  el.className = "turn-indicator " + (G.turnIndex === 0 ? "p1" : "p2");
}

function updateWildToggleUI() {
  const wrap = document.getElementById("wild-toggle");
  if (G.mode !== "wild" || G.gameOver || turnLocked()) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  document.querySelectorAll(".wild-symbol-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.sym === G.wildSymbolChoice);
  });
}

function updateStackTrayUI() {
  const wrap = document.getElementById("stack-tray");
  if (G.mode !== "stack" || G.gameOver || turnLocked()) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  const sup = G.supply[G.turnIndex];
  document.querySelectorAll(".stack-size-btn").forEach(b => {
    const sz = parseInt(b.dataset.size, 10);
    b.textContent = `${SIZE_LABELS[sz]}(${sup[sz]})`;
    b.classList.toggle("active", sz === G.selectedSize);
    b.disabled = sup[sz] <= 0;
  });
}

function hideResultPanel() { document.getElementById("result-panel").classList.add("hidden"); }
function showResultPanel(winnerIndex) {
  const panel = document.getElementById("result-panel");
  const text = document.getElementById("result-text");
  text.textContent = winnerIndex === null ? "🤝 引き分け！" : `🎉 ${G.players[winnerIndex].name} の勝ち！`;
  panel.classList.remove("hidden");
}

function renderStatsPreview() {
  const stats = loadStats();
  const el = document.getElementById("stats-preview");
  if (!el) return;
  el.innerHTML = `通算 ${stats.totalGames}戦　${stats.wins}勝 ${stats.losses}敗 ${stats.draws}分　|　実績 ${stats.unlocked.length}/${ACHIEVEMENTS.length}`;
}

// ---------- モーダル ----------
function openModal(html) {
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
}
function closeModal() { document.getElementById("modal-overlay").classList.add("hidden"); }

function helpHtml() {
  return `
    <h2>❓ 遊び方</h2>
    <h3>基本</h3>
    <p>盤面サイズ（3〜5並べ）とモード、対戦相手を選んでスタート。指定した数だけ○か×を縦・横・斜めに並べると勝ちです。</p>
    <h3>モード一覧</h3>
    <p><b>🎯 ノーマル</b>：基本ルール。先に並べた方が勝ち。</p>
    <p><b>😈 ミゼール</b>：先に並べてしまった方が負け！逆転の発想で置く場所を選ぼう。</p>
    <p><b>⬇️ 重力</b>：マスを選ぶと一番下まで駒が落ちる、コネクトフォー風ルール。</p>
    <p><b>🌀 ワイルド</b>：自分の番なら○×どちらを置いてもOK。どちらの記号でも列を完成させた人の勝ち。</p>
    <p><b>🧱 ランダムブロック</b>：最初からいくつかのマスが使用不可。同じ盤面は二度とない。</p>
    <p><b>⏱️ タイムアタック</b>：制限時間内に置かないとランダムな場所に配置されてしまう。</p>
    <p><b>🔺 重ね取り</b>：駒には小・中・大のサイズがある。大きい駒は、置いてある小さい駒の上に重ねて「乗っ取り」できる（自分の駒でもOK）。一番上に見えている記号だけが勝敗判定の対象。どちらも置けなくなったら引き分け、片方だけ置けない場合はそのターンをスキップ。</p>
    <h3>対戦相手</h3>
    <p>CPU（弱い/普通/強い/激強）、同じ画面で交代しながら遊ぶ2人対戦、そして🌐オンライン対戦から選べます。</p>
    <h3>🌐 オンライン対戦</h3>
    <p><b>ランダムマッチ</b>：同じ盤面サイズ・モードを選んだ誰かと自動でマッチング。</p>
    <p><b>部屋を作る/入る</b>：合言葉（部屋コード）を友だちに送って1対1で対戦できます。</p>
    <p>対戦中に相手が18秒以上応答しなくなると自動的にあなたの勝ちになります。</p>
  `;
}

// ---------- 初期化・イベント ----------
function initTheme() {
  const saved = localStorage.getItem("marubatsu_theme");
  if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
}

function toggleDarkMode() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("marubatsu_theme", next);
  if (next === "dark") {
    const stats = loadStats();
    if (!stats.darkModeToggled) {
      stats.darkModeToggled = true;
      saveStats(stats);
      showAchievementToasts(checkAchievements(stats));
      renderStatsPreview();
    }
  }
}

function selectSingle(containerId, btn) {
  document.querySelectorAll(`#${containerId} .choice-btn`).forEach(x => x.classList.remove("selected"));
  btn.classList.add("selected");
}

function checkStartEnabled() {
  const size = document.querySelector("#size-choices .selected");
  const mode = document.querySelector("#mode-choices .selected");
  const opp = document.querySelector("#opponent-choices .selected");
  document.getElementById("btn-start").disabled = !(size && mode && opp);
}

function collectSetupConfig() {
  const sizeBtn = document.querySelector("#size-choices .selected");
  const modeBtn = document.querySelector("#mode-choices .selected");
  const oppBtn = document.querySelector("#opponent-choices .selected");
  return {
    size: parseInt(sizeBtn.dataset.size, 10),
    mode: modeBtn.dataset.mode,
    opponent: oppBtn.dataset.opp,
    difficulty: oppBtn.dataset.diff || null
  };
}

function goToSetup() {
  clearTimeAttackTimer();
  if (G.opponent === "online") leaveOnlineMatch();
  document.getElementById("btn-restart").classList.remove("hidden");
  document.getElementById("screen-game").classList.add("hidden");
  document.getElementById("screen-setup").classList.remove("hidden");
  renderStatsPreview();
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initBgmPlayer();
  renderVersionFooter();
  renderStatsPreview();

  document.querySelectorAll("#size-choices .choice-btn").forEach(b =>
    b.addEventListener("click", () => { selectSingle("size-choices", b); checkStartEnabled(); }));
  document.querySelectorAll("#mode-choices .choice-btn").forEach(b =>
    b.addEventListener("click", () => { selectSingle("mode-choices", b); checkStartEnabled(); }));
  document.querySelectorAll("#opponent-choices .choice-btn").forEach(b =>
    b.addEventListener("click", () => { selectSingle("opponent-choices", b); checkStartEnabled(); }));

  document.getElementById("btn-start").addEventListener("click", () => {
    if (document.getElementById("btn-start").disabled) return;
    const config = collectSetupConfig();
    if (config.opponent === "online") openOnlineScreen(config);
    else startGame(config);
  });

  document.getElementById("btn-back").addEventListener("click", goToSetup);
  document.getElementById("btn-change-mode").addEventListener("click", goToSetup);
  document.getElementById("btn-restart").addEventListener("click", () => startGame(G.lastConfig));
  document.getElementById("btn-again").addEventListener("click", () => {
    if (G.opponent === "online") onlineClickAgain();
    else newRound(false);
  });

  document.querySelectorAll(".wild-symbol-btn").forEach(b => {
    b.addEventListener("click", () => {
      if (G.gameOver || turnLocked()) return;
      G.wildSymbolChoice = b.dataset.sym;
      updateWildToggleUI();
    });
  });

  document.querySelectorAll(".stack-size-btn").forEach(b => {
    b.addEventListener("click", () => {
      if (G.gameOver || turnLocked()) return;
      const sz = parseInt(b.dataset.size, 10);
      if (G.supply[G.turnIndex][sz] <= 0) return;
      G.selectedSize = sz;
      updateStackTrayUI();
      renderBoard([]);
    });
  });

  document.getElementById("btn-online-back").addEventListener("click", goBackFromOnlineScreen);
  document.getElementById("btn-online-quick").addEventListener("click", startOnlineQuickMatch);
  document.getElementById("btn-online-create").addEventListener("click", startOnlineCreateRoom);
  document.getElementById("btn-online-join").addEventListener("click", () => showOnlineCard("join"));
  document.getElementById("btn-online-join-cancel").addEventListener("click", () => showOnlineCard("choice"));
  document.getElementById("btn-online-join-confirm").addEventListener("click", confirmOnlineJoinRoom);
  document.getElementById("btn-online-cancel").addEventListener("click", cancelOnlineWaiting);

  document.getElementById("btn-darkmode").addEventListener("click", toggleDarkMode);
  document.getElementById("btn-bgm").addEventListener("click", () => { openModal(bgmModalHtml()); bindBgmModalEvents(); });
  document.getElementById("btn-achievements").addEventListener("click", () => openModal(renderAchievementsModal(loadStats())));
  document.getElementById("btn-help").addEventListener("click", () => openModal(helpHtml()));
  document.getElementById("link-changelog").addEventListener("click", (e) => {
    e.preventDefault();
    openModal(`<h2>📝 更新履歴</h2>${renderChangelogModal()}`);
  });
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
});

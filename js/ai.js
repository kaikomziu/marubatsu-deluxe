// CPU AI ロジック
// 盤面は 1次元配列 (長さ size*size)。値は null(空) / 'X' / 'O' / 'BLOCK'(使用不可)

function aiIdx(size, r, c) { return r * size + c; }
function aiInBounds(size, r, c) { return r >= 0 && r < size && c >= 0 && c < size; }

function checkWinAt(board, size, r, c, symbol, winLength) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    let rr = r + dr, cc = c + dc;
    while (aiInBounds(size, rr, cc) && board[aiIdx(size, rr, cc)] === symbol) { count++; rr += dr; cc += dc; }
    rr = r - dr; cc = c - dc;
    while (aiInBounds(size, rr, cc) && board[aiIdx(size, rr, cc)] === symbol) { count++; rr -= dr; cc -= dc; }
    if (count >= winLength) return true;
  }
  return false;
}

function getValidMoves(board, size, mode) {
  const moves = [];
  if (mode === "gravity") {
    for (let c = 0; c < size; c++) {
      for (let r = size - 1; r >= 0; r--) {
        if (board[aiIdx(size, r, c)] === null) { moves.push({ r, c }); break; }
      }
    }
  } else {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[aiIdx(size, r, c)] === null) moves.push({ r, c });
      }
    }
  }
  return moves;
}

function applyToClone(board, size, mv, sym) {
  const b = board.slice();
  b[aiIdx(size, mv.r, mv.c)] = sym;
  return b;
}

function randomValidMove(board, size, mode) {
  const moves = getValidMoves(board, size, mode);
  if (!moves.length) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}

// 1手のヒューリスティック評価（そのマスに symbol を置いた場合の有望度）
function scoreMoveHeuristic(board, size, r, c, symbol, winLength, opponentSymbol) {
  let score = 0;
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    for (let offset = -(winLength - 1); offset <= 0; offset++) {
      let ok = true, own = 0;
      for (let k = 0; k < winLength; k++) {
        const rr = r + (offset + k) * dr, cc = c + (offset + k) * dc;
        if (!aiInBounds(size, rr, cc)) { ok = false; break; }
        const v = board[aiIdx(size, rr, cc)];
        if (v === opponentSymbol || v === "BLOCK") { ok = false; break; }
        if (v === symbol) own++;
      }
      if (ok) score += Math.pow(3, own + 1);
    }
  }
  const center = (size - 1) / 2;
  score += (1 - (Math.abs(r - center) + Math.abs(c - center)) / (size * 2)) * 2;
  return score;
}

/**
 * ctx: {
 *   board, size, winLength, mode, difficulty,
 *   aiSymbol, humanSymbol, wild(bool), misere(bool)
 * }
 * 戻り値: { r, c, sym }
 */
function aiChooseMove(ctx) {
  const { board, size, winLength, mode, difficulty } = ctx;
  const isWild = mode === "wild";
  const isMisere = mode === "misere";
  const moves = getValidMoves(board, size, mode);
  if (!moves.length) return null;

  const symbolsToTry = isWild ? ["X", "O"] : [ctx.aiSymbol];
  const oppSymbolFixed = isWild ? null : ctx.humanSymbol;

  const candidates = [];
  for (const mv of moves) {
    for (const sym of symbolsToTry) {
      const b2 = applyToClone(board, size, mv, sym);
      const wins = checkWinAt(b2, size, mv.r, mv.c, sym, winLength);
      const heuristic = scoreMoveHeuristic(board, size, mv.r, mv.c, sym, winLength, isWild ? (sym === "X" ? "O" : "X") : oppSymbolFixed);
      candidates.push({ mv, sym, wins, heuristic, board2: b2 });
    }
  }

  // 相手が次に勝てるかどうか（自分がこの手を打った後の盤面で判定）
  for (const cand of candidates) {
    if (cand.wins) { cand.oppCanWinNext = false; cand.oppBestHeuristic = 0; continue; }
    const oppMoves = getValidMoves(cand.board2, size, mode);
    const oppSyms = isWild ? ["X", "O"] : [oppSymbolFixed];
    let oppCanWin = false;
    let oppBestH = -Infinity;
    for (const omv of oppMoves) {
      for (const osym of oppSyms) {
        const b3 = applyToClone(cand.board2, size, omv, osym);
        if (checkWinAt(b3, size, omv.r, omv.c, osym, winLength)) oppCanWin = true;
        const h = scoreMoveHeuristic(cand.board2, size, omv.r, omv.c, osym, winLength, isWild ? (osym === "X" ? "O" : "X") : ctx.aiSymbol);
        if (h > oppBestH) oppBestH = h;
      }
    }
    cand.oppCanWinNext = oppCanWin;
    cand.oppBestHeuristic = oppBestH === -Infinity ? 0 : oppBestH;
  }

  // 各候補の「良さ」を算出
  for (const cand of candidates) {
    if (isMisere) {
      cand.goodness = (cand.wins ? -1000000 : 0) - cand.heuristic + (Math.random() * 2);
    } else {
      cand.goodness =
        (cand.wins ? 1000000 : 0) +
        (!cand.wins && cand.oppCanWinNext ? -500000 : 0) +
        cand.heuristic - cand.oppBestHeuristic * 0.5 +
        Math.random() * 0.5;
    }
  }

  candidates.sort((a, b) => b.goodness - a.goodness);

  let chosen;
  const roll = Math.random();
  if (difficulty === "extreme") {
    chosen = candidates[0];
  } else if (difficulty === "hard") {
    chosen = roll < 0.9 ? candidates[0] : candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
  } else if (difficulty === "normal") {
    chosen = roll < 0.6 ? candidates[0] : candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
  } else { // easy
    chosen = roll < 0.3 ? candidates[0] : candidates[Math.floor(Math.random() * candidates.length)];
  }

  return { r: chosen.mv.r, c: chosen.mv.c, sym: chosen.sym };
}

// ---------- 重ね取りモード専用AI ----------
// stacks: 配列(長さ size*size)の { sym, size }[]（下から上へ積む）
// supply: { [playerIndex]: {1:count,2:count,3:count} }
function stackTopSymbols(stacks) {
  return stacks.map(st => (st.length ? st[st.length - 1].sym : null));
}

function aiChooseStackMove(ctx) {
  const { stacks, size, winLength, supply, aiIndex, humanIndex, aiSymbol, humanSymbol, difficulty } = ctx;

  const moves = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const st = stacks[aiIdx(size, r, c)];
      const topSize = st.length ? st[st.length - 1].size : 0;
      for (const sz of [1, 2, 3]) {
        if (supply[aiIndex][sz] > 0 && sz > topSize) moves.push({ r, c, size: sz });
      }
    }
  }
  if (!moves.length) return null;

  const baseTop = stackTopSymbols(stacks);
  const candidates = [];
  for (const mv of moves) {
    const stacks2 = stacks.map(st => st.slice());
    const i2 = aiIdx(size, mv.r, mv.c);
    stacks2[i2] = stacks2[i2].concat([{ sym: aiSymbol, size: mv.size }]);
    const top2 = stackTopSymbols(stacks2);
    const wins = checkWinAt(top2, size, mv.r, mv.c, aiSymbol, winLength);
    const heuristic = scoreMoveHeuristic(baseTop, size, mv.r, mv.c, aiSymbol, winLength, humanSymbol);
    candidates.push({ mv, stacks2, top2, wins, heuristic });
  }

  for (const cand of candidates) {
    if (cand.wins) { cand.oppCanWinNext = false; cand.oppBestHeuristic = 0; continue; }
    const supplyAfter = {
      [aiIndex]: Object.assign({}, supply[aiIndex]),
      [humanIndex]: Object.assign({}, supply[humanIndex])
    };
    supplyAfter[aiIndex][cand.mv.size]--;
    let oppCanWin = false, oppBestH = -Infinity;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i3 = aiIdx(size, r, c);
        const st = cand.stacks2[i3];
        const topSize = st.length ? st[st.length - 1].size : 0;
        for (const sz of [1, 2, 3]) {
          if (supplyAfter[humanIndex][sz] > 0 && sz > topSize) {
            const stacks3 = cand.stacks2.map(s => s.slice());
            stacks3[i3] = stacks3[i3].concat([{ sym: humanSymbol, size: sz }]);
            const top3 = stackTopSymbols(stacks3);
            if (checkWinAt(top3, size, r, c, humanSymbol, winLength)) oppCanWin = true;
            const h = scoreMoveHeuristic(cand.top2, size, r, c, humanSymbol, winLength, aiSymbol);
            if (h > oppBestH) oppBestH = h;
          }
        }
      }
    }
    cand.oppCanWinNext = oppCanWin;
    cand.oppBestHeuristic = oppBestH === -Infinity ? 0 : oppBestH;
  }

  for (const cand of candidates) {
    cand.goodness =
      (cand.wins ? 1000000 : 0) +
      (!cand.wins && cand.oppCanWinNext ? -500000 : 0) +
      cand.heuristic - cand.oppBestHeuristic * 0.5 +
      Math.random() * 0.5;
  }
  candidates.sort((a, b) => b.goodness - a.goodness);

  let chosen;
  const roll = Math.random();
  if (difficulty === "extreme") {
    chosen = candidates[0];
  } else if (difficulty === "hard") {
    chosen = roll < 0.9 ? candidates[0] : candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
  } else if (difficulty === "normal") {
    chosen = roll < 0.6 ? candidates[0] : candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
  } else {
    chosen = roll < 0.3 ? candidates[0] : candidates[Math.floor(Math.random() * candidates.length)];
  }

  return { r: chosen.mv.r, c: chosen.mv.c, size: chosen.mv.size };
}

/**
 * FANORON-TELO — Moteur de jeu complet avec IA
 * ISPM Madagascar — Hackathon Algorithmique Avancée
 *
 * Plateau 3×3, indices 0..8 (gauche→droite, haut→bas) :
 *   0-1-2
 *   3-4-5
 *   6-7-8
 *
 * ── Algorithmes IA implémentés ──────────────────────
 *  • Minimax avec élagage Alpha-Beta (Section 5)
 *  • Iterative Deepening (Section 5)
 *  • Table de transposition avec flags exact/lower/upper (Section 5)
 *  • Move ordering (killer move heuristic) pour accélérer l'élagage
 *  • Opening book (bibliothèque de coups d'ouverture prédéfinis) (Section 5)
 *  • Heuristique d'évaluation multi-critères (Section 5)
 *  • Détection de match nul par blocage (Phase 2)
 *  • Métriques complètes : temps, nœuds, profondeur atteinte (Section 6)
 */

"use strict";

/* ══════════════════════════════════════════════════════
   1. CONSTANTES & STRUCTURES DE DONNÉES
   ══════════════════════════════════════════════════════ */

const EMPTY = 0,
  P1 = 1,
  P2 = 2;

/** 8 lignes gagnantes (3 cases alignées) */
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // horizontales
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // verticales
  [0, 4, 8],
  [2, 4, 6], // diagonales
];

/**
 * Graphe d'adjacence du plateau Fanoron-telo :
 * chaque case liste ses voisins directs reliés par une ligne.
 *
 *   0 ─ 1 ─ 2
 *   │ ╲ │ ╱ │
 *   3 ─ 4 ─ 5
 *   │ ╱ │ ╲ │
 *   6 ─ 7 ─ 8
 */
const ADJACENCY = [
  [1, 3, 4], // 0
  [0, 2, 3, 4, 5], // 1
  [1, 4, 5], // 2
  [0, 1, 4, 6, 7], // 3
  [0, 1, 2, 3, 5, 6, 7, 8], // 4 (centre : 8 voisins)
  [1, 2, 4, 7, 8], // 5
  [3, 4, 7], // 6
  [3, 4, 5, 6, 8], // 7
  [4, 5, 7], // 8
];

/** Cases stratégiques par rang */
const CORNERS = [0, 2, 6, 8];
const CENTER = 4;
const EDGES = [1, 3, 5, 7];

/**
 * Opening Book : associe un état de plateau (string "000000000")
 * à une liste ordonnée de coups recommandés pour l'IA (joueur 2).
 * Construit selon la théorie des jeux : contrôle du centre, puis coins.
 */
const OPENING_BOOK = {
  // IA joue en premier (plateau vide) → centre
  "000000000_1": [4],
  // Humain a pris le centre → coin opposé
  "000010000_2": [0, 2, 6, 8],
  // Humain a pris un coin → centre
  "100000000_2": [4],
  "001000000_2": [4],
  "000000100_2": [4],
  "000000001_2": [4], // ajusté: index 8
  // Humain a pris un bord → centre
  "010000000_2": [4],
  "000100000_2": [4],
  "000001000_2": [4],
  "000000010_2": [4],
  // IA a le centre, humain en coin → coin adjacent pour forcer
  "100010000_2": [8, 2, 6],
  "001010000_2": [6, 0, 8],
  "000010100_2": [2, 0, 8],
  "000010001_2": [0, 2, 6], // ajusté
};

/** Profondeur maximale par niveau pour Iterative Deepening */
const MAX_DEPTH = { easy: 1, medium: 4, hard: 9 };

/** Flags pour la table de transposition (fenêtre alpha-beta) */
const TT_EXACT = 0,
  TT_LOWER = 1,
  TT_UPPER = 2;

/* ══════════════════════════════════════════════════════
   2. ÉTAT GLOBAL DU JEU
   ══════════════════════════════════════════════════════ */

let state = {
  board: Array(9).fill(EMPTY),
  phase: 1, // 1=placement, 2=mouvement
  turn: P1,
  placed: [0, 0], // pions posés [P1-1, P2-1]
  selected: -1, // case sélectionnée en phase 2
  mode: "hvh", // 'hvh' | 'hva' | 'ava'
  difficulty: "medium",
  history: [], // pile d'états pour Undo
  gameOver: false,
  aiThinking: false,
  // Métriques IA (Section 6)
  aiStats: {
    timeMs: 0,
    nodesVisited: 0,
    depthReached: 0,
    ttHits: 0,
    cutoffs: 0,
  },
  // Table de transposition persistante par partie
  tt: new Map(),
};

/* ══════════════════════════════════════════════════════
   3. RENDU CANVAS
   ══════════════════════════════════════════════════════ */

const canvas = document.getElementById("board-canvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("board-overlay");

const CELL_SIZE = 120; // 360px / 3
const OFFSET = 60; // marge = demi-cellule

function cellToXY(idx) {
  return {
    x: OFFSET + (idx % 3) * CELL_SIZE,
    y: OFFSET + Math.floor(idx / 3) * CELL_SIZE,
  };
}

function drawBoard() {
  const W = canvas.width,
    H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Fond
  ctx.fillStyle = "#161b22";
  ctx.fillRect(0, 0, W, H);

  // ── Lignes du plateau ──
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    ADJACENCY[i].forEach((j) => {
      if (j <= i) return;
      const a = cellToXY(i),
        b = cellToXY(j);
      // Les diagonales sont légèrement plus fines
      const isDiag =
        Math.abs(a.x - b.x) === CELL_SIZE && Math.abs(a.y - b.y) === CELL_SIZE;
      ctx.strokeStyle = isDiag ? "#383e47" : "#444c56";
      ctx.lineWidth = isDiag ? 1.5 : 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }

  // ── Cases gagnantes ──
  const winner = checkWinner(state.board);
  const winCells = new Set();
  if (winner) {
    WIN_LINES.forEach(([a, b, c]) => {
      if (
        state.board[a] === winner &&
        state.board[b] === winner &&
        state.board[c] === winner
      )
        [a, b, c].forEach((x) => winCells.add(x));
    });
  }

  // ── Pions et intersections ──
  for (let i = 0; i < 9; i++) {
    const { x, y } = cellToXY(i);
    const cell = state.board[i];

    // Halo sélection
    if (state.selected === i) {
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(232,168,56,.2)";
      ctx.fill();
    }

    // Destinations légales (point doré)
    if (state.selected !== -1 && state.phase === 2 && cell === EMPTY) {
      const legalDests = getLegalMoves(state)
        .filter((m) => m.from === state.selected)
        .map((m) => m.to);
      if (legalDests.includes(i)) {
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(232,168,56,.6)";
        ctx.fill();
        ctx.strokeStyle = "#e8a838";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (cell !== EMPTY) {
      // Halo victoire
      if (winCells.has(i)) {
        ctx.beginPath();
        ctx.arc(x, y, 32, 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(x, y, 10, x, y, 32);
        glow.addColorStop(0, "rgba(232,168,56,.4)");
        glow.addColorStop(1, "rgba(232,168,56,0)");
        ctx.fillStyle = glow;
        ctx.fill();
      }

      // Ombre
      ctx.beginPath();
      ctx.arc(x + 3, y + 4, 22, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fill();

      // Corps du pion (dégradé radial)
      const g = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, 22);
      if (cell === P1) {
        g.addColorStop(0, "#666");
        g.addColorStop(1, "#0d0d0d");
      } else {
        g.addColorStop(0, "#ffffff");
        g.addColorStop(1, "#c8c0b0");
      }
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = cell === P1 ? "#999" : "#e0d8cc";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Point d'intersection vide
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#30363d";
      ctx.fill();
    }
  }

  updateOverlayHitAreas();
}

function updateOverlayHitAreas() {
  overlay.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const { x, y } = cellToXY(i);
    const el = document.createElement("div");
    el.style.cssText = `position:absolute;left:${x - 32}px;top:${y - 32}px;width:64px;height:64px;border-radius:50%;cursor:pointer;`;
    el.addEventListener("click", () => onCellClick(i));
    overlay.appendChild(el);
  }
}

/* ══════════════════════════════════════════════════════
   4. LOGIQUE DU JEU (règles)
   ══════════════════════════════════════════════════════ */

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== EMPTY && board[a] === board[b] && board[b] === board[c])
      return board[a];
  }
  return null;
}

/** Retourne true si le joueur `player` est complètement bloqué en phase 2 */
function isBlocked(board, player) {
  for (let from = 0; from < 9; from++) {
    if (board[from] !== player) continue;
    if (ADJACENCY[from].some((to) => board[to] === EMPTY)) return false;
  }
  return true;
}

function getLegalMoves(st) {
  if (st.phase === 1) {
    return st.board.reduce((acc, v, i) => {
      if (v === EMPTY) acc.push({ type: "place", to: i });
      return acc;
    }, []);
  }
  const moves = [];
  st.board.forEach((v, from) => {
    if (v !== st.turn) return;
    ADJACENCY[from].forEach((to) => {
      if (st.board[to] === EMPTY) moves.push({ type: "move", from, to });
    });
  });
  return moves;
}

function applyMove(st, move) {
  const nb = st.board.slice();
  const placed = st.placed.slice();
  let phase = st.phase;

  if (move.type === "place") {
    nb[move.to] = st.turn;
    placed[st.turn - 1]++;
    if (placed[0] === 3 && placed[1] === 3) phase = 2;
  } else {
    nb[move.to] = nb[move.from];
    nb[move.from] = EMPTY;
  }

  return {
    ...st,
    board: nb,
    phase,
    placed,
    turn: st.turn === P1 ? P2 : P1,
    selected: -1,
  };
}

/* ══════════════════════════════════════════════════════
   5. ALGORITHMES IA
   ══════════════════════════════════════════════════════

   5a. Heuristique d'évaluation
   ─────────────────────────────
   Pour chaque ligne gagnante on calcule :
   - +100 si 2 pions propres et case vide (menace directe)
   - +10  si 1 pion propre et 2 cases vides (potentiel)
   - Symétrique négatif pour l'adversaire
   - Bonus positionnel : centre (+5), coins (+2), bords (+1)
   - Bonus mobilité en Phase 2 (nombre de mouvements légaux)
   ══════════════════════════════════════════════════════ */

function evaluate(board, player, phase) {
  const opp = player === P1 ? P2 : P1;
  let score = 0;

  for (const [a, b, c] of WIN_LINES) {
    const line = [board[a], board[b], board[c]];
    const mine = line.filter((x) => x === player).length;
    const his = line.filter((x) => x === opp).length;
    const free = line.filter((x) => x === EMPTY).length;

    if (his === 0) {
      if (mine === 2 && free === 1)
        score += 100; // menace directe
      else if (mine === 1 && free === 2) score += 10;
    }
    if (mine === 0) {
      if (his === 2 && free === 1)
        score -= 100; // bloquer adversaire
      else if (his === 1 && free === 2) score -= 10;
    }
  }

  // Bonus positionnel
  const posBonus = [2, 1, 2, 1, 5, 1, 2, 1, 2];
  for (let i = 0; i < 9; i++) {
    if (board[i] === player) score += posBonus[i];
    if (board[i] === opp) score -= posBonus[i];
  }

  // Mobilité (Phase 2) : nb de mouvements disponibles
  if (phase === 2) {
    let myMoves = 0,
      oppMoves = 0;
    for (let from = 0; from < 9; from++) {
      const adj = ADJACENCY[from];
      if (board[from] === player)
        myMoves += adj.filter((t) => board[t] === EMPTY).length;
      if (board[from] === opp)
        oppMoves += adj.filter((t) => board[t] === EMPTY).length;
    }
    score += (myMoves - oppMoves) * 3;
  }

  return score;
}

/* ──────────────────────────────────────────────────────
   5b. Minimax avec élagage Alpha-Beta + Table de transposition
   ──────────────────────────────────────────────────────
   La TT stocke : { value, flag, depth }
     flag = TT_EXACT  → valeur exacte
     flag = TT_LOWER  → lower bound (alpha cutoff)
     flag = TT_UPPER  → upper bound (beta cutoff)
   ────────────────────────────────────────────────────── */

// Variables de recherche (réinitialisées à chaque appel getBestMove)
let _nodes = 0,
  _cutoffs = 0,
  _ttHits = 0;
const _tt = new Map(); // table de transposition locale à la recherche

function ttKey(board, phase, turn) {
  // Clé compacte : contenu du plateau + phase + joueur
  return board.join("") + phase + turn;
}

function minimax(st, depth, alpha, beta, maximizing, aiPlayer) {
  _nodes++;

  // ── Vérification dans la TT ──
  const key = ttKey(st.board, st.phase, st.turn);
  const entry = _tt.get(key);
  if (entry && entry.depth >= depth) {
    _ttHits++;
    if (entry.flag === TT_EXACT) return entry.value;
    if (entry.flag === TT_LOWER) alpha = Math.max(alpha, entry.value);
    if (entry.flag === TT_UPPER) beta = Math.min(beta, entry.value);
    if (alpha >= beta) {
      _cutoffs++;
      return entry.value;
    }
  }

  // ── Cas terminaux ──
  const winner = checkWinner(st.board);
  if (winner) {
    const v = winner === aiPlayer ? 10000 + depth : -10000 - depth;
    _tt.set(key, { value: v, flag: TT_EXACT, depth });
    return v;
  }

  // Détection de blocage (match nul)
  if (st.phase === 2 && isBlocked(st.board, st.turn)) {
    const v = st.turn === aiPlayer ? -5000 : 5000;
    _tt.set(key, { value: v, flag: TT_EXACT, depth });
    return v;
  }

  if (depth === 0) {
    const v = evaluate(st.board, aiPlayer, st.phase);
    _tt.set(key, { value: v, flag: TT_EXACT, depth: 0 });
    return v;
  }

  // ── Génération et ordonnancement des coups ──
  let moves = getLegalMoves(st);
  if (!moves.length) return 0;
  moves = orderMoves(moves, st, aiPlayer); // Move ordering

  let best = maximizing ? -Infinity : Infinity;
  let flag = maximizing ? TT_UPPER : TT_LOWER;
  const origAlpha = alpha,
    origBeta = beta;

  for (const move of moves) {
    const child = applyMove(st, move);
    const val = minimax(child, depth - 1, alpha, beta, !maximizing, aiPlayer);

    if (maximizing) {
      if (val > best) {
        best = val;
        flag = TT_EXACT;
      }
      if (val > alpha) {
        alpha = val;
        flag = TT_EXACT;
      }
    } else {
      if (val < best) {
        best = val;
        flag = TT_EXACT;
      }
      if (val < beta) {
        beta = val;
        flag = TT_EXACT;
      }
    }

    if (alpha >= beta) {
      _cutoffs++;
      break;
    } // Élagage Alpha-Beta
  }

  // Stocker le résultat dans la TT
  const storedFlag = maximizing
    ? best <= origAlpha
      ? TT_UPPER
      : best >= beta
        ? TT_LOWER
        : TT_EXACT
    : best >= origBeta
      ? TT_LOWER
      : best <= alpha
        ? TT_UPPER
        : TT_EXACT;
  _tt.set(key, { value: best, flag: storedFlag, depth });

  return best;
}

/* ──────────────────────────────────────────────────────
   5c. Ordonnancement des coups (Move Ordering)
   Trier les coups pour maximiser l'élagage Alpha-Beta :
   1. Coups gagnants immédiats
   2. Coups qui bloquent l'adversaire
   3. Centre, puis coins, puis bords
   ────────────────────────────────────────────────────── */

function orderMoves(moves, st, aiPlayer) {
  const opp = aiPlayer === P1 ? P2 : P1;

  function movePriority(move) {
    const sim = applyMove(st, move);
    // Victoire immédiate → priorité maximale
    if (checkWinner(sim.board) === aiPlayer) return 1000;
    // Bloque une victoire adverse
    const oppSim = applyMove({ ...st, turn: opp }, move);
    if (checkWinner(oppSim.board) === opp) return 500;
    // Position : centre > coins > bords
    const to = move.to !== undefined ? move.to : move.from;
    if (to === CENTER) return 10;
    if (CORNERS.includes(to)) return 5;
    if (EDGES.includes(to)) return 2;
    return 0;
  }

  return moves.slice().sort((a, b) => movePriority(b) - movePriority(a));
}

/* ──────────────────────────────────────────────────────
   5d. Iterative Deepening
   On lance Minimax pour depth=1, 2, 3, … jusqu'à maxDepth
   ou jusqu'à ce qu'une limite de temps soit atteinte.
   Ça permet d'avoir toujours un meilleur coup disponible
   même si on doit interrompre la recherche.
   ────────────────────────────────────────────────────── */

function getBestMove(st, difficulty) {
  const maxDepth = MAX_DEPTH[difficulty] || 4;
  const timeLimit =
    difficulty === "hard" ? 1500 : difficulty === "medium" ? 600 : 200; // ms

  _nodes = 0;
  _cutoffs = 0;
  _ttHits = 0;
  _tt.clear();

  // ── Opening Book (Phase 1 uniquement) ──
  if (st.phase === 1) {
    const bookKey = st.board.join("") + "_" + st.turn;
    const candidates = OPENING_BOOK[bookKey];
    if (candidates) {
      const valid = candidates.filter((i) => st.board[i] === EMPTY);
      if (valid.length) {
        return { type: "place", to: valid[0], fromBook: true };
      }
    }
  }

  const moves = getLegalMoves(st);
  if (!moves.length) return null;

  // Facile : heuristique légère sans Minimax profond
  if (difficulty === "easy") {
    return easyMove(st, moves);
  }

  const t0 = performance.now();
  let bestMove = moves[0];
  let depthReached = 0;

  // ── Iterative Deepening ──
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (performance.now() - t0 > timeLimit) break;

    let iterBest = -Infinity;
    let iterMove = null;
    const orderedMoves = orderMoves(moves, st, st.turn);

    for (const move of orderedMoves) {
      if (performance.now() - t0 > timeLimit) break;
      const child = applyMove(st, move);
      const val = minimax(
        child,
        depth - 1,
        -Infinity,
        Infinity,
        false,
        st.turn,
      );
      if (val > iterBest) {
        iterBest = val;
        iterMove = move;
      }
    }

    if (iterMove) {
      bestMove = iterMove;
      depthReached = depth;
    }

    // Victoire certaine trouvée → inutile d'approfondir
    if (iterBest >= 9000) break;
  }

  // Stocker la profondeur atteinte pour les stats
  getBestMove._depthReached = depthReached;
  return bestMove;
}
getBestMove._depthReached = 0;

/* ──────────────────────────────────────────────────────
   5e. IA Facile : heuristique simple sans Minimax profond
   (1) Gagner immédiatement si possible
   (2) Bloquer une victoire adverse
   (3) Jouer le centre / coin disponible
   (4) Sinon coup aléatoire
   ────────────────────────────────────────────────────── */

function easyMove(st, moves) {
  const opp = st.turn === P1 ? P2 : P1;

  // 1. Victoire immédiate
  for (const m of moves) {
    if (checkWinner(applyMove(st, m).board) === st.turn) return m;
  }
  // 2. Bloquer l'adversaire
  for (const m of moves) {
    const sim = { ...st, turn: opp };
    if (checkWinner(applyMove(sim, m).board) === opp) return m;
  }
  // 3. Centre, puis coins, sinon aléatoire
  const pref = [CENTER, ...CORNERS, ...EDGES];
  for (const pos of pref) {
    const m = moves.find((mv) => mv.to === pos || mv.from === pos);
    if (m) return m;
  }
  return moves[Math.floor(Math.random() * moves.length)];
}

/* ══════════════════════════════════════════════════════
   6. BOUCLE DE JEU & INTERACTIONS
   ══════════════════════════════════════════════════════ */

function onCellClick(idx) {
  if (state.gameOver || state.aiThinking) return;
  if (state.mode === "hva" && state.turn === P2) return;
  if (state.mode === "ava") return;

  if (state.phase === 1) {
    if (state.board[idx] !== EMPTY) return;
    doMove({ type: "place", to: idx });
  } else {
    if (state.selected === -1) {
      if (state.board[idx] === state.turn) {
        state.selected = idx;
        drawBoard();
      }
    } else {
      if (state.board[idx] === state.turn) {
        state.selected = idx;
        drawBoard();
      } else if (
        state.board[idx] === EMPTY &&
        ADJACENCY[state.selected].includes(idx)
      ) {
        doMove({ type: "move", from: state.selected, to: idx });
      } else {
        state.selected = -1;
        drawBoard();
      }
    }
  }
}

function doMove(move) {
  // Sauvegarder l'état pour Undo
  state.history.push({
    board: state.board.slice(),
    phase: state.phase,
    placed: state.placed.slice(),
    turn: state.turn,
    selected: state.selected,
  });
  document.getElementById("btn-undo").disabled = false;

  state = applyMove(state, move);
  updatePionVisuals();
  drawBoard();
  updateStatus();

  // Vérifier victoire
  const winner = checkWinner(state.board);
  if (winner) {
    state.gameOver = true;
    setTimeout(() => showEndModal(winner), 450);
    return;
  }

  // Vérifier blocage (match nul Phase 2)
  if (state.phase === 2 && isBlocked(state.board, state.turn)) {
    state.gameOver = true;
    setTimeout(() => showEndModal(null), 450);
    return;
  }

  // Tour de l'IA ?
  const isAITurn =
    (state.mode === "hva" && state.turn === P2) || state.mode === "ava";
  if (!state.gameOver && isAITurn) scheduleAI();
}

function scheduleAI() {
  state.aiThinking = true;
  updateStatus();
  setTimeout(runAI, state.mode === "ava" ? 700 : 280);
}

function runAI() {
  if (state.gameOver) {
    state.aiThinking = false;
    return;
  }

  const t0 = performance.now();
  const move = getBestMove(state, state.difficulty);
  const dt = performance.now() - t0;

  // ── Métriques Section 6 ──
  state.aiStats = {
    timeMs: dt.toFixed(1),
    nodesVisited: _nodes,
    depthReached: getBestMove._depthReached,
    ttHits: _ttHits,
    cutoffs: _cutoffs,
  };
  updateAIStats();

  state.aiThinking = false;
  if (move) doMove(move);
  else {
    updateStatus();
  }

  if (state.mode === "ava" && !state.gameOver) scheduleAI();
}

/* ══════════════════════════════════════════════════════
   7. MISE À JOUR DE L'INTERFACE
   ══════════════════════════════════════════════════════ */

function updateStatus() {
  const bar = document.getElementById("status-bar");
  if (state.gameOver) return;

  const p1n = document.getElementById("p1-name").textContent;
  const p2n = document.getElementById("p2-name").textContent;
  const names = [null, p1n, p2n];

  document
    .getElementById("p1-card")
    .classList.toggle("active", state.turn === P1);
  document
    .getElementById("p2-card")
    .classList.toggle("active", state.turn === P2);

  if (state.aiThinking) {
    bar.textContent = "🤖 L'IA réfléchit…";
    bar.style.background = "rgba(158,106,3,.2)";
    return;
  }
  bar.style.background = "";
  bar.textContent = `Phase ${state.phase === 1 ? "Placement" : "Mouvement"} — Tour de ${names[state.turn]}`;
}

function updatePionVisuals() {
  ["p1", "p2"].forEach((p, pi) => {
    document.querySelectorAll(`#${p}-card .pion`).forEach((el, i) => {
      el.classList.toggle("used", i >= 3 - state.placed[pi]);
    });
  });
}

/** Affiche les métriques de l'IA (Section 6) */
function updateAIStats() {
  const s = state.aiStats;
  document.getElementById("ai-time").textContent = s.timeMs + " ms";
  document.getElementById("ai-nodes").textContent =
    s.nodesVisited.toLocaleString();
  document.getElementById("ai-depth").textContent = s.depthReached;
  document.getElementById("ai-tt").textContent = s.ttHits.toLocaleString();
  document.getElementById("ai-cuts").textContent = s.cutoffs.toLocaleString();
  document.getElementById("ai-stats").classList.remove("hidden");
}

function showEndModal(winner) {
  const p1n = document.getElementById("p1-name").textContent;
  const p2n = document.getElementById("p2-name").textContent;
  const names = [null, p1n, p2n];

  document.getElementById("modal-icon").textContent = winner
    ? winner === P1
      ? "🥇"
      : "🏆"
    : "🤝";
  document.getElementById("modal-title").textContent = winner
    ? `${names[winner]} gagne !`
    : "Match nul";
  document.getElementById("modal-msg").textContent = winner
    ? `Félicitations ! ${names[winner]} a aligné ses 3 pions.`
    : "Un joueur est bloqué — aucun ne peut gagner.";
  document.getElementById("modal-end").classList.remove("hidden");
}

/* ══════════════════════════════════════════════════════
   8. GESTION DES ÉCRANS ET MODES
   ══════════════════════════════════════════════════════ */

function showDifficultyMenu() {
  document.getElementById("difficulty-menu").classList.remove("hidden");
}

function startGame(mode, difficulty = "medium") {
  state = {
    board: Array(9).fill(EMPTY),
    phase: 1,
    turn: P1,
    placed: [0, 0],
    selected: -1,
    mode,
    difficulty,
    history: [],
    gameOver: false,
    aiThinking: false,
    aiStats: {
      timeMs: 0,
      nodesVisited: 0,
      depthReached: 0,
      ttHits: 0,
      cutoffs: 0,
    },
    tt: new Map(),
  };

  const diffNames = { easy: "Facile", medium: "Moyen", hard: "Difficile" };
  document.getElementById("p1-name").textContent =
    mode === "ava" ? "IA Noire" : "Joueur 1";
  document.getElementById("p2-name").textContent =
    mode === "hvh" ? "Joueur 2" : `IA (${diffNames[difficulty]})`;
  document.getElementById("game-title").textContent = {
    hvh: "Humain vs Humain",
    hva: "Humain vs IA",
    ava: "IA vs IA — Démo",
  }[mode];

  document.getElementById("difficulty-menu").classList.add("hidden");
  document.getElementById("ai-stats").classList.add("hidden");
  document.getElementById("btn-undo").disabled = true;
  document.getElementById("modal-end").classList.add("hidden");

  switchScreen("screen-game");
  updatePionVisuals();
  drawBoard();
  updateStatus();

  if (mode === "ava") setTimeout(scheduleAI, 900);
}

function undoMove() {
  if (!state.history.length || state.aiThinking) return;
  const prev = state.history.pop();
  Object.assign(state, { ...prev, gameOver: false, aiThinking: false });
  document.getElementById("btn-undo").disabled = state.history.length === 0;
  document.getElementById("modal-end").classList.add("hidden");
  updatePionVisuals();
  drawBoard();
  updateStatus();
}

function restartGame() {
  document.getElementById("modal-end").classList.add("hidden");
  startGame(state.mode, state.difficulty);
}

function goHome() {
  state.gameOver = true;
  document.getElementById("modal-end").classList.add("hidden");
  switchScreen("screen-home");
}

function switchScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* ══════════════════════════════════════════════════════
   9. INIT
   ══════════════════════════════════════════════════════ */
drawBoard();

window.startGame = startGame;
window.showDifficultyMenu = showDifficultyMenu;
window.goHome = goHome;
window.undoMove = undoMove;
window.restartGame = restartGame;
window.onCellClick = onCellClick;

// 実績システム
const STATS_KEY = "marubatsu_stats_v1";

function defaultStats() {
  return {
    totalGames: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winsBySize: { 3: 0, 4: 0, 5: 0 },
    winsByMode: { normal: 0, misere: 0, gravity: 0, wild: 0, randomblock: 0, timeattack: 0 },
    winsByDifficulty: { easy: 0, normal: 0, hard: 0, extreme: 0 },
    currentStreak: 0,
    maxStreak: 0,
    pvpPlayed: false,
    darkModeToggled: false,
    timeoutExperienced: false,
    fastestWin: { 3: null, 4: null, 5: null },
    boardFullBlockDraw: false,
    unlocked: []
  };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return defaultStats();
    return Object.assign(defaultStats(), JSON.parse(raw));
  } catch (e) {
    return defaultStats();
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

const ACHIEVEMENTS = [
  { id: "first_win", icon: "🎉", title: "はじめの一歩", desc: "初めて勝利する", check: s => s.wins >= 1 },
  { id: "win3", icon: "3️⃣", title: "3並べ制覇", desc: "3並べで勝利する", check: s => s.winsBySize[3] >= 1 },
  { id: "win4", icon: "4️⃣", title: "4並べ制覇", desc: "4並べで勝利する", check: s => s.winsBySize[4] >= 1 },
  { id: "win5", icon: "5️⃣", title: "5並べ制覇", desc: "5並べで勝利する", check: s => s.winsBySize[5] >= 1 },
  { id: "all_sizes", icon: "📐", title: "全サイズ制覇", desc: "3・4・5並べすべてで勝利する", check: s => s.winsBySize[3] >= 1 && s.winsBySize[4] >= 1 && s.winsBySize[5] >= 1 },
  { id: "beat_easy", icon: "🤖", title: "CPU(弱い)撃破", desc: "CPU弱いに勝利する", check: s => s.winsByDifficulty.easy >= 1 },
  { id: "beat_normal", icon: "🤖", title: "CPU(普通)撃破", desc: "CPU普通に勝利する", check: s => s.winsByDifficulty.normal >= 1 },
  { id: "beat_hard", icon: "🤖", title: "CPU(強い)撃破", desc: "CPU強いに勝利する", check: s => s.winsByDifficulty.hard >= 1 },
  { id: "beat_extreme", icon: "👑", title: "激強撃破", desc: "CPU激強に勝利する", check: s => s.winsByDifficulty.extreme >= 1 },
  { id: "all_difficulty", icon: "🏅", title: "AI制覇者", desc: "全難易度のCPUに勝利する", check: s => s.winsByDifficulty.easy >= 1 && s.winsByDifficulty.normal >= 1 && s.winsByDifficulty.hard >= 1 && s.winsByDifficulty.extreme >= 1 },
  { id: "win_misere", icon: "😈", title: "ミゼール制覇", desc: "ミゼールモードで勝利する", check: s => s.winsByMode.misere >= 1 },
  { id: "win_gravity", icon: "⬇️", title: "重力制覇", desc: "重力モードで勝利する", check: s => s.winsByMode.gravity >= 1 },
  { id: "win_wild", icon: "🌀", title: "ワイルド制覇", desc: "ワイルドモードで勝利する", check: s => s.winsByMode.wild >= 1 },
  { id: "win_randomblock", icon: "🧱", title: "ランダムブロック制覇", desc: "ランダムブロックモードで勝利する", check: s => s.winsByMode.randomblock >= 1 },
  { id: "win_timeattack", icon: "⏱️", title: "タイムアタック制覇", desc: "タイムアタックモードで勝利する", check: s => s.winsByMode.timeattack >= 1 },
  { id: "all_modes", icon: "🌈", title: "全モード制覇", desc: "6つのモードすべてで勝利する", check: s => Object.values(s.winsByMode).every(v => v >= 1) },
  { id: "streak3", icon: "🔥", title: "3連勝", desc: "3連勝を達成する", check: s => s.maxStreak >= 3 },
  { id: "streak5", icon: "🔥", title: "5連勝", desc: "5連勝を達成する", check: s => s.maxStreak >= 5 },
  { id: "streak10", icon: "🔥", title: "10連勝", desc: "10連勝を達成する", check: s => s.maxStreak >= 10 },
  { id: "first_draw", icon: "🤝", title: "痛み分け", desc: "初めて引き分ける", check: s => s.draws >= 1 },
  { id: "first_loss", icon: "😢", title: "経験値", desc: "初めて敗北する", check: s => s.losses >= 1 },
  { id: "play_pvp", icon: "👥", title: "2人対戦デビュー", desc: "2人対戦を1回プレイする", check: s => s.pvpPlayed },
  { id: "dark_mode", icon: "🌙", title: "夜派", desc: "ダークモードを使う", check: s => s.darkModeToggled },
  { id: "timeout_once", icon: "⏰", title: "時間切れ", desc: "タイムアタックで時間切れを経験する", check: s => s.timeoutExperienced },
  { id: "speed_win3", icon: "⚡", title: "最速勝利", desc: "3並べを最短3手で勝利する", check: s => s.fastestWin[3] !== null && s.fastestWin[3] <= 3 },
  { id: "play10", icon: "📈", title: "コツコツ", desc: "累計10戦プレイする", check: s => s.totalGames >= 10 },
  { id: "play100", icon: "💯", title: "100戦達成", desc: "累計100戦プレイする", check: s => s.totalGames >= 100 },
  { id: "play500", icon: "🏆", title: "500戦達成", desc: "累計500戦プレイする", check: s => s.totalGames >= 500 },
  { id: "board_full_block", icon: "🧩", title: "隙間なし", desc: "ランダムブロックで盤面がほぼ埋まって引き分ける", check: s => s.boardFullBlockDraw },
  { id: "complete_all", icon: "🌟", title: "コンプリート", desc: "他の全実績を解除する", check: s => ACHIEVEMENTS.filter(a => a.id !== "complete_all").every(a => s.unlocked.includes(a.id)) }
];

// 新しく解除された実績を返す
function checkAchievements(stats) {
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (!stats.unlocked.includes(a.id) && a.check(stats)) {
      stats.unlocked.push(a.id);
      newly.push(a);
    }
  }
  if (newly.length) saveStats(stats);
  return newly;
}

function showToast(text) {
  const area = document.getElementById("toast-area");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  area.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function showAchievementToasts(newly) {
  newly.forEach((a, i) => {
    setTimeout(() => showToast(`🏆 実績解除: ${a.title}`), i * 600);
  });
}

function renderAchievementsModal(stats) {
  const unlockedCount = stats.unlocked.length;
  const items = ACHIEVEMENTS.map(a => {
    const on = stats.unlocked.includes(a.id);
    return `<div class="ach-item ${on ? "unlocked" : ""}">
      <span class="ach-icon">${on ? a.icon : "🔒"}</span>
      <div>${on ? a.title : "？？？"}</div>
      <div style="opacity:.7;margin-top:2px;">${on ? a.desc : "未解除"}</div>
    </div>`;
  }).join("");
  return `
    <h2>🏆 実績</h2>
    <div class="ach-progress">${unlockedCount} / ${ACHIEVEMENTS.length} 解除</div>
    <div class="ach-grid">${items}</div>
  `;
}

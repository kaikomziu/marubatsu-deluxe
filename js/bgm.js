// BGMジュークボックス
// assets/bgm/ に mp3 を追加していくたびに、このリストへ1行足すだけで選択肢に増える。
const BGM_TRACKS = [
  { id: "menu", title: "メインテーマ", desc: "タイトル・モード選択画面向け", file: "assets/bgm/menu.mp3" },
  { id: "normal", title: "対局(ノーマル)", desc: "落ち着いた通常対局用", file: "assets/bgm/normal.mp3" },
  { id: "tense", title: "緊迫(ミゼール/タイムアタック)", desc: "スリルのある対局用", file: "assets/bgm/tense.mp3" },
  { id: "playful", title: "コミカル(ワイルド/重ね取り)", desc: "遊び心のある対局用", file: "assets/bgm/playful.mp3" },
  { id: "gravity", title: "重力モード", desc: "低音が効いたグルーヴ系", file: "assets/bgm/gravity.mp3" },
  { id: "victory", title: "勝利ジングル", desc: "短い勝利ファンファーレ", file: "assets/bgm/victory.mp3" },
  { id: "draw", title: "引き分けジングル", desc: "短いコミカルなジングル", file: "assets/bgm/draw.mp3" },
  { id: "lose", title: "敗北ジングル", desc: "短いガッカリジングル", file: "assets/bgm/lose.mp3" }
];

const BGM_STATE_KEY = "marubatsu_bgm_v1";
let bgmAudioEl = null;
const bgmMissingIds = new Set();

function defaultBgmState() { return { trackId: null, mode: "off", volume: 60, muted: false }; }

function loadBgmState() {
  try {
    const raw = localStorage.getItem(BGM_STATE_KEY);
    if (!raw) return defaultBgmState();
    return Object.assign(defaultBgmState(), JSON.parse(raw));
  } catch (e) {
    return defaultBgmState();
  }
}
function saveBgmState(state) { localStorage.setItem(BGM_STATE_KEY, JSON.stringify(state)); }

function initBgmPlayer() {
  bgmAudioEl = document.getElementById("bgm-audio");
  const state = loadBgmState();
  bgmAudioEl.volume = state.muted ? 0 : state.volume / 100;
  bgmAudioEl.addEventListener("error", onBgmError);
  bgmAudioEl.addEventListener("ended", onBgmEnded);
  // 自動再生はブラウザの制限で失敗するため、選択操作(ユーザー操作)があるまでは待機する。
}

function findTrack(id) { return BGM_TRACKS.find(t => t.id === id); }

function playBgmTrack(trackId) {
  const track = findTrack(trackId);
  if (!track) return;
  const state = loadBgmState();
  state.trackId = trackId;
  state.mode = "select";
  saveBgmState(state);
  bgmAudioEl.loop = true;
  bgmAudioEl.src = track.file;
  bgmAudioEl.play().catch(() => { /* ユーザー操作前など: 無視 */ });
}

function playRandomTrack() {
  const available = BGM_TRACKS.filter(t => !bgmMissingIds.has(t.id));
  if (!available.length) return;
  const track = available[Math.floor(Math.random() * available.length)];
  const state = loadBgmState();
  state.trackId = track.id;
  saveBgmState(state);
  bgmAudioEl.loop = false;
  bgmAudioEl.src = track.file;
  bgmAudioEl.play().catch(() => {});
}

function startBgmShuffle() {
  const state = loadBgmState();
  state.mode = "shuffle";
  saveBgmState(state);
  playRandomTrack();
}

function stopBgm() {
  const state = loadBgmState();
  state.mode = "off";
  state.trackId = null;
  saveBgmState(state);
  bgmAudioEl.pause();
  bgmAudioEl.removeAttribute("src");
}

function setBgmVolume(vol) {
  const state = loadBgmState();
  state.volume = vol;
  saveBgmState(state);
  bgmAudioEl.volume = state.muted ? 0 : vol / 100;
}

function toggleBgmMute() {
  const state = loadBgmState();
  state.muted = !state.muted;
  saveBgmState(state);
  bgmAudioEl.volume = state.muted ? 0 : state.volume / 100;
  return state.muted;
}

function onBgmEnded() {
  const state = loadBgmState();
  if (state.mode === "shuffle") playRandomTrack();
}

function onBgmError() {
  const state = loadBgmState();
  if (state.trackId) bgmMissingIds.add(state.trackId);
  const track = findTrack(state.trackId);
  showToast(`🎵 「${track ? track.title : state.trackId}」はまだファイルが準備されていません`);
  if (state.mode === "shuffle") playRandomTrack();
}

function bgmModalHtml() {
  const state = loadBgmState();
  const rows = BGM_TRACKS.map(t => `
    <button class="bgm-track-btn ${state.mode === "select" && state.trackId === t.id ? "active" : ""}" data-track="${t.id}">
      <span class="bgm-track-title">${bgmMissingIds.has(t.id) ? "🚫 " : "🎵 "}${t.title}</span>
      <span class="bgm-track-desc">${t.desc}</span>
    </button>
  `).join("");
  return `
    <h2>🎵 BGM選択</h2>
    <p class="bgm-hint">好きな曲を選ぶと対局中もループ再生されます。「おまかせ」で全曲シャッフル再生も可能。曲データは <code>assets/bgm/</code> に追加され次第、順次再生できるようになります。</p>
    <div class="bgm-controls">
      <button id="bgm-shuffle-btn" class="text-btn ${state.mode === "shuffle" ? "active" : ""}">🔀 おまかせ再生</button>
      <button id="bgm-stop-btn" class="text-btn">⏹ 停止</button>
    </div>
    <div class="bgm-track-list">${rows}</div>
    <div class="bgm-volume-row">
      <button id="bgm-mute-btn">${state.muted ? "🔇" : "🔊"}</button>
      <input type="range" id="bgm-volume-slider" min="0" max="100" value="${state.volume}">
    </div>
  `;
}

function bindBgmModalEvents() {
  document.querySelectorAll(".bgm-track-btn").forEach(b => {
    b.addEventListener("click", () => {
      playBgmTrack(b.dataset.track);
      openModal(bgmModalHtml());
      bindBgmModalEvents();
    });
  });
  document.getElementById("bgm-shuffle-btn").addEventListener("click", () => {
    startBgmShuffle();
    openModal(bgmModalHtml());
    bindBgmModalEvents();
  });
  document.getElementById("bgm-stop-btn").addEventListener("click", () => {
    stopBgm();
    openModal(bgmModalHtml());
    bindBgmModalEvents();
  });
  document.getElementById("bgm-mute-btn").addEventListener("click", () => {
    toggleBgmMute();
    openModal(bgmModalHtml());
    bindBgmModalEvents();
  });
  document.getElementById("bgm-volume-slider").addEventListener("input", (e) => {
    setBgmVolume(parseInt(e.target.value, 10));
  });
}

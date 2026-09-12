/* ============================================================
   ○×DELUXE — オンライン対戦 (Supabase RPC + ポーリング)
   共有プロジェクト kifnzvktwbomxthzvvgy。接頭辞 mb_ のみ使用。

   設計: ○×ゲームには相手に隠す情報が無いため、盤面ロジック(勝敗判定)は
   サーバーへ持たせず、両クライアントが同じ指し手列を再生して
   js/game.js の既存ロジックで結果を出す「信頼できるクライアント」方式。
   サーバー(mb_matches)はマッチング・指し手の中継・生存確認だけを担う。
   ============================================================ */
(function () {
  "use strict";
  const MB = (window.MB = window.MB || {});

  const SB_URL = "https://kifnzvktwbomxthzvvgy.supabase.co";
  // 他サイトと同じ JWT 形式 anon key(publishable key だと INSERT/RPC が弾かれることがある)
  const SB_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpZm56dmt0d2JvbXh0aHp2dmd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzgxMzgsImV4cCI6MjA5MzQxNDEzOH0.M7nXP-u--6J_6rRpgz1cJj21_7KX6MtfTmZy77Xf_IE";

  let sb = null;
  try {
    if (window.supabase) {
      sb = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: "Bearer " + SB_KEY } },
      });
    }
  } catch (e) { console.error("supabase init", e); }
  MB.sb = sb;
  MB.online = !!sb;

  MB.pid = function () {
    let id = localStorage.getItem("mb_pid");
    if (!id) {
      id = "p_" + (self.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem("mb_pid", id);
    }
    return id;
  };
  MB.getName = function () {
    let n = localStorage.getItem("mb_name");
    if (!n) { n = "プレイヤー" + (1000 + ((Math.random() * 9000) | 0)); localStorage.setItem("mb_name", n); }
    return n;
  };
  MB.setName = function (n) {
    n = (n || "").trim().slice(0, 12);
    if (n) localStorage.setItem("mb_name", n);
    return MB.getName();
  };

  MB.genRoomCode = function () {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい 0/O, 1/I は除外
    let s = "";
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };

  async function rpc(fn, args) {
    if (!sb) throw new Error("オフライン");
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data;
  }

  MB.net = {
    matchmake: (size, mode) => rpc("mb_matchmake", { p_player: MB.pid(), p_name: MB.getName(), p_size: size, p_mode: mode }),
    room: (code, size, mode) => rpc("mb_room", {
      p_code: code, p_player: MB.pid(), p_name: MB.getName(), p_size: size || null, p_mode: mode || null,
    }),
    init: (id, initObj) => rpc("mb_init", { p_match: id, p_player: MB.pid(), p_init: initObj }),
    move: (id, moveObj) => rpc("mb_move", { p_match: id, p_player: MB.pid(), p_move: moveObj }),
    state: (id) => rpc("mb_state", { p_match: id, p_player: MB.pid() }),
    rematch: (id) => rpc("mb_rematch", { p_match: id, p_player: MB.pid() }),
    leave: (id) => rpc("mb_leave", { p_match: id, p_player: MB.pid() }),
    forfeit: (id) => rpc("mb_forfeit", { p_match: id, p_player: MB.pid() }),
  };
})();

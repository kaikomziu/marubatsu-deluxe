// 更新履歴（新しい順）
const VERSION = "1.1.0";

const CHANGELOG = [
  {
    version: "1.1.0",
    date: "2026-08-26",
    notes: [
      "特殊モード「🔺 重ね取り」を追加",
      "駒に小・中・大のサイズが登場。大きい駒は小さい駒の上に重ねて乗っ取れる",
      "重ね取り専用のCPU AIを実装（4段階の強さに対応）",
      "重ね取り関連の実績を2種類追加（実績は全32種に）"
    ]
  },
  {
    version: "1.0.0",
    date: "2026-08-26",
    notes: [
      "初回リリース",
      "3並べ・4並べ・5並べに対応",
      "特殊モード「ミゼール」「重力」「ワイルド」「ランダムブロック」「タイムアタック」を追加",
      "CPU対戦（弱い/普通/強い/激強）と2人対戦に対応",
      "実績30種類を実装",
      "ダークモード対応"
    ]
  }
];

function renderVersionFooter() {
  const el = document.getElementById("version-text");
  if (el) el.textContent = `v${VERSION}`;
}

function renderChangelogModal() {
  return CHANGELOG.map(entry => `
    <div class="changelog-entry">
      <span class="changelog-ver">v${entry.version}</span>
      <span class="changelog-date">${entry.date}</span>
      <ul>${entry.notes.map(n => `<li>${n}</li>`).join("")}</ul>
    </div>
  `).join("");
}

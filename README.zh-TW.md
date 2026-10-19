# Agent Board

用一個本機看板查看各 agent 的工作、問題與下一步。從你正在使用的 agent 開始，不必先安裝 Claude Code。

[![版本 0.23.0](https://img.shields.io/badge/version-0.23.0-blue)](CHANGELOG.md) [![MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[English](README.md) · 繁體中文 · [简体中文](README.zh-CN.md)

- 按專案查看工作，優先顯示問題與阻擋。
- 勾選手動步驟、封存工作、複製回覆，將問題標成已讀或還原。
- 原生 hooks 更新活動狀態；agent 明確回報自己的任務步驟。
- 卡片對應到在線的確切 session 才能傳訊，收到真正回覆才確認送達。

## 快速開始

<details open>
<summary><b>讓 agent 幫你安裝</b></summary>

將這段貼給你使用的 agent：

```text
請從 https://github.com/WenyuChiou/agent-board 在這台電腦安裝 Agent Board。
讀取 AGENTS.md、README 與 docs/SETUP.md，辨識目前 host 和其他已安裝的 coding agent，先預覽 node scripts/setup-agent.mjs。
保留既有設定與共用進度路徑。遵循我對永久變更的核准要求，再安裝適用的 hooks、plugin 與看板 skill；不要要求或呼叫另一家 AI 才能初始化。
完成必要的限定信任、讀回設定，讓目前 session 回報自己的真實進度，並開啟互動看板。
分開驗證 CLI、桌面 App 和 IDE 的真實 hook 事件。安裝完成、進度回報與訊息送達是不同的驗收。
列明哪些 session 要重新載入，以及哪些 adapter 尚未支援或驗收。不要掃描私密對話，也不要默默略過阻擋。
```

</details>

或使用 Node.js 18+ 與 Git：

```sh
git clone https://github.com/WenyuChiou/agent-board.git
cd agent-board
node scripts/setup-agent.mjs
# 檢查並核准計畫後：
node scripts/setup-agent.mjs --apply
```

安裝器辨識設定目標，不代表 agent 正在執行。它安裝看板與現有 adapter，不會安裝 AI 應用程式。新安裝預設使用 `~/.agent-board/progress.md`，既有安裝保留原路徑。[安裝與移除](docs/SETUP.md)。

## 支援的 agent

| Host／介面 | 目前範圍 |
| --- | --- |
| Codex | 獨立安裝、六個 hooks 與自身 thread 回報。已驗證獨佔 app-server 的原生 hooks／ACK；CLI TTY、桌面 App 自動 hooks 與收訊仍須各自驗收。 |
| Antigravity CLI | 獨立安裝、四個原生 hooks 與獨佔 stream 傳訊，已在 Windows 實測。App／IDE 另行驗收。 |
| Cursor、OpenCode、Grok Build、Muse Code | 可產生獨立 hooks 或 plugin；原生執行與收訊依 host 而異，不能只憑安裝判定通過。 |
| Hermes Agent、OpenClaw | 看板與 skill；獨立生命週期 adapter 待完成。 |
| Claude Code | 選用原生側欄、Task 鏡像與 plugin 連接流程。 |
| dot 與其他網頁 agent | 明確進度轉送；尚未驗證原生收訊。 |

詳見 [adapter 範圍](docs/SETUP.md#native-status-adapters)、[各介面傳訊能力](docs/MESSAGING.md#agent-and-surface-support)及[原生驗收紀錄](docs/validation/2026-10-19-native-hooks.md)。

<details>
<summary>舊 Gemini CLI 相容性</summary>

目前一般使用者入口是 Antigravity CLI。獨立的 `--agent gemini` 保留給仍受支援的企業／API host，不是 Antigravity 別名。[Google 轉換公告](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)。

</details>

## 每個 agent 裡都看得到看板

請已安裝的 Agent Board skill 開啟看板（Codex 使用 `$agent-board`，OpenCode 使用 `/board`），或執行：

```sh
node ~/.agent-board/agent-board.mjs --serve
```

Windows 或自訂安裝請使用安裝器印出的確切路徑。`--watch` 是終端互動看板，`--chat` 輸出精簡文字，`--html` 產生唯讀網頁。[使用指南](docs/GUIDE.zh-TW.md#每個-agent-裡都看得到看板)。

### 看板的網頁

`--serve` 開啟互動網頁，可勾選手動步驟、封存、匯入有效進度區塊、複製回覆、標記已讀及還原；目前沒有通用任務編輯表單。只有確切 session 的 adapter 在線時才顯示**傳送**；離線卡片保留**複製**及可用的**複製續接指令**。[啟用傳訊](docs/MESSAGING.md)。

關閉分頁不會停止服務，再執行同一命令即可重開；**關閉看板**才會停止。預設不會閒置關閉，`--idle-minutes 30` 才啟用。`--lan` 為選用功能，另有存取限制，詳見[安全說明](SECURITY.md)。

## 選用 Claude Code 側欄

需要 Claude Code 2.1.287+（離線 CI 使用 2.1.301）：

```sh
claude plugin marketplace add WenyuChiou/agent-board
claude plugin install agent-board@agent-board
```

開啟 Claude Code 後使用 `/progress`。Task 鏡像、快速新增、報告、通知與 `/progress connect` 屬於 plugin 功能；其他 agent 可獨立初始化。[使用指南](docs/GUIDE.zh-TW.md)。

## 文件

[安裝](docs/SETUP.md) · [指南](docs/GUIDE.zh-TW.md) · [Codex](docs/CODEX.md) · [傳訊](docs/MESSAGING.md) · [檔案格式](docs/FORMAT.md) · [遠端回報](docs/REMOTE_REPORTERS.md) · [開發](CONTRIBUTING.md)

回報問題請提供看板／host 版本、CLI／App／IDE 介面及合成重現資料。不要上傳私密對話、憑證或含 token 的看板連結。

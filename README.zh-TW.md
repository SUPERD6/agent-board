# claude-progress-pane

Claude Code 的 Mod：在對話右邊開一個面板，用白話列出每個專案正在做的事和步驟，不用手動改任何檔。English: [README.md](README.md).

- **自動同步**：把 Claude 自己的 Task 清單（TaskCreate / TaskUpdate / TodoWrite）寫進 `~/.claude/progress.md`，每個對話一段。做完半天後移到當月的 `progress-archive-YYYY-MM.md`。
- **壓縮後接得上**：對話被壓縮時，摘要會保留清單，壓縮後補一段：目標、完成幾步、正在做哪步、接下來。
- **知道其他對話**：每段記錄那個對話在做、等你、做完，還是沒做完就結束。新對話第一輪會知道同專案還沒做完的事。
- **規則自己帶**：怎麼用 Task 清單的規則由 Mod 加進系統提示，不寫進 `CLAUDE.md`，移除後不留東西。
- **可以點**：列可以展開看步驟；完成這步、交給 Claude、接手做完、完成、繼續、封存；底下的框可以問一句，答案顯示在面板，不打斷 Claude。

## 安裝

需要 Claude Code 2.1.287 以上。

    claude plugin marketplace add WenyuChiou/claude-progress-pane
    claude plugin install project-progress@claude-progress-pane

再跑一次設定腳本：在 `settings.json` 打開 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`（新模型預設沒有 Task 工具，沒有它面板就沒東西可同步），並把舊的 zip 版換掉。

Windows：

    powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\plugins\marketplaces\claude-progress-pane\scripts\setup.ps1"

macOS / Linux：

    bash ~/.claude/plugins/marketplaces/claude-progress-pane/scripts/setup.sh

重開 Claude Code。面板會自己開；`/progress` 重新打開。

**私人 repo**：Claude Code 用本機的 git 認證 clone，而且不會跳出登入。加不進去時先跑一次 `gh auth login` 和 `gh auth setup-git`；沒有 GitHub SSH key 的電腦再設 `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`。

### 從 zip 版換過來

設定腳本會處理，可以重跑：

- 把 `~/.claude/mods/project-progress` 從 `CLAUDE_CODE_PLUGIN_DIRS` 拿掉，免得載入兩份。
- 把 `CLAUDE.md` 裡 `<!-- project-progress:start/end -->` 那段拿掉（規則改由 Mod 帶）；`comm-style` 等其他段落不動。
- 改過的檔先備份成 `<檔名>.bak`。不刪資料夾：確認新版能用後，自己刪 `~/.claude/mods/project-progress`。
- `progress.md` 和封存檔照常讀，不用搬。

如果你的 Claude Code 由組織統一管理，自己裝的外掛不會收到壓縮和系統提示的 hook：加 `-KeepRule`（bash 用 `--keep-rule`）把規則留在 `CLAUDE.md`；壓縮後補進度那段在那種環境用不了。

## 更新

第三方 marketplace 預設不自動更新：

    claude plugin marketplace update claude-progress-pane
    claude plugin update project-progress@claude-progress-pane

然後重開，或在對話裡打 `/reload-plugins`。想自動更新：`/plugin` → Marketplaces → claude-progress-pane → Enable auto-update。

## 使用

照常工作。兩步以上的事 Claude 會列 Task 清單，面板跟著走。

- `/progress` 打開面板；`/progress 整理` 立刻封存做完的；`/progress 同步` 重讀 Task 清單。
- 等你處理的步驟顯示在「等你處理」，按「完成」打勾。
- 不在程式專案裡的事直接寫進同一個檔：

      ## 求職
      ### Google 暑期實習
      > 截止 10-31
      - [x] 改履歷
      - [?] 推薦信 — 等教授回覆
      - [ ] 投遞

  `[x]` 完成、`[~]` 正在做、`[ ]` 還沒做、`[?]` 等你、`[>]` 在跑、`[!]` 卡住、`[-]` 取消。寫了 `截止 MM-DD` 會出現在「快到期」，剩三天內變紅。

終端機全螢幕版面寬度夠時面板在右邊（自己打開要 144 欄，用 `/progress` 要 110 欄）；在 tmux 裡會在輸入框上方。雲端對話不顯示面板。

## 移除

    claude plugin uninstall project-progress@claude-progress-pane
    claude plugin marketplace remove claude-progress-pane

`progress.md`、封存檔和 `CLAUDE_CODE_ENABLE_TODO_TOOLS` 會留著。

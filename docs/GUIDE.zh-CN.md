# 使用指南

[English](GUIDE.md) · [繁體中文](GUIDE.zh-TW.md) · 简体中文 · [README](../README.zh-CN.md)

## 开始使用

工作交出后由来源明确回报：Claude Task 工具在每个交出的步骤加 `metadata: {"handoffTo":"承接方名称"}`；明确改为 pending／in_progress 可接回。回合摘要用 `HANDOFF` 记录承接方，`NEXT` 保留交出的工作；其他 reporter 写 `[-] 工作 — 已交给承接方`。来源保留取消项目，不再提示 Continue，也不重复计入承接方的工作。交接计划、发出消息、模型摘要或进度更新都不证明送达，也不批准动作。

使用 Node.js 18+ 与 repository checkout。永久变更先预览、批准再应用：

```sh
node scripts/setup-agent.mjs
node scripts/setup-agent.mjs --apply
```

自动检测识别 host 配置，不代表 session 在线。尚无配置的已知 host 可用 `--agent <name>`；`--agent all` 预览全部目标，不会安装 AI 应用。[安装说明](SETUP.md)列出路径与 adapter 范围。

新独立安装使用 `~/.agent-board/progress.md`，现有安装保留原文件；`--progress-file /absolute/path/progress.md` 可明确指定。普通本地安装不需选择另一台电脑的看板。

读回定义，完成 host 的信任／启用。Codex 可在用户批准后执行限定信任，详见 [Codex](CODEX.md)。已打开的 session 可能需要重新加载。CLI、桌面 App、IDE 分别验收。

## 其他 agent

共享安装器写入看板、skill 及已实现的原生 adapter，不需要 Claude Code 或另一个模型。[支持范围](SETUP.md#native-status-adapters)会区分已安装与待实现项目。

支持的提示 hook 会在下次收件箱轮询时，把已有 agent 的问题标为已回答并切回工作中，不调用模型。旧版收件箱事件若来源时间较旧、相同、不明或无效，就不更改，也不创建或恢复区块。回执必须读回确认才移除收件箱输入，失败会保留重试。`/progress connect` 更新 hooks，`connect remove` 一并移除；OpenClaw 必须由 host 明确标示 `external_user` 来源。[提示事件契约与检查](validation/2026-10-19-prompt-hooks.md)列出支持范围及限制。

只读预览会略过提示元数据，保留尚未整理的汇报与问题。单凭提示时间或文件修改时间，不能证明汇报已处理。

OpenClaw、DeepSeek Harness 已有独立状态 plugin 与原生 skill；Grok 新提示会切回工作中，OpenCode 遵循配置目录覆盖。[跨 host 验收](validation/2026-10-19-portable-hosts.md)区分隔离回调／SDK 检查与未执行的原生测试。hooks 不会安装收信通道；接到同一私有消息目录的 agent 共享回执与去重记录，任务归档不会清掉消息 ID。

原生 hooks 汇报活动，不推测任务步骤。Codex Stop、Antigravity Stop 代表等待下一轮，不是对话关闭或任务完成。原生新提示／启动会重新激活同一区块。任务标题、步骤、阻塞及完成由 agent 明确汇报，且只能绑定自身可证明的 session。缺少 host context 时，不猜 ID、不读对话来拼凑汇报。

旧进度卡片不能证明进程仍在运行；应用开着，也不能证明该 session 已加载 hooks 或注册消息 adapter。[原生验收记录](validation/2026-10-19-native-hooks.md)分别记录这些能力。

## 每个 agent 里都看得到看板

使用已安装的 skill，或安装器打印的确切程序路径：

```sh
node ~/.agent-board/agent-board.mjs --serve
node ~/.agent-board/agent-board.mjs --watch
node ~/.agent-board/agent-board.mjs --chat
node ~/.agent-board/agent-board.mjs --html
```

| 模式 | 结果 |
| --- | --- |
| `--serve` | 交互网页与可复用的本地后台服务 |
| `--watch` | 终端看板：方向键／Enter 选择，`x` 勾选，`a` 归档，`h` 隐藏，`u` 恢复，`i` 闲置工作，`c` 复制，`o` HTML，`q` 退出 |
| `--chat` | 精简文字；不开网页、链接或浏览器、不写文件 |
| `--html` | 生成并打开只读网页，不能发消息 |

聊天模式先列问题，再列尚未整理的进度汇报与来源时间。汇报不代表工作完成或连接在线；已领取或处理的收件文件不会重复显示，也不会只因 hook 时间更新就隐藏待处理汇报。超长内容会显示省略数量，聊天模式不写文件。

加上 `--lang en`、`zh-TW` 或 `zh-CN` 选择语言。Windows／自定义安装请使用实际打印的完整路径。Codex 的入口是 `$agent-board`，OpenCode 安装 `/board`；其他 host 须先加载已安装的 skill／command。

### 看板的网页

已隐藏的同一问题不会因其他步骤移动或空白变化而重现。相同文字的问题各有标识；数量改变时无法确定对应，因此会重新显示，不会继承另一题的隐藏标记。看板观察到问题已解决或移除后，再次提出会得到新的标识；若报告直接以完全相同的文字重新提问、没有可观察的状态变化，看板无法推断这次更新。仍可使用「重新显示」。隐藏不代表回答、批准、完成或消息送达。

Claude 明确再次提问时，即使文字相同，也会更新该问题的标识，不需等中间的重新整理。进度文件会随该步骤保留一个修订注记，看板不显示这项 metadata；其他已隐藏的问题和无关更新维持原标识。上述观察限制仅适用于既无状态转换、也无提问来源修订信号的报告。

本地标识记录存于 `progress.md` 旁的 `progress-questions.json`，与 `progress-answered.json` 分开；移动看板时请保留两者。旧的按位置标记会在完整报告稳定后迁移，仅保留同一范围内规范化文字唯一相符的问题；重复或无法对应的原始标记仍保留，但不隐藏未来的新问题。迁移标记可避免标识文件的写入丢失后错用旧标记。标识文件损坏或无法写入时保留原文件，新的隐藏操作会显示失败。聊天与单次读取不写迁移文件；这项标识记录尚未实现另外的 3／7 天未回答问题政策。

备份或移动时也请保留 `progress-questions-retired-*.json` 与 `progress-questions-consumed-*.json`。这些不可变记录只含版本、种类与不透明哈希，避免旧文件写入让已退役的标识或已迁移的隐藏标记复活。它们不随时间或工作归档而删除。记录无法读取、不完整或无法写入时，先停用隐藏直到存储恢复；宁可多显示问题，也不错用旧标记。

侧栏、终端和网页以任务和 agent 识别工作，不显示连接清单或对话 ID；支持的续接命令仅在操作时复制。

问题排最前面，展开工作可看步骤。可勾选手动步骤、归档、贴入有效区块、复制回复或续接命令、标记已读及恢复。已读只改本地隐藏列表，不传话；实质不同的新问题会再出现。当前没有通用任务编辑表单。

贴入进度保留来源时间。重复内容不变更；较旧或同时间冲突的进度会拒绝。无效或超前的时钟须先修正；原有进度时间不明时，须比较两份内容后确认取代。修复方式见[远程汇报](REMOTE_REPORTERS.md)。

卡片只有在确切 session 的 adapter 在线时提供发送，否则复制或自行打开 agent。[消息说明](MESSAGING.md)区分设置、真正回复、重复、冲突及超时。安装不会任意接管已打开的对话，普通回复也不能批准工具、信任或 PR 合并。

关标签页不会停止本地服务，再运行同一 `--serve` 即可重开。**关闭看板**才会停止；若正在发送，请等完成。默认不会闲置关闭，`--idle-minutes 30` 才启用。旧版 `--allow-resume` 会明确启用已结束 Codex／Grok 的重新启动，默认关闭，也不会用作实时消息的回退路径。

`--lan` 为可选功能：私人网络上另一个含 token 的 HTTP 链接，不允许 agent 发消息，闲置 10 分钟关闭该监听器；仍可修改看板文件。token 不会加密，开放前请读[安全说明](../SECURITY.md)。

## 进度文件

`progress.md` 是存储数据，不是 UI。每个 agent 拥有自己的区块，不覆盖其他 session。格式支持英、繁中、简中关键词，标记、所有权与写入读回规则见 [FORMAT](FORMAT.md)。

共享文件不会自动跨机同步。[远程汇报](REMOTE_REPORTERS.md)是另外选择的流程。`dot` 标签或贴上的区块不能证明真正 dot 已连接。

## 可选 Claude Code 侧栏

需要 Claude Code 2.1.287+；离线 CI 使用 2.1.301：

```sh
claude plugin marketplace add WenyuChiou/agent-board
claude plugin install agent-board@agent-board
```

打开新 Claude Code session，使用 `/progress`。侧栏镜像 Task 工具，也可通过它的模型整理回合。问题与决策显示于任务上方；侧栏跟随 Claude 主题，浏览器跟随系统主题。

| 命令／输入 | 操作 |
| --- | --- |
| `/progress connect`、`connect status`、`connect remove` | 可选 plugin 连接、上次状态、移除 |
| `+ 求职: 研究驻点 截止 11-20; 草稿; 提交` | 侧栏快速新增，也可用 `/progress add …` |
| `/progress open` | 生成并打开只读 `progress.html` |
| `/progress tidy`、`/progress sync` | 归档符合条件工作；重读 Task／PR |
| `/progress report`、`/progress today` | 复制周报／日报 |
| `/progress lang en`、`zh-TW`、`zh-CN`、`auto` | 侧栏语言 |
| `/progress notify on`、`off` | 桌面通知 |

可选的 `scripts/setup.sh`／`scripts/setup.ps1` 处理 Claude 专用 Task 工具／profile 与 marketplace 配置。修改 profile 前先检查范围；独立安装不需要这些脚本。旧 plugin inbox 连接器可保留对话数据并调用 Claude 整理，和只记活动 metadata 的独立 hooks 不同。[安全说明](../SECURITY.md)。

## 它怎么保持整齐

可选侧栏在 session 开始与每小时清理：完成区块等 12 小时，其他已停／过时区块等三天，已观察完成的手动工作等 24 小时。明确整理可跳过完成工作的等待。工作中或等待中的 agent 区块，最后写入后 12 小时内仍算运行中；侧栏、终端与网页会说明暂不能归档，整理也会保留。停止或结束后，展开工作即可立即归档。

超过 12 小时没汇报的卡片可能显示已停，这是数据过时判断，不是原生进程检查；真正新事件／汇报会刷新。超过七天没动的工作折叠，不修改区块；`--all` 或闲置开关可展开，快到期的工作保留显示。

## 更新和卸载

独立安装：将干净 checkout 更新到指定版本，预览 `node scripts/setup-agent.mjs`，再应用已批准范围。修改过的文件列为冲突，不覆盖。host 可能要重新加载；不安装自动更新器或开机服务。

用已安装程序预览／应用目标移除：

```sh
node ~/.agent-board/agent-board.mjs --codex-remove --agent <name>
node ~/.agent-board/agent-board.mjs --codex-remove --agent <name> --apply
```

`--codex-remove`、`--codex-doctor` 是沿用的维护名称，可搭配各目标。先关闭该看板。只移除未修改的自有定义／文件；其他目标还需要的共享文件保留，进度、session 记录、归档、日志及用户修改也保留。

可选 plugin 请先在仍安装时运行 `/progress connect remove`，完成报告的清理后，再运行 `claude plugin uninstall agent-board@agent-board`；marketplace 用 `claude plugin marketplace remove agent-board` 移除。更新用 `claude plugin marketplace update agent-board`、`claude plugin update agent-board@agent-board`，之后重新加载 plugin。

### 从旧名称换过来

0.10 前的可选 plugin 名称是 `project-progress@claude-progress-pane`。移除旧 plugin／marketplace，安装上方新名称；若使用其连接器，再于 Claude Code 内运行 `/progress connect`。保留原进度文件。独立安装不需要 Claude 迁移。

## 问题排查

- **没卡片：** 检查路径、adapter、信任与重新加载；观察真正事件并读回确切 session 区块，不手动制造事件宣称通过。
- **不能发送：** 确切原生 session 需要受支持的在线 adapter，hooks 本身不等于可收信，桌面与 CLI 结果不可互代。
- **接线转述被忽略：** 接收者应告知授权或阻塞原因；RPC 成功或 ACK 不等于已观察到新进度。
- **读写失败：** 处理指出的文件／权限问题，检查进度与历史再重试；不先确认 owner 就删锁。
- **没有原生侧栏：** 非 Claude host 使用交互网页或终端看板，网页面板不等于原生侧栏。

### 安全地报告问题

提供 Agent Board／host 版本、CLI／App／IDE、OS 与合成复现数据；只有可选 plugin 才需要 Claude 版本。不上传原始进度、inbox、归档、日志、session log、凭证或看板 token。[安全报告](../SECURITY.md#reporting-a-problem)。

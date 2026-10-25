# Issue tracker：本地 Markdown

本项目的 issues 和 specs 作为 Markdown 文件存放在 `.scratch/` 中。

## 文件约定

- 每个 feature 一个目录：`.scratch/<feature-slug>/`。
- Spec：`.scratch/<feature-slug>/spec.md`。
- 每个 implementation issue 单独一个文件：
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号。
- Triage 状态写在 issue 顶部附近的 `Status:` 行；
  状态名称见 `docs/agents/triage-labels.md`。
- 评论与讨论历史追加到文件底部的 `## Comments` 下。

## 发布和读取

当 skill 要求 “publish to the issue tracker” 时，
在上述目录中创建对应文件，必要时创建目录。

当 skill 要求 “fetch the relevant ticket” 时，
读取指定路径的文件；只有编号时，在对应 feature 的 issues 目录中定位。

## Wayfinding 操作

供 `/wayfinder` 使用：

- Map：`.scratch/<effort>/map.md`，包含 Notes、
  Decisions-so-far 和 Fog。
- Child ticket：`.scratch/<effort>/issues/NN-<slug>.md`。
  正文记录问题，`Type:` 为 research、prototype、grilling 或 task。
- Blocking：顶部附近用 `Blocked by: NN, NN` 记录依赖。
  所有依赖均为 resolved 时，该任务解除阻塞。
- Frontier：选择尚未解决、未被认领且未被阻塞的任务，
  按编号取第一个。
- Claim：开始工作前，将 `Status:` 设为 claimed 并保存。
- Resolve：将答案追加到 `## Answer`，将 `Status:` 设为 resolved，
  再向 map 的 Decisions-so-far 追加摘要与链接。

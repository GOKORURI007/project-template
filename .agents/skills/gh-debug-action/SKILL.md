---
name: gh-debug-action
description: 用 gh 命令定位一次失败的 GitHub Action run，找到失败的 step 和 root cause。
disable-model-invocation: true
---

用 `gh` 命令对一次失败的 GitHub Action run 做 **triage**：定位 run、看 log、识别失败 step、抓 root cause。CLI 是唯一信源——别打开浏览器。

1. **Pick the run** —— 用户给了 run id / URL 直接用。没给时：

   ```bash
   gh run list --limit 10 --json databaseId,displayTitle,status,conclusion,workflowName,createdAt,headBranch
   ```

   筛到对应 workflow，再筛 `conclusion != "success" && status != "in_progress"` 的那一条。若要限定 workflow 名：`gh run list --workflow="<name>" --limit 10 --json ...`。记录 `databaseId`（后面所有命令用它）。

2. **Stream the log** —— 把整次 run 的 log 拉到 stdout 按 step 排好序：

   ```bash
   gh run view <id> --log
   ```

   log 很长的 pipeline 加 `--log` 默认就是完整流；如果只想看某一步，加 `--job <job-id>`（job id 从 `gh run view <id> --json jobs` 里取）。第一次只看尾部通常够：`gh run view <id> --log 2>&1 | tail -200`。**不要**先 `--exit-status` 再 `--log`：那会让 `gh run view` 在非零退出时拒绝输出 log。

3. **Identify the failing step** —— 在 log 里找两类标记：

   - `##[error]Process completed with exit code <N>.` —— 这是 step 的 fail 行，上方紧邻的几行就是 step 自己的 stderr。
   - `##[warning]...` —— 不是失败本身，但常是失败的前兆（如 Node.js 弃用提示之后真正坏的脚本步骤）。

   把失败的 step 名（如 `Pull and overlay external skills`）和它的 exit code 记下来。

4. **Reproduce locally if possible** —— 如果失败出在脚本层（Python、shell），把对应 step 在本地复跑：

   ```bash
   gh run view <id> --log --job <job-id> 2>&1 | sed -n '/<step name>/,/Post /p'
   ```

   复制那段命令到本地 shell 执行。**先**确认不会改远程——本 skill 不涉及 commit / push 步骤，所有命令都是只读。

5. **Re-trigger if appropriate** —— 排查完确认是 transient（schedule race、token 过期、网络抖动）：

   ```bash
   gh workflow run "<workflow 文件名或 display 名>"
   ```

   拿到新 run id 回到第 1 步。如果是 manifest / 脚本本身的 bug——先改文件 → commit → push，再走 `gh workflow run` 重跑。**不要**直接靠 schedule 等待：cron 失败一次后下一次可能隔 24 小时。

6. **Report** —— 把 5 项交付给用户：

   - `<run-url>`（`https://github.com/<owner>/<repo>/actions/runs/<id>`）
   - 失败的 step 名 + exit code
   - 失败那一步 log 的关键 1–3 行（grep `##[error]` 与 `Error:` 取前后 2 行）
   - 已尝试的修复动作（re-run / 本地复现 / 改文件 + push）
   - 留给用户的判断（要 rebase、要换 PAT、要开 issue 等）

完成时：用户拿到的不只是"run 失败了"，而是一个 `<run-url>` + 一个能定位到具体 step 与命令的诊断结论。
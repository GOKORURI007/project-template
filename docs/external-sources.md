# 外部源码管理

管理包只在显式调用时执行外部源码操作。业务 `release` 和 `release:retry` 不触发这些操作。所有任务禁用缓存，Git 失败会返回非零退出码。凭据、网络连接及 Git 自身需要由使用者准备；模板不会修改全局 Git 策略。

## 命令与交互

```sh
turbo submodule
turbo subtree
```

在 Turbo 界面中按 `i` 输入，选择目标、操作并确认。普通管道或自动化可直接调用以下任务；将 `submodule` 换成 `subtree` 使用同样的入口：

```sh
turbo submodule:status
turbo submodule:init -- --target packages/app/vendor
turbo submodule:sync -- --target packages/app/vendor
turbo submodule:update -- --target packages/app/vendor --revision main
turbo submodule:push -- --target packages/app/vendor --remote origin --branch contribution
```

状态查看默认列出全部目标；其他非交互操作必须指定目标。路径相对于项目根目录，可以包含空格。

## Submodule

从原生 `.gitmodules` 发现子项目中的目标，递归发现已初始化 submodule 内的目标。未初始化的嵌套目标需先初始化其父目标。显示来源、父项目记录的提交、初始化状态及目标分支配置。

`init` 和 `sync` 使用原生 `submodule sync` 与 `update --init --checkout`，回到父项目记录的提交；没有 `--remote` 更新语义。目标存在未提交修改时先停止，不覆盖修改。

`update` 单独获取指定 revision 后切换到该提交，输出实际 commit；父项目的 gitlink 变化由使用者审查并提交。默认 revision 取 `.gitmodules` 的 branch，也可以在本地配置覆盖。未指定时明确要求输入。`push` 推送该子仓库的 HEAD，必须明确给出目的分支，不从 detached HEAD 猜测；不会顺便推送父项目。

```json
{
  "schemaVersion": 1,
  "externalSources": [
    {
      "kind": "submodule",
      "path": "packages/app/vendor",
      "pullRevision": "main",
      "remote": "origin",
      "pushRemote": "origin",
      "pushBranch": "contribution"
    }
  ]
}
```

将对应条目合并到根 `project.config.json`。命令行参数优先于本地配置，本地配置优先于原生 branch 默认值。submodule 的地址仍由 Git 原生配置管理。

## Subtree

Subtree 没有 `.gitmodules`；在根 `project.config.json` 明确记录来源及策略：

```json
{
  "schemaVersion": 1,
  "externalSources": [
    {
      "kind": "subtree",
      "path": "packages/app/vendor",
      "source": "https://example.com/team/component.git",
      "revision": "替换为来源仓库的完整提交 ID",
      "pullRevision": "main",
      "pushRemote": "https://example.com/team/component.git",
      "pushBranch": "contribution",
      "squash": true
    }
  ]
}
```

先提交配置。`init` 从固定 revision 接入不存在的目录；`sync` 将选定目录的受管文件恢复到固定 revision 的源码快照，包括回到较旧 revision，不解析上游最新分支。需要修正目录内容时创建新的快照提交，保留原有 Git 历史；目录内已提交的定制仍可从历史恢复。`squash` 影响来源历史的合并方式，不改变固定同步应达到的源码状态。

`update` 才获取 `pullRevision` 的最新提交，使用原生 subtree 合并保留已提交的本地补丁，合并后把实际 commit 写入 `revision`，另行提交来源记录。固定同步回退过源码、但历史中已包含较新提交时，没有本地补丁的目录也能再次推进到上游快照。需要长期保留目录内的定制时使用更新合并流程；固定同步明确恢复记录的源码内容。目录外业务文件不受影响。

这些操作要求父工作区干净。合并冲突保留 Git 的现场供使用者解决；不会自动清理或丢弃变更。若源码合并已完成而记录提交失败，按输出修复配置提交后再继续。

`push` 先按所选目录执行原生 subtree split，然后只推送分离后的历史到明确目的分支；不会用整个父项目代替 subtree。状态显示固定 revision、更新来源、推送目标与策略。需要 Git 的 subtree 子命令可用；缺少时会报告原生错误。

# 发布与恢复

`turbo release` 选择包和版本。存在 Git remote 时，可输入逗号分隔的多个名称，默认 `none` 仅创建本地发布。检查、版本提交和 tag 全部完成后才开始推送。每个 remote 使用原子推送发布分支与本次 tag，不强制覆盖远端。

每个目标的成功或失败单独显示。部分失败时，本地版本、提交和 tag 均保留；修复凭据、网络或 remote 配置后执行：

```sh
turbo release:retry
```

重试只处理尚未完成的目标，沿用原始提交、分支和 tag 对象；即使当前 HEAD 已前进也不会夹带后来工作。不会再次升版或重新创建 tag；本地 tag 被改动时会停止。恢复记录保存在实际 Git 元数据目录的 `template/releases.json`，不污染工作区，多个未完成发布分别保留。该记录属于当前本地仓库，不会随 clone 复制；完成后可以按项目归档策略保存它。

选定 Git remote 时需要处于分支上；detached HEAD 可以只做本地发布。远端必须支持原子推送。没有成功的目标会清晰报错，禁止自动强制推送。

## 自定义发布渠道

根 `project.config.json` 的 `release.publish` 定义全局默认命令，`packages[包名].commands.publish` 优先覆盖它。命令是可执行程序与参数的字符串数组，不使用 shell 拼接；脚本可放在根 `extensions/` 或业务包中，管理包更新不替换这些位置。

```json
{
  "schemaVersion": 1,
  "packages": {
    "@example/node": {
      "commands": { "publish": ["node", "../../extensions/publish.mjs"] }
    }
  }
}
```

只有存在配置并在 release 中明确确认执行时才运行渠道。运行目录为对应业务包，环境提供 `TEMPLATE_RELEASE_PACKAGE`、`TEMPLATE_RELEASE_VERSION`、`TEMPLATE_RELEASE_TAG`、`TEMPLATE_RELEASE_COMMIT`。可以据此接入自己的 registry、发行资产或部署服务；模板没有默认提供方。

渠道也记录逐目标结果，恢复时跳过已成功命令。失败的外部服务可能已完成一部分副作用，请把渠道脚本做成可按 tag 或 commit 重复执行。重试不会恢复成旧工作区：若脚本使用构建产物，应自行校验其对应的发布提交。

业务发布和恢复均不调用 submodule/subtree 推送；外部源码发布需单独执行对应管理任务。

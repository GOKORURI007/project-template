# 更新共享管理包

在根 `project.config.json` 配置同一个模板上游、分支或 tag，以及其中的管理目录：

```json
{
  "schemaVersion": 1,
  "upstream": {
    "repository": "https://example.com/team/project-template.git",
    "ref": "main",
    "directory": "tools/manager"
  }
}
```

模板没有预设实际仓库地址。派生项目可以拥有完全独立的 Git 历史；更新获取的是指定提交下的普通文件，不要求公共祖先、专属分发分支或额外 registry 包。

```sh
turbo manager:check
turbo manager:update
```

`turbo manager:check` 仅预览，可在普通管道或 CI 中使用流式界面：`turbo manager:check --ui=stream`。`turbo manager:update` 使用 Turbo 交互界面，按 `i` 输入并确认应用；可滚动查看日志中的完整 Git 文本差异。也可以在任务名后通过 `-- --source 仓库 --ref 分支或tag --directory 上游目录` 临时传入来源，这些参数不改写项目配置。

向导显示原基线、实际上游 commit、目录中新增／修改／删除的文件、文本差异及手动准备事项。只在显式命令中访问上游；初始化、普通任务和发布不会检查管理包更新。

## 基线与保护

随模板复制 `.template/manager.json`。其中的 SHA-256 文件清单是已发布源码快照，不会在更新时从未知的当前源码自动重建。初始基线标为 bundled；应用后记录来源仓库、ref、管理目录和实际 commit。请把更新后的源码及这个状态文件一同审查、提交。

基线缺失或不合法、管理源码新增／修改／删除、本地管理目录为符号链接，都会停止更新。请先把定制移到根 `project.config.json`、业务包或目录外扩展，并恢复已知源码；不要把未知源码直接当成原始基线。配置版本、命令 API、Node 环境或 Turbo 版本不兼容时，先按提示人工处理，再重新预览。

上游快照只接受普通文件，拒绝路径越界、符号链接和嵌套 Git 仓库链接。不执行上游生命周期脚本。应用在同一磁盘准备新目录并替换源码；失败时尝试恢复旧目录，无法恢复时报告保留的备份路径。管理目录内的 `node_modules` 与 `.turbo` 属于现有运行环境，会保留。

只替换 `tools/manager/` 的受管源码和根 `.template/manager.json`。根项目配置、业务包、目录外扩展和各类锁文件不会从上游覆盖。本地项目配置继续优先于管理包默认值。

依赖变化会列出手动准备提示；更新不安装依赖、修改根依赖声明或转换锁文件。审查差异后，自行执行所用包管理器的依赖准备并更新锁文件。自定义扩展请保留在管理目录之外。

## 模板维护者发布基线

修改管理源码、验证并格式化完成后，模板维护者显式运行：

```sh
turbo manager:baseline -- --accept-current
```

这个作者命令明确接受当前源码作为新的 bundled 快照，没有声称验证其上游来源。它不是派生项目绕过本地修改保护的自动修复手段。将生成的基线和对应源码一起发布，派生项目才能验证自己复制的版本。普通更新从不调用这个命令。

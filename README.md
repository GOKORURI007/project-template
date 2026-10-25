# 通用多语言项目模板

使用 Turborepo 统一调度任务，共享 JavaScript 管理包负责公共工作流。语言包保留各自的原生工具和元信息。

## 首次安装前选择包管理器

先准备 Node.js 24.10 或更新版本，以及你选择的 npm、Bun、pnpm 或 Yarn。Bun 作为依赖管理后端时，公共管理脚本仍使用 Node.js。依赖下载由所选包管理器显式执行；初始化和项目任务统一使用 `turbo`。

**在第一次安装依赖前**，编辑项目根目录 `package.json` 的 `packageManager` 字段。例如选择 Bun 时，只做以下替换，保留行末逗号及其他字段（`-`、`+` 是差异标记，不写入文件）：

```diff
-  "packageManager": "npm@12.2.0",
+  "packageManager": "bun@1.4.4",
```

其他后端按下表替换同一个字段，并只执行所选后端的安装命令。版本示例与模板向导默认值一致；使用其他版本时，将 `@` 后的版本号替换为你已准备的完整版本。

| 后端        | 根 `package.json` 的 `packageManager` 值 | 安装依赖       |
| ----------- | ---------------------------------------- | -------------- |
| npm（默认） | `npm@12.2.0`                             | `npm install`  |
| Bun         | `bun@1.4.4`                              | `bun install`  |
| pnpm        | `pnpm@12.15.0`                           | `pnpm install` |
| Yarn        | `yarn@4.18.1`                            | `yarn install` |

根 `package.json` 的 `scripts` 保持原样，Turbo 根据 `packageManager` 使用对应后端。Bun 和 npm 使用根清单中现有的 `workspaces`；pnpm 和 Yarn 还需要在安装前准备以下文件。

### 使用 pnpm

在项目根目录创建 `pnpm-workspace.yaml`，内容与根清单中的工作区目录对应：

```yaml
packages:
  - packages/*
  - tools/*
```

已有该文件时，修改其中的 `packages` 范围并保留其他设置。pnpm 模式下，管理命令以这个文件的实际包范围为准。

### 使用 Yarn

在项目根目录创建 `.yarnrc.yml`，设置：

```yaml
nodeLinker: node-modules
```

已有该文件时，将其中的 `nodeLinker` 设置为 `node-modules`，保留其他设置，以使用本模板的本地命令路径。

### 安装依赖后使用 Turbo

执行表中对应的安装命令后，项目已包含固定版本的 Turbo。若当前终端尚不能直接运行 `turbo`，将项目的 `node_modules/.bin` 加入当前终端的 PATH。

PowerShell，在项目根目录执行：

```powershell
$env:Path = (Join-Path (Get-Location) 'node_modules/.bin') + [IO.Path]::PathSeparator + $env:Path
```

Bash／Zsh，在项目根目录执行：

```sh
export PATH="$PWD/node_modules/.bin:$PATH"
```

然后确认命令可用：

```sh
turbo --version
```

之后均在项目根目录运行下文的 Turbo 命令。模板初始化前需要先准备管理包依赖；模板命令不会替你安装工具链或依赖。管理包直接运行 JavaScript，无需先构建管理工具。已有锁文件请自行审阅兼容性并决定如何处理。

复制模板时保留根配置、`tools/manager/`、`.template/` 与所需示例，不复制 `node_modules`、虚拟环境和构建产物。四个 `packages/*-example` 都可独立删除或替换；显式重新准备工作区依赖以更新锁文件，始终保留管理包和它的基线。新增包可参照对应语言示例的 `package.json` 接入任务。

需要发布时，请先在新项目建立 Git 仓库、配置提交身份并提交初始内容；发布不会替你初始化 Git 或提交尚未审查的业务代码。

## 初始化

```sh
turbo init
```

在 Turbo 终端界面中按 `i` 将输入交给初始化向导。向导修改根项目与 APM 的元信息，不改各语言包名称和版本。回车保留当前值，`q` 取消；最终确认前不写入配置。

向导报告四种语言的基础工具可用情况和具体缺失项。Python 包依赖（包括 Ruff 和 ty）需单独手动准备，基础工具可用不代表已安装所有项目依赖。初始化不会自动安装任何东西。

`project.config.json` 存放本地项目配置，位于管理包源码之外；请保留它的配置版本及自己的扩展设置。

### 切换包管理器

依赖已经准备好、希望更换后端时，再运行 `turbo init`，在 `Package manager` 项选择 `npm`、`bun`、`pnpm`、`yarn` 或明确版本，例如 `bun@1.4.4`。只填名称时使用管理包的默认版本；可以在根 `project.config.json` 的 `packageManagers` 中覆盖对应版本。

向导修改的位置为：根 `package.json` 的 `packageManager` 与工作区范围；选择 pnpm 时更新根 `pnpm-workspace.yaml` 的 `packages`；选择 Yarn 时在根 `.yarnrc.yml` 缺少 `nodeLinker` 的情况下补充 `node-modules`。如果已有不同的 Yarn 链接方式，请自行按前文调整。各包的 `scripts` 无需替换。

切换会更新声明与工作区配置。pnpm 的额外工作区设置、Yarn 的已有配置以及所有锁文件均保留；Yarn 尚未指定链接方式时默认使用 node-modules。向导不会下载管理器、转换锁文件或执行安装。

使用 pnpm 时，管理命令依据 `pnpm-workspace.yaml` 的实际包范围发现目标，排除模式生效、重叠模式不会重复列出包。初始化多文件写入失败时会恢复之前的配置；无法恢复的文件会明确报告。

请根据输出自行准备所选管理器，并显式执行它的依赖安装命令；检查并自行处理旧锁文件冲突后再使用新的工作流。已有各语言包名称与版本不会改变。

## 统一任务

```sh
turbo format:check
turbo lint
turbo typecheck
turbo test
turbo build
turbo build -- --package @example/node
```

选择目标使用 `-- --package 包名`。多个目标可以重复传入 `--package`，或使用逗号分隔名称。

顶层任务检查目标并调度内部的 `pkg:*` 任务，交给 Turbo 执行真实包任务。包间准备依赖和构建输出由 Turbo 配置表达。共享管理包不作为业务包参与这些任务。

`format` 和 `lint:fix` 明确修改文件；`format:check` 和 `lint` 只检查。没有任务的包在全仓库模式中被提示并跳过，显式选中时则报错。必要工具缺失始终报错，其他目标可以独立运行。

Node 示例使用 Prettier、ESLint、TypeScript 编译检查和 Node 原生测试。运行管理功能的集成验证：

```sh
turbo test:integration
```

实现规格与任务进度保存在 `.scratch/project-template/`，语言任务约定见 `docs/task-contracts.md`。

## 独立包发布

在已有初始提交且工作区干净的 Git 仓库中运行 `turbo release`，在终端界面中按 `i` 输入。选择包名称或编号，再为各包选择 patch、minor、major、预发布增量或明确的新版本。

全部选中包已配置的检查、测试与构建通过后，才更新版本、提交和各包 tag。Node 默认 tag 形式为去掉开头 @ 的包名加 `/v版本`。本地项目配置的 `release.tagTemplate` 或对应包的 `tagTemplate` 可覆盖默认值，支持 `{name}`、`{version}`、`{path}`。

默认只创建本地发布，也可选择多个 Git remote；部分失败后用 `turbo release:retry` 只补做未完成目标。自定义渠道需在项目配置中定义并明确确认执行，详见 [发布与恢复](docs/release.md)。不兼容的使用方依赖需要自行处理，检查阶段不自动修复代码。管理包默认不参与业务发布。

## Python 示例

自行准备 UV 和 Python 3.13 或更新版本，再显式准备项目依赖：

```sh
uv sync --project packages/python-example --no-python-downloads
turbo lint -- --package @example/python
turbo typecheck -- --package @example/python
turbo test -- --package @example/python
turbo build -- --package @example/python
```

Python 任务只使用已准备的项目环境，禁用隐含同步、网络解析和 Python 下载。环境或工具缺失会明确失败。格式和 lint 使用 Ruff，类型检查使用 ty，测试使用 pytest，构建生成 wheel 与源码发行包。

Python 的版本以原生项目元信息为准，工作区调度清单不复制另一份版本。发布支持 PEP 440，并将常见预发布输入规范化，例如 `0.2.0-alpha.1` 变为 `0.2.0a1`；同时更新项目自身的 UV 锁版本记录。后续需要更新环境时请自行显式同步。动态版本或不兼容依赖需要人工处理。

## Rust 示例

自行准备 Rust、Cargo、rustfmt 与 Clippy 后，可以选择 `@example/rust` 运行统一任务。官方工具负责格式化、Clippy 检查或显式修复、编译检查、测试和构建。构建与检查使用已准备的依赖及锁文件，缺工具不会触发自动安装。

Rust 发布以原生静态版本为准，通过 Cargo 的只读元信息确定真正所属的工作区锁文件；共享锁中的多个目标合并更新。继承版本或不兼容的原生依赖会明确要求人工处理，不盲目修改共享版本。

任务执行前验证所需工具，并将工具版本和平台纳入缓存标识；已有成功缓存不能掩盖后来缺失的工具或 Python 环境。业务包间依赖应在工作区／Turbo 任务关系中明确表达，新增影响构建的业务环境变量也应加入对应缓存输入。

## Go 示例

自行准备 Go 1.24 或更新版本后，选择 `@example/go` 使用统一任务。格式化使用 gofmt，lint 使用 go vet，编译检查与构建使用 go build，测试使用 go test。Go 不提供 vet 自动修复时，`lint:fix` 输出普通 info 并成功退出。

Go 不会为了执行任务自动下载其他版本的 Go 工具链。构建产物和编译检查的临时产物写入被忽略的构建目录。

请将示例 module 路径替换为实际仓库及模块目录。Go 的版本由 Git tag 表达：示例目录的 tag 为 `packages/go-example/v版本`。v2 及以上版本必须先自行迁移 module 路径和 import；管理包验证原生规则，不自动改造源码。无需修改版本文件时，发布流程仍创建发布记录提交及相应 tag。

## 开发运行和部署

```sh
turbo dev -- --package @example/node
turbo start -- --package @example/python
```

Node 的默认开发任务监听源码；其他语言使用原生开发运行命令。可以在本地项目配置中为任意包覆盖命令；每条命令是可执行程序和参数组成的字符串数组，工作目录为该包。例如配置该包的 `commands.deploy` 为 `["node", "scripts/deploy.mjs"]`，然后运行 `turbo deploy -- --package 包名`。部署没有平台默认值，未配置时按缺任务规则跳过或报错。

依赖准备和协同运行通过 Turbo 的 `dependsOn`、包依赖及 `with` 表达。交互终端使用 Turbo 任务界面：选择目标任务后按 `i` 输入，Ctrl+C 停止；任务及其子进程由 Turbo 管理。管理入口在普通管道中使用流式日志，失败任务向上返回失败状态。自定义命令不复用旧缓存。

## 外部源码

`turbo submodule` 和 `turbo subtree` 提供管理向导，并提供独立的 `:status`、`:init`、`:sync`、`:update`、`:push` 任务。固定版本同步与推进上游分开，业务 release 不推送外部源码。配置、使用方式及冲突处理见 [外部源码管理](docs/external-sources.md)。

## 获取管理包改进

在项目配置中指定模板上游后，用 `turbo manager:check` 查看差异，或运行 `turbo manager:update` 审阅并确认应用。复制模板时保留 `.template/manager.json`，用于核对管理源码基线。更新仅替换管理源码并记录来源，业务配置和目录外扩展继续保留；依赖需自行准备。完整说明见 [管理包更新](docs/management-updates.md)。

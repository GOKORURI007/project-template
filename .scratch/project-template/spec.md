# 通用多语言代码项目模板

Status: ready-for-agent

## Problem Statement

项目模板使用者需要在同一个代码项目中协调多种语言，但各语言的格式化、检查、开发运行和发布方式不同。为每种语言维护独立管理脚本会重复实现交互、环境检查和 Git 操作，也难以统一任务入口。

使用者还需要管理子项目中的外部源码，并在模板上游改进公共管理能力后，单独获取管理包更新，同时保留业务包、项目配置和本地扩展。初始化和更新过程必须尊重使用者的环境管理方式，不隐含安装工具链或依赖。

## Solution

提供一个使用 Turborepo 统一调度的通用多语言项目模板，默认采用 npm，并支持切换到 Bun、pnpm 和 Yarn。初始模板包含共享 TS/JS 管理包及 Node、Python、Rust、Go 四个可删除的最小示例包。

管理包集中提供模板初始化、发布和外部源码管理的 TUI。各语言适配提供原生命令、元信息和版本规则，使用者通过统一任务入口操作各语言子项目。项目配置和扩展独立于可更新的管理包源码。

模板初始化只修改确认的项目配置并报告环境适配状态。业务包独立发布，发布检查全部通过后才产生版本和 Git 发布记录。管理包更新从同一个模板上游单独获取对应目录，预览差异并检查兼容性，保护已有定制。

## User Stories

1. As a template user, I want a reusable multilingual project template, so that I can start a project without recreating common development conventions.
2. As a template user, I want minimal Node, Python, Rust, and Go example packages, so that I can learn how each language joins the workspace.
3. As a template user, I want to remove or replace language examples independently, so that the template can fit my actual project structure.
4. As a template maintainer, I want one shared TS/JS management package, so that common management behavior does not need to be reimplemented for every language.
5. As a template user, I want the management package excluded from business package releases by default, so that internal tooling is not accidentally treated as a release target.
6. As a template user, I want Turbo to coordinate package tasks, so that I can run consistent commands across languages or select individual packages.
7. As a template user, I want npm as the default package manager, so that the template has a familiar initial workflow.
8. As a template user, I want to choose Bun, pnpm, or Yarn during template initialization, so that the workspace can use my preferred package manager.
9. As a template user, I want an interactive initialization interface, so that I can inspect and confirm configuration choices.
10. As a template user, I want initialization to synchronize project metadata with the root project manifest and APM configuration, so that shared project identity remains consistent.
11. As a package maintainer, I want initialization to preserve individual package names and versions, so that each package retains its own identity.
12. As a template user, I want repeated initialization to show current values and change only confirmed fields, so that I can revise configuration without resetting customizations.
13. As a template user, I want existing lockfiles preserved when switching package managers, so that I can inspect conflicts and perform the required migration myself.
14. As a template user, I want language-specific environment readiness indicators, so that I can see which language adaptations are usable.
15. As a template user, I want missing tools identified explicitly, so that I know what I must prepare before running a language task.
16. As a template user, I want initialization to avoid installing toolchains, so that I retain control of my machine environment.
17. As a template user, I want initialization to avoid installing project dependencies, so that configuration does not trigger hidden downloads or installation.
18. As a template user, I want preparation instructions for the management runtime and project dependencies, so that I can explicitly prepare the required environment.
19. As a Node package maintainer, I want Prettier and ESLint defaults, so that formatting and code checks use the agreed Node tooling.
20. As a Python package maintainer, I want uv, Ruff, and ty integration, so that dependency execution, formatting, linting, and type checking follow the Python adaptation.
21. As a Rust package maintainer, I want official Cargo and Rust tools, so that the template follows native Rust workflows.
22. As a Go package maintainer, I want official Go formatting and checking tools, so that the template does not require an additional third-party lint stack.
23. As a package maintainer, I want separate formatting, format-checking, linting, and fixing commands, so that I can distinguish inspection from source modification.
24. As a package maintainer, I want unsupported automatic fixing to print an ordinary informational message and succeed, so that the common lint-fix entry remains usable across languages.
25. As a package maintainer, I want type or compilation checks exposed consistently, so that language differences do not change the task vocabulary.
26. As a package maintainer, I want native test and build commands behind common task names, so that I can validate and produce each package using its ecosystem.
27. As a template user, I want development and normal-running tasks coordinated through Turbo, so that related packages can participate in the same workflow.
28. As a package maintainer, I want to configure my own deployment command, so that the template does not constrain the deployment platform.
29. As a template user, I want whole-workspace commands to report and skip packages without the requested task, so that optional package capabilities remain practical.
30. As a template user, I want an explicitly selected package to fail when it lacks the requested task, so that a targeted request is not silently ignored.
31. As a template user, I want a task to fail clearly when its required tools are missing, so that unavailable tooling is not reported as a successful check.
32. As a template user, I want other language packages to remain independently runnable, so that one unavailable language does not prevent unrelated work.
33. As a package maintainer, I want an interactive release interface that selects one or more packages, so that I can control the release scope.
34. As a package maintainer, I want independent package versions, so that unrelated packages do not need to release together.
35. As a package maintainer, I want language-native version and tag rules validated, so that release metadata is valid for the target ecosystem.
36. As a package maintainer, I want release to require a clean working tree, so that release records do not incorporate unrelated work.
37. As a package maintainer, I want all selected packages to pass their configured checks, tests, and builds before version changes, so that a failed preflight leaves versions unchanged.
38. As a package maintainer, I want release preflight to inspect rather than repair source code, so that publishing does not silently rewrite my work.
39. As a package maintainer, I want release to create the appropriate version changes, commits, and tags, so that each release has a traceable Git record.
40. As a package maintainer, I want local-only release records, so that I can prepare a release without pushing it immediately.
41. As a package maintainer, I want to select multiple Git remotes for a release, so that I can distribute the same release to my chosen repositories.
42. As a package maintainer, I want per-remote push results, so that I can see which release targets completed.
43. As a package maintainer, I want to retry only failed push targets without another version bump or tag recreation, so that partial publication can be resumed predictably.
44. As a package maintainer, I want extension points for release channels, so that I can add registry or release-asset publishing when needed.
45. As a package maintainer, I want unsupported source migrations, inherited-version conflicts, and incompatible dependencies reported, so that I can resolve them without automatic cross-package rewrites.
46. As a template user, I want a shared TUI for submodule and subtree management, so that external source operations use the same management experience.
47. As a template user, I want external source status and initialization operations, so that I can inspect and prepare embedded repositories.
48. As a template user, I want fixed-commit synchronization distinguished from upstream updates, so that restoring recorded source does not unexpectedly advance it.
49. As a template user, I want explicit upstream source and target settings, so that external source pulls and pushes use the intended repository and revision.
50. As a template user, I want external source pushes available as explicit operations, so that I can publish upstream changes deliberately.
51. As a package maintainer, I want business releases separated from external source pushes, so that their publication schedules remain independent.
52. As a template user, I want management package updates limited to the management capability, so that business packages are preserved.
53. As a template user, I want updates to work after copying a template without shared Git history, so that ordinary template-created projects can receive improvements.
54. As a template user, I want configurable upstream source and branch or tag selection, so that I can control where management updates come from.
55. As a template user, I want the applied upstream commit and a verifiable baseline recorded, so that update provenance and local changes can be checked.
56. As a template user, I want an update preview and required manual follow-up steps, so that I can review the effect before applying it.
57. As a template user, I want project configuration and extensions outside management source with local settings taking precedence, so that updates preserve my customization.
58. As a template user, I want updates to stop when management source has local edits, so that those edits are not overwritten.
59. As a template user, I want incompatible configuration requirements to stop an update, so that the new management code does not silently break existing project configuration.
60. As a template user, I want management update checks to run only on explicit request, so that normal commands do not perform unsolicited update activity.
61. As a template user, I want management updates to avoid installing dependencies or rewriting business root configuration, so that follow-up environment changes remain explicit.
62. As a template user, I want portable management scripts, so that language portability is not undermined by platform-specific command wrappers.
63. As a template user, I want the final template to omit the complete reference repositories, so that only necessary examples, configuration, and management capability remain.
64. As a template user, I want documentation for task behavior, setup, release recovery, external source management, and updates, so that I can operate and extend the template consistently.

## Implementation Decisions

1. Turborepo 负责统一任务调度，工作区后端默认 npm，支持切换 Bun、pnpm、Yarn；语言原生依赖继续由各自生态管理。
2. 初始工作区包含始终保留的私有 TS/JS 管理包及四种语言的最小示例包。各语言包提供工作区任务入口，同时保留原生元信息。
3. 管理包负责公共交互、环境诊断、发布协调、外部源码操作和自身更新。语言适配提供原生命令、元信息、版本校验和 tag 规则，避免重复实现管理脚本。
4. 初始化、发布和 submodule/subtree 管理使用共享 TUI；开发任务日志使用 Turbo 任务界面。交互命令必须能接收输入、正常结束并传递有意义的退出码。
5. `turbo init` 同步使用者确认的根项目身份和 APM 元信息，各语言包保留独立名称与版本。重复运行时展示当前值，只修改确认的字段。
6. 包管理器切换更新声明与相应工作区配置，保留已有锁文件，提示冲突及后续手动操作，不自动转换或删除锁文件。
7. 初始化报告环境适配状态与具体缺失项，绝不安装工具链或项目依赖，也不通过启动器隐含下载；运行环境和依赖由使用者显式准备。
8. Node 默认 Prettier 和 ESLint，TypeScript 项目接入类型检查；Python 沿用参考的 uv 方式并使用 Ruff、ty；Rust 和 Go 使用官方格式、检查、测试和构建工具。
9. 统一任务为 `format`、`format:check`、`lint`、`lint:fix`、`typecheck`、`test`、`build`、`dev`、`start`、`deploy`。修复与检查分开；不支持修复时输出普通 info，明确没有执行修复并成功退出。
10. 全工作区运行时，跳过并提示没有对应任务的包；显式选择单包而该包缺少任务时失败。已定义任务缺少必要工具时，两种模式都明确失败；其他包仍可独立选择运行。
11. `dev` 表示开发运行或监听，`start` 表示正常运行，`deploy` 执行包自身配置的部署步骤。Turbo 表达任务关系与协同运行，业务就绪检查、端口和部署行为由使用者的包命令处理。
12. 初始化、格式化与修复、发布、部署、源码更新及 Git 操作具有副作用，应避免被旧缓存跳过；确定性检查和构建按准确输入输出缓存。
13. `turbo release` 通过 TUI 选择业务包、目标版本和可选 Git remote。各包独立版本，管理包默认排除在业务发布目标之外。
14. 发布要求干净工作区；修改任何选中包版本前，全部选中包已配置的 `format:check`、`lint`、`typecheck`、`test`、`build` 必须通过，检查阶段不自动修复源码。
15. 语言适配校验并修改原生版本元信息、生成相应 tag，遵守 Go 模块 tag 和主版本约束、Python 版本表示及 Rust 版本继承规则。
16. 发布自动化限于版本元信息和发布流程；需要源码迁移、版本继承冲突或依赖不兼容时明确提示，不自动改写源码或连带升级其他包。
17. 发布创建 Git 记录并可选推送到所选 remote，也支持仅本地发布。记录各目标结果，允许只重试失败目标，不再次升版或重建 tag。
18. Registry 发布与发行资产渠道通过扩展入口配置，不默认绑定某个提供方。
19. 外部源码管理覆盖 submodule/subtree 的状态查看、初始化、同步、上游更新和推送；固定提交同步与推进上游版本为不同操作。
20. Submodule 使用原生仓库配置；subtree 的来源、目标、拉取和推送 revision 及相关策略显式配置在管理包源码外。当前状态不能确定推送分支时，必须明确指定目标。
21. 外部源码推送与业务包发布分开，业务发布不会隐含触发上游源码推送。
22. `turbo manager:update` 从同一模板上游获取指定管理包目录，兼容没有共同 Git 历史的模板派生项目，无需额外分发仓库、subtree 分支或 registry 包。
23. 更新来源和分支/tag 可配置，记录实际 commit 与可验证的上游基线；只在显式执行时检查更新。
24. 项目配置、扩展和更新状态位于可更新源码之外，本地配置优先于上游默认值。
25. 更新先预览差异和手动后续操作；发现管理包本地源码修改或配置不兼容时停止。保留业务包及业务根配置，不自动安装依赖。
26. 管理脚本采用可移植的路径和进程行为。具体 TUI 库、依赖版本、配置命名与内部模块划分属于实现选择。
27. 提炼参考约定后，从最终模板移除两个完整参考仓库；文档描述实际保留的示例与公共工作流。

## Testing Decisions

1. 已确认测试边界：只采用一个高层 seam，即通过 Turbo 和共享管理命令暴露的项目公开命令接口；这是用户实际使用的功能边界，无需额外增加测试专用模块接口。
2. 在一次性工作区与 Git 仓库夹具中执行命令，按需提供终端输入，断言可观察输出、退出码、配置与源码变化、Git 历史和 tag、remote 结果。测试不绑定私有函数调用、内部类结构或 TUI 装饰性排版。
3. 工作区任务路由、管理交互、语言适配结果、发布协调、外部源码行为和管理包更新均通过同一个公开边界覆盖。Git 场景使用本地上游和 remote，避免依赖托管服务。
4. 初始化覆盖重复执行、确认字段、根项目与 APM 身份同步、包身份保留、四种包管理器配置、锁文件保留及缺失工具报告，并在外部命令边界检查禁止的安装行为。
5. 任务约定覆盖检查和修复的文件影响、不支持修复时的 info 与成功退出、原生类型检查/测试/构建、全仓库跳过与显式目标失败、缺工具失败及无关包独立运行。
6. 发布覆盖任一选中包检查失败时，全部选中版本与发布记录不变；验证不自动修复源码、拒绝脏工作区、原生版本规则及仅本地发布。
7. 使用多个本地 remote 并制造部分失败，验证逐目标结果及重试不会再次升版或重建 tag；同时验证业务发布不推送外部源码上游。
8. 外部源码夹具包含 submodule 和 subtree，验证固定提交同步恢复记录状态，上游更新只推进所选来源，显式推送使用配置目标。
9. 管理包更新使用没有共同历史的模板复制夹具，验证指定目录更新、来源记录、差异预览、业务内容与本地扩展保留、显式检查，以及本地源码修改或配置不兼容时停止；同时验证不安装依赖。
10. 工具链已显式准备时，执行各语言原生命令的冒烟验证；缺工具场景通过隔离的命令环境验证，不隐含下载工具链来消除缺失状态。
11. 测试 prior art：Python 参考包含 pytest 执行包装，但已探索仓库没有可直接复用的公共管理 CLI 集成测试套件。因此围绕公开命令建立夹具测试，不照搬参考内部结构或新增低层测试接口；测试框架和终端驱动库留给实现选择。

## Out of Scope

- 初始化或管理包更新自动安装工具链、项目依赖。
- 自动转换或删除已有包管理器锁文件。
- 替使用者定义业务包架构，或要求派生项目保留全部四种语言示例。
- 为普通开发任务重建全屏进程管理器，内置业务就绪管理、端口分配或固定部署平台。
- 全仓库统一版本、自动源码迁移、跨包依赖自动升级或静默解决版本继承冲突。
- 在扩展入口之外，默认内置某个 registry 或托管发布提供方。
- 业务发布自动推送外部源码仓库。
- 普通管理包更新自动合并本地源码修改或迁移不兼容业务配置。
- 用模板上游内容替换业务包、无关根配置或整个派生项目。
- 要求额外管理包分发仓库、registry 发布、subtree 分发分支或与模板共享 Git 历史。
- 在最终模板中保留完整 Python 与 Zotero 参考仓库。

## Further Notes

- 本规格综合已经结束的设计访谈，功能、架构和测试边界均已确认。
- 项目 tracker 为本地 Markdown；本规格已发布到功能的正式 spec，顶部状态为 `ready-for-agent`，不需要额外 triage。
- 领域术语见 [GLOSSARY.md](../../GLOSSARY.md)，任务行为见 [task-contracts.md](../../docs/task-contracts.md)，架构决策见 [ADR-0001](../../docs/adr/0001-configuration-only-initialization.md)、[ADR-0002](../../docs/adr/0002-shared-management-package.md)、[ADR-0003](../../docs/adr/0003-independent-package-releases.md)、[ADR-0004](../../docs/adr/0004-explicit-external-source-operations.md)、[ADR-0005](../../docs/adr/0005-directory-scoped-management-updates.md)。
- 参考仓库用于提炼约定和交互，不要求保留其布局或内部脚本。
- 实现顺序为工作区与管理基础、初始化和语言任务、发布、外部源码管理、管理包更新、文档及参考清理。

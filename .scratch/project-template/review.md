# 对照规格审查与修复

日期：2026-10-25。范围为当前完整实现，对照 [spec.md](spec.md)、根 GLOSSARY、任务约定和 ADR。项目尚无 Git 历史，以本轮开始时的文件系统快照为固定基准；正式规格未修改。Standards 与 Spec 两条轴线分别审查，修复均通过公开 Turbo／管理命令验证。

## Standards

没有发现独立于工具检查、需要另行修正的硬性编码标准违规；也没有为代码 smell 进行无需求的重构。发现并修复 1 处实际可靠性问题：

1. **初始化失败留下部分配置。** 后端配置文件不可写时，原实现已经先改写根清单与 APM。现在将本次配置写入作为一组处理，后续写入失败时恢复已尝试修改的文件，移除本次新建的文件；恢复不完整时明确报告具体文件。`init.test.mjs` 通过只读后端配置复现失败并确认原内容恢复。该项属于配置一致性问题，不将 ADR-0001 解读为未写明的事务性承诺。

## Spec

修复 8 处规格偏差，以下前 6 项按独立 Spec 审查报告原顺序保留：

1. **Subtree 固定同步可能成功却未恢复旧记录。** 对应 Testing Decision 8、Story 48 和 GLOSSARY 的“固定提交同步”。保留完整历史的 subtree 已推进后，将配置 revision 改回旧提交，原生 merge 会因历史包含目标而保持较新源码。现在固定同步校正所选目录的受管源码快照并提交，保留 Git 历史；再次上游更新也能前进。分别验证 squash 开启与关闭、旧版本恢复、再次前进，以及 update 保留已提交的本地扩展。补丁显式固定无颜色输出和路径前缀，验证用户设置 `color.ui=always`、`diff.noprefix=true` 后也能应用。未提交修改仍使操作停止。使用说明同步更正。实现见 [external.mjs](../../tools/manager/external.mjs)。

2. **Go 版本识别混入其他主版本系列。** 对应 Stories 35、45。原实现仅按目录 tag 前缀选择最大版本，导致旧主版本分支被同目录的新主版本 tag 阻塞。现在依据原生 module 路径过滤适用系列；验证无后缀、`/v2` 和 `gopkg.in ... .v1` 三类模块，避免其他系列影响本包版本。

3. **工作区发现不符合实际后端范围。** 对应 Stories 6、8。现在 pnpm 模式直接读取 `pnpm-workspace.yaml`；范围展开支持排除与重叠去重，不再使用过期根清单范围。初始化切换后端与日常任务／发布共用范围读取规则。宽模式下也默认排除 `node_modules` 和 Git 元数据，根管理入口不作为业务包；不会把依赖目录的清单交给 Turbo 当作业务包执行。公开场景覆盖仅在 pnpm 配置中存在的目标、排除包、重复模式及嵌套依赖清单。实现见 [workspaces.mjs](../../tools/manager/workspaces.mjs) 与 [core.mjs](../../tools/manager/core.mjs)。原生行为参考 [pnpm packages 配置](https://pnpm.io/settings#packages)。

4. **Python 开发和构建依赖未参与发布约束检查。** 对应 Story 45、Implementation Decision 16。现在除项目与可选依赖，还检查 dependency-groups 中的依赖声明及 build-system.requires。遍历全部分组也覆盖 include-group 所引用分组中的声明。消费者的依赖读取不再要求其自身采用静态版本。测试确认开发分组和构建依赖冲突均在任何版本或 tag 改动前停止。

5. **管理更新误拒绝合法 Turbo 版本范围。** 对应 Story 59。原实现把根依赖声明 `^2.11.10` 当作精确版本，尽管已安装版本兼容也会拒绝更新。现在只读取已准备的 Turbo 包版本进行最低版本检查，不执行 Turbo 启动器，不触发安装；兼容范围通过、实际已安装版本过旧仍停止。

6. **已安装 Go 在环境诊断中仍显示缺失。** 对应 Stories 14–15、Implementation Decision 7。诊断由错误的统一 `--version` 改为 Go 原生 `go version`。新增真实 Go 环境的正向验证，既有隔离 PATH 的缺工具验证继续通过。

7. **符号 workspace 协议被误判为固定旧版本约束。** 对应 Stories 8、45。`workspace:^` 与 `workspace:~` 不应被固定成升版前版本范围。现在它们与 `workspace:*` 跟随本地目标；显式 `workspace:^1.0.0` 仍按兼容性检查，不自动改写消费者。公开发布测试验证目标跨主版本升级及显式范围阻止不兼容升级。语义参考 [Yarn workspace 协议说明](https://yarnpkg.com/features/workspaces#cross-references)。

8. **间接依赖构建绕过工具指纹。** 对应 Story 31、Implementation Decision 12。只选 Node 时，其 Rust 构建依赖原先未进入工具指纹，移除 Rust 后仍可能成功命中缓存。现在先用相同任务和 filters 获取 Turbo 的实际执行图，在使用缓存前检查每个实际受管任务所需工具，并汇总版本指纹。图内自定义命令也会强制执行。回归验证 Node→Rust 依赖首次构建成功、Rust 缺失后的同一请求明确失败，覆盖真正执行图而非另写一套依赖调度。

## 验证结果

- `npm run test:integration`：73 项通过，0 失败、0 跳过，约 77 秒。
- ESLint：管理源码与测试全部通过。
- Prettier：管理源码、测试、根配置、基线及操作文档全部通过。
- 管理包基线已随修复重新发布；23 个源码文件 SHA-256 与实际内容一致。
- 四种语言原生测试沿用此前已显式准备的验证环境；本轮没有安装工具链或项目依赖。
- 新增 Python 源码故障场景，确认测试实际读取复制项目中被修改的源码；该疑点未复现为实现缺陷，未改动其正常运行方式。

验证平台为 Windows；没有声称在 Linux／macOS 上执行相同套件。初始化只读文件失败测试在具备绕过文件权限能力的 root 环境中会明确跳过，此次 Windows 执行未跳过。测试继续遵守已确认的单一公开命令 seam，无私有函数单元测试。

统计：Standards 硬性违规 0 项、可靠性修复 1 项；Spec 修复 8 项。各轴最严重的问题分别为初始化失败后的配置不一致，以及固定同步／间接依赖缓存的虚假成功；所列问题均已修复。

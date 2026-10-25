# 领域文档

本项目采用 single-context 布局：

- 根目录 `GLOSSARY.md`：项目领域术语。
- `docs/adr/`：架构决策记录。

## 探索前读取

探索代码前，读取 `GLOSSARY.md`，
以及 `docs/adr/` 中与当前工作相关的 ADR。

文件不存在时静默继续。
由 `/domain-modeling` 在术语或决策实际明确后按需创建。

涉及模板任务语义时，读取 `docs/task-contracts.md`；完整已确认设计位于 `.scratch/project-template/spec.md`。

## 使用领域术语

Issue 标题、重构建议、诊断假设和测试名称中的领域概念，
使用 glossary 定义的术语，并遵循其同义词约定。

需要的概念尚未收录时，先检查是否符合项目现有语言；
确有缺口则记录给 `/domain-modeling`。

## 标记决策冲突

方案与现有 ADR 矛盾时，明确指出对应 ADR、
冲突内容以及重新讨论该决策的理由。

# 领域文档

本文件说明 engineering skills 在探索代码库时应如何使用本仓库的领域文档。

当前仓库采用 single-context 布局：根目录使用一个 `CONTEXT.md`，架构决策记录保存在 `docs/adr/`。

## 探索代码库前

按需读取：

- 仓库根目录的 `CONTEXT.md`
- 如果根目录存在 `CONTEXT-MAP.md`，则根据其索引读取与当前主题相关的各个 `CONTEXT.md`
- `docs/adr/` 中与即将处理的区域有关的 ADR
- 在 multi-context 仓库中，还应检查 `src/<context>/docs/adr/` 下限定于特定上下文的决策

如果这些文件尚不存在，静默继续，不要报告缺失，也不要预先建议创建。

`/domain-modeling` skill 会在术语或决策真正得到确认时按需创建这些文件；通常由 `/grill-with-docs` 或 `/improve-codebase-architecture` 进入该流程。

## 当前文件结构

本仓库使用 single-context 结构：

    /
    ├── CONTEXT.md
    ├── docs/adr/
    │   ├── 0001-event-sourced-orders.md
    │   └── 0002-postgres-for-write-model.md
    └── src/

示例 ADR 文件名仅用于说明结构，不表示这些 ADR 已经存在。

如果仓库以后演变为 multi-context，应在根目录增加 `CONTEXT-MAP.md`，由它指向各上下文的 `CONTEXT.md`。

## 使用术语表中的词汇

当输出内容需要命名领域概念时，例如 issue 标题、重构提案、假设或测试名称，应使用 `CONTEXT.md` 中定义的术语，不要改用术语表明确排除的同义词。

如果所需概念尚未出现在术语表中，这通常表示：

- 正在引入项目并未使用的语言，应重新考虑；或
- 领域文档确实存在缺口，应记录下来，交由 `/domain-modeling` 处理

## 标明与 ADR 的冲突

如果输出内容与已有 ADR 冲突，应明确指出，而不是静默覆盖：

> 与 ADR-0007（事件溯源订单）冲突，但值得重新讨论，因为……

# Issue tracker：本地 Markdown

本仓库的 issue 和 spec 以 Markdown 文件形式保存在 `.scratch/` 中。

## 约定

- 每个功能使用一个目录：`.scratch/<feature-slug>/`
- Spec 文件为 `.scratch/<feature-slug>/spec.md`
- 每张实施工单单独保存为 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- 工单从 `01` 开始编号，不使用一个合并文件保存所有工单
- Triage 状态记录在每个 issue 文件顶部附近的 `Status:` 行中；状态值参见 `triage-labels.md`
- 评论和对话历史追加到文件底部的 `## Comments` 标题下

## 当 skill 要求“发布到 issue tracker”时

在 `.scratch/<feature-slug>/` 下创建新文件；目录不存在时一并创建。

## 当 skill 要求“获取相关工单”时

读取所引用路径对应的文件。用户通常会直接提供文件路径或 issue 编号。

## Wayfinding 操作

供 `/wayfinder` 使用。Map 文件对应多张工单，每张工单有一个独立的子文件。

- **Map**：`.scratch/<effort>/map.md`，保存 Notes、Decisions-so-far 和 Fog
- **子工单**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号，正文记录待解决的问题
- 子工单顶部使用 `Type:` 记录类型：`research`、`prototype`、`grilling` 或 `task`
- 子工单顶部使用 `Status:` 记录状态：`claimed` 或 `resolved`
- **阻塞关系**：在文件顶部附近使用 `Blocked by: NN, NN`；列出的所有工单均为 `resolved` 后，当前工单才解除阻塞
- **Frontier**：扫描 `.scratch/<effort>/issues/`，寻找尚未完成、未被阻塞且未被认领的工单；编号最小者优先
- **认领**：开始工作前将 `Status:` 设置为 `claimed` 并保存
- **解决**：在 `## Answer` 标题下追加答案，将 `Status:` 设置为 `resolved`，再把上下文指针（摘要与链接）追加到 `map.md` 的 Decisions-so-far 中

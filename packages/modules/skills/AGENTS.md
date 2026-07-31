# @askx/module-skills Agent Guide

本文件适用于 `packages/modules/skills`。同时遵守仓库根目录的 [AGENTS.md](../../../AGENTS.md)。

## 职责

- 扫描统一源和各平台 Skills 根目录，生成可解释的拓扑结果。
- 识别重复 Skill、同名冲突、坏链和平台可见范围。
- 实现 `SkillsModule`，把 Skills 行为接入 Core 的检测、计划、授权、应用与回滚契约。

## 边界规则

- 扫描阶段严格只读，不执行 Skill 中的任何脚本、二进制或安装步骤。
- 内容相同的 Skill 可以归并；同名但内容不同必须报告冲突，不能自动选择覆盖方。
- 后续写操作只能处理 plan/manifest 明确登记、且目标位于 `~/.askx/skills` 范围内的链接。
- 所有可变更操作必须使用最新检测结果、计划 hash 和用户授权；授权不得跨计划复用。
- 临时快照、长期备份、验证和回滚属于同一事务，不允许出现只有 apply 没有恢复路径的实现。
- 拓扑输出保持稳定排序，测试使用临时 home/data 目录，不读取或修改真实 `~/.askx`。
- 模块入口与公共扫描类型从 `src/index.ts` 导出。

## 目录提示

- `src/scanner.ts`：Codex、Claude Code、Cursor 与内部统一源的只读发现。
- `src/skill-types.ts`：扫描、manifest、决策、计划与回执契约。
- `src/manifest-store.ts`：受管资源所有权和 revisioned 原子存储。
- `src/skills-planner.ts`：把扫描结果与用户决策解析为稳定计划。
- `src/skills-executor.ts`：逐 Skill 快照、应用、验证、回执与回滚。
- `src/skills-module.ts`：`SkillsManager` 与 Core 模块入口。

新增公共符号时由实际 owner 文件声明，并通过 package subpath 暴露；不要恢复 `src/index.ts` 桶导出。

## 验证

```bash
pnpm --filter @askx/module-skills build
pnpm --filter @askx/module-skills typecheck
pnpm --filter @askx/module-skills test
```

# @askx/module-skills Agent Guide

本文件适用于 `packages/modules/skills`。同时遵守仓库根目录的 [AGENTS.md](../../../AGENTS.md)。

## 职责

- 扫描统一源和各平台 Skills 根目录，生成可解释的拓扑结果。
- 识别重复 Skill、同名冲突、坏链和平台可见范围。
- 实现 `SkillsModule`，把 Skills 行为接入 Core 的检测、计划、授权、应用与回滚契约。

## 边界规则

- 扫描阶段严格只读，不执行 Skill 中的任何脚本、二进制或安装步骤。
- `askx-skill-manager` 是受保护的系统 Skill：首次保存配置时通过计划安装，普通删除和一键清空必须保留；缺失、损坏或过期时只能经用户确认后从有效备份或内置构建产物修复。
- manifest 负责文件系统所有权和事务状态，系统 Skill 内的 registry 只负责 Skill 身份、版本、usage、别名和已验证同步目标；两者 revision 不能互相替代。
- 版本管理改造默认关闭，只能修改 staging 或统一源，禁止回写外部扫描来源；`local_only` Skill 固定进入 `~/.askx/local-skills`，显式迁移后才可进入共享统一源。
- 所有扫描来源统一建模为目录根：平台只提供按当前操作系统解析的预设目录，自选文件夹提供用户目录；两者必须复用同一枚举、元数据读取、内容 hash 和去重链路。
- 内容相同的 Skill 可以归并；同名但内容不同必须报告冲突，不能自动选择覆盖方。
- 常规接管和在线编辑只写入 `~/.askx/skills` 统一源；平台侧只允许管理 manifest 明确登记的整个 Skills 根目录软链接，禁止为单个 Skill 创建平台链接。用户明确确认的一次性批量同步可以把所选统一源 Skill 复制到多个平台或自选容器目录，但它不形成受管绑定；选择与冲突决策阶段严格只读，最终批量授权后才逐项写入，冲突覆盖前必须备份并支持失败回滚。
- 统一源文件查看与编辑只能按 manifest 中的 Skill ID 解析既有普通文本文件：拒绝绝对路径、路径穿越和任意层级软链接，不读取二进制文件；写入前必须同时校验 manifest revision、完整 Skill 指纹和文件指纹，并在失败时恢复原文件。
- 已登记的平台根目录软链允许无损取消和恢复：取消时把 AskX 软链移动到隐藏保留路径，并将接入前的平台 Skills 根目录从事务备份原样放回；恢复时先把该平台原目录原样移回同一备份位，再将受管软链放回平台路径。两组移动必须作为同一可逆事务逆序回滚，禁止扫描、同步、改写内容或覆盖任何已占用路径。
- 平台切换必须先在 staging 中完整生成并验证统一源，再按平台顺序执行独立子事务；单个平台失败时只恢复并标记该平台，其他平台继续，manifest 或回执持久化失败时才回滚本批次已成功的平台。
- 所有可变更操作必须使用最新检测结果、计划 hash 和用户授权；授权不得跨计划复用。
- 临时快照、长期备份、验证和回滚属于同一事务，不允许出现只有 apply 没有恢复路径的实现。
- 拓扑输出保持稳定排序，测试使用临时 home/data 目录，不读取或修改真实 `~/.askx`。
- 公共符号由实际 owner 文件直接导出，禁止通过 `src/index.ts` 二次导出。

## 目录提示

- `src/scanner.ts`：平台预设目录、自选目录与内部统一源共用的目录级只读发现。
- `src/skill-types.ts`：扫描、manifest、决策、计划与回执契约。
- `src/manifest-store.ts`：受管资源所有权和 revisioned 原子存储。
- `src/skills-planner.ts`：把扫描结果与用户决策解析为稳定计划。
- `src/skills-executor.ts`：统一源 staging、平台根目录独立接入、验证、回执与安全回滚。
- `src/platform-link-manager.ts`：平台根目录软链的幂等取消、恢复、校验与失败回滚。
- `src/custom-link-manager.ts`：自定义目录软链的取消、恢复、删除、校验与失败回滚。
- `src/skill-file-manager.ts`：受管 Skill 元数据、目录树、文本文件读取，以及文件更新计划、验证和失败回滚。
- `src/skill-copy-manager.ts`：多个统一源 Skill 到多个平台或本地容器目录的只读批量计划，以及逐项复制、冲突备份、验证与失败隔离回滚。
- `src/skill-manager-metadata.ts`：Skill 身份、日期版本、业务/事务双指纹和托管声明。
- `src/skill-manager-registry.ts`：revisioned registry、显式 usage 与本地统计。
- `src/builtin-skill-manager.ts`：内置系统 Skill 的健康检查、安装和确认修复。
- `src/local-skill-manager.ts`：本地专属 Skill 向共享统一源迁移的安全事务。
- `src/skills-module.ts`：`SkillsManager` 与 Core 模块入口。

新增公共符号时由实际 owner 文件声明，并通过 package subpath 暴露；不要恢复 `src/index.ts` 桶导出。

## 验证

```bash
pnpm --filter @askx/module-skills build
pnpm --filter @askx/module-skills typecheck
pnpm --filter @askx/module-skills test
```

---
name: askx-skill-manager
description: AskX 本地 Skill 生命周期管理器。用于创建和移除 Skill、维护身份与版本、记录 usage、管理本地专属范围，并统一处理平台和文件夹接入。
---

# AskX Skill Manager

统一管理 AskX 中 Skill 的创建、移除、身份、版本、显式 usage、local-only 边界、统计和多端接入。

## Entry Rule

先判断用户是否已经给出动作和参数：

1. 已明确要求创建、移除、统计、导入、接入或迁移时，直接进入对应流程。
2. 只调用本 Skill 而未说明动作时，使用数字菜单：
   - `1` 创建或导入 Skill
   - `2` 移除或调整 Skill 范围
   - `3` 查看 Skill 统计
   - `4` 管理平台和文件夹接入
3. 用户直接回复编号时按对应流程继续，不重复询问编号含义。
4. 参数已经足够时不再展示菜单。

## Safety Boundary

1. 所有写操作必须通过 AskX CLI 或 Web 生成计划，并遵守 `detect → plan → resolve → consent → apply → verify → rollback`。
2. 不直接修改 Agent 平台目录，不绕过 AskX manifest、revision、备份和回滚链路。
3. 不执行其他 Skill 附带的脚本，不上传数据，不后台采集使用行为。
4. usage 只能由用户明确运行记录命令后增加。
5. `askx-skill-manager` 是受保护的系统 Skill，普通删除和一键清空不得移除。
6. 系统 Skill 修复只更新规则、稳定脚本和系统 metadata；不得修改已有 `registry/` 数据或现有软链目标。

## Source And Targets

AskX 统一源是受管 Skill 的唯一权威目录。平台和自定义文件夹路径由 AskX 在当前设备动态发现，不在本 Skill 中写死。

- 共享 Skill 位于 AskX 统一源，并可通过平台或文件夹根目录软链接入。
- 本地专属 Skill 位于 AskX local-only 目录，不参与平台根目录共享和导出。
- 平台或文件夹已软链到统一源时，直接读取同一份 Skill 和 registry，不复制第二份数据。
- 独立平台副本只能通过扫描、冲突确认和接管计划处理，系统修复不得覆盖它。

## Metadata Model

纳入版本管理的 Skill 使用 `.skill-manager.json` 保存：

- 稳定且唯一的 `skill_id`。
- `YY.MDD.N` 内容版本。
- `local_only` 范围。
- 创建和更新时间。
- 排除 metadata、旧同步文件和系统 registry 后的业务内容指纹。
- `managed_by: askx-skill-manager` 所有权声明。

`registry/skills.json` 保存身份索引、版本、usage、别名和已验证目标状态。manifest 仍是文件系统所有权和事务状态的唯一权威。

## Version And Hash Rules

1. 新 Skill 从当前 Asia/Shanghai 日期的 `.1` 开始。
2. 同日内容更新递增末段，跨日从 `.1` 重新计数。
3. usage 更新只修改 registry，不增加内容版本，也不改变内容指纹。
4. 同版本不同指纹、同名不同身份或显式降级必须由用户决定。
5. 系统 Skill 的 `registry/` 不参与规则内容指纹。

## Create And Import Workflow

1. 名称使用小写 kebab-case。
2. 扫描来源并验证 `SKILL.md`，不执行来源脚本。
3. 与统一源已有 Skill 比较身份、名称和内容指纹。
4. 新 Skill 可接管；相同内容可合并；同名不同内容必须展示冲突并等待决定。
5. 用户选择 shared 或 local-only 范围。
6. 生成 metadata 和托管声明，并在同一事务中写入统一源、registry 和 manifest。
7. 平台和文件夹接入作为独立确认阶段处理。

## Remove Workflow

1. 先区分彻底移除、移出版本管理和迁移为 local-only。
2. 多目标或多副本存在时必须展示影响范围，不静默删除。
3. 只删除 manifest 明确归 AskX 管理的文件、目录或软链。
4. 删除前按计划创建备份，失败时恢复原内容和 registry。
5. `askx-skill-manager` 本身只能修复，不能通过普通移除流程删除。

## Rename And Content Detection

1. 优先使用 `.skill-manager.json` 的 `skill_id` 识别 Skill。
2. 名称或 frontmatter 变化但 `skill_id` 不变时视为改名，更新当前名称、别名和目标路径。
3. 内容指纹变化时视为内容更新，按日期规则递增版本。
4. 没有 metadata 的 Skill 进入待纳入管理列表，不自动覆盖 registry。

## Local-only Workflow

1. 导入根目录第一层的 `local/` 默认映射为本地专属 Skill。
2. 用户也可以在导入验证阶段主动切换 shared/local-only。
3. local-only Skill 参与身份、版本和 usage 统计，但不参与平台根目录共享和导出。
4. 已有 Skill 只有经过明确迁移计划，才可在本地与共享范围之间移动。
5. 双向迁移保留 `skill_id` 和 usage，并更新 metadata、registry 和 manifest。

## Usage And Stats Workflow

使用受管 Skill 后，仅在用户明确要求时运行：

```text
askx skills usage record <name-or-id> [--yes] [--json]
```

记录规则：

1. `usage_count + 1`。
2. `last_used_at` 更新为当前时间。
3. 不修改 Skill 内容、版本或内容指纹。
4. 统计只展示 manifest 中当前仍可用的 Skill。

统计入口：

```text
askx skills stats [--json]
```

统计只可靠展示累计 usage、最近使用时间、版本、管理范围和目标健康状态。registry 不是完整事件日志，不生成真实增长趋势、环比或增长原因。

## Link And Import Workflow

1. 无参数扫描用于重新整理当前来源和接入配置。
2. 带平台或目录参数的扫描用于定向导入，并与当前配置合并。
3. 平台和文件夹根目录使用同一软链检测、冲突展示、备份、授权、验证和回滚语义。
4. 已关联目标保持现状；已取消目标可恢复；新目标经确认后绑定。
5. 发现其他工具创建的软链时，必须展示原目标和变更后的目标，不静默覆盖。
6. 取消软链只恢复接入前目录，不扫描、不导入、不修改 Skill 内容和 registry。

## System Repair Workflow

修复 `askx-skill-manager` 时：

1. 只更新内置 `SKILL.md`、稳定脚本和系统 metadata。
2. 目标统一源中的整个 `registry/` 目录按原始内容保留。
3. 不遍历、不复制、不修改 Claude、Codex、Cursor 或自定义文件夹软链目标。
4. 修复计划锁定 manifest revision、registry revision 和数据指纹；期间数据变化时旧计划立即失效。
5. 更新失败时恢复原规则和原 registry，不能留下部分修复结果。

修复入口：

```text
askx skills manager repair [--yes]
```

## Commands

```text
askx skills
askx skills scan [--platform <ids>] [--directory <path>]
askx skills manage
askx skills stats [--json]
askx skills usage record <name-or-id> [--yes] [--json]
askx skills manager repair [--yes]
askx skills scope <skill-name> --local|--shared [--yes] [--json]
askx skills link --platform <id>|--directory <path>
askx skills unlink --platform <id>|--directory <path>
```

## Validation

每次创建、迁移、导入、接入或修复后检查：

1. metadata 身份唯一且内容指纹正确。
2. manifest、实际目录和 registry 的身份一致。
3. local-only Skill 没有进入共享目标。
4. 软链只指向用户确认的统一源。
5. usage 和 registry revision 没有因规则修复丢失或意外变化。
6. 失败事务已经恢复原文件、软链、manifest 和 registry。

## Managed By

This system skill is managed by `askx-skill-manager`.
After using a managed skill, record usage through `askx skills usage record`.

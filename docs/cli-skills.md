# AskAgent X Skills CLI API

本文档对应 AskAgent X `26.812.1`。每个章节对应一个实际命令，按命令名即可快速查找。

- [命令索引](./cli.md)
- [基础与 Web API](./cli-base.md)

## API 索引

| 命令 | 类型 | 作用 |
| --- | --- | --- |
| `askx skills` | 只读/首次交互 | 查看当前 Skill；未初始化时进入引导。 |
| `askx skills scan` | 只读扫描 + 确认写入 | 完整扫描或定向导入。 |
| `askx skills link` | 写入 | 设置或恢复平台、文件夹软链，不扫描 Skill。 |
| `askx skills unlink` | 写入 | 取消平台、文件夹软链，不扫描 Skill。 |
| `askx skills status` | 只读 | 检查当前扫描与软链健康状态。 |
| `askx skills scope` | 写入 | 在共享与本地范围之间迁移已有 Skill。 |
| `askx skills history list` | 只读 | 查看事务回执。 |
| `askx skills rollback` | 写入 | 回滚指定事务。 |
| `askx skills stats` | 只读 | 查看当前可用 Skill 的统计。 |
| `askx skills usage record` | 写入 | 记录一次 Skill 使用。 |
| `askx skills manager repair` | 写入 | 修复系统 Skill Manager。 |
| `askx skills backups list` | 只读 | 查看清空备份。 |
| `askx skills backups restore` | 写入 | 恢复清空备份。 |
| `askx skills backups remove` | 写入 | 删除清空备份。 |

## `askx skills`

```bash
askx skills
```

- 类型：已初始化时只读；未初始化时进入交互引导。
- 输出：统一源路径、已关联平台、共享与本地 Skill 列表，以及相关管理命令。

## `askx skills scan`

```bash
askx skills scan [--platform <platform>]... [--directory <path>]... [--json]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `-p, --platform <platform>` | 否 | `codex`、`claude`、`cursor`；支持逗号分隔或重复传入。 |
| `-d, --directory <path>` | 否 | 自定义 Skills 根目录；可重复传入，保存上限为 3 个。 |
| `--json` | 否 | 只读输出扫描报告，不进入选择、计划或写入。 |

### 无参数模式

```bash
askx skills scan
```

- 模式：完整重新扫描（`replace`）。
- 交互：选择来源 → 验证和选择 Skill → 选择软链目标 → 确认计划 → 保存。
- 配置：以本次来源和软链选择重新整理当前配置；未选择的旧绑定无损暂停。

### 带参数模式

```bash
askx skills scan --platform codex,claude
askx skills scan --directory /absolute/path/to/skills
askx skills scan --platform cursor --directory /absolute/path/to/skills
```

- 模式：定向导入（`merge`）。
- 交互：跳过来源选择，直接验证本次 Skill → 选择本次软链目标 → 确认计划 → 保存。
- 配置：只合并参数指定的来源和目标，不移除其他历史平台、目录或绑定。

### 扫描规则

- 扫描与选择阶段只读，最终确认前不修改文件和配置。
- 根目录第一层的 `local/` 子目录自动作为本地 Skill 来源；验证列表可按 `L` 切换共享/本地范围。
- 同名不同内容必须在冲突向导中选择保持现状、指定来源或改名导入；默认不覆盖。
- 任一阶段按 `Esc`、`Q` 或中断会放弃整次命令。
- macOS 返回 `EPERM` 时按终端提示为当前终端宿主授权，或进入来源的可访问上级目录后使用相对路径。

## `askx skills link`

```bash
askx skills link [--platform <platform>]... [--directory <path>]... [--takeover-external-link] [-y] [--json]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `-p, --platform <platform>` | 条件必填 | 要设置或恢复软链的平台。 |
| `-d, --directory <path>` | 条件必填 | 要设置或恢复软链的自定义目录。 |
| `-y, --yes` | 否 | 确认执行计划。 |
| `--json` | 否 | 输出执行结果 JSON。 |

- 类型：写入。
- 效果：新目标执行关联，已暂停目标执行恢复，已关联目标提示已存在、本次不处理。
- 不会：扫描、导入、复制或改写 Skill。
- 交互：未传平台和目录时选择平台；非交互环境必须明确传目标。

## `askx skills unlink`

```bash
askx skills unlink [--platform <platform>]... [--directory <path>]... [-y] [--json]
```

- 类型：写入。
- 效果：取消受管软链，恢复接入前目录并保留可恢复绑定；不存在关联数据时提示本次不处理。
- 不会：扫描、删除或修改统一源 Skill。
- 参数：与 `link` 相同；未传目标时交互选择平台。

## `askx skills status`

```bash
askx skills status [--json]
```

- 类型：只读。
- 输出：当前配置平台的扫描状态、内容冲突、无效 Skill、失效链接、指纹及初始化信息。

## `askx skills scope <skill-name>`

```bash
askx skills scope <skill-name> (--local | --shared) [-y] [--json]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `<skill-name>` | 是 | 已有 Skill 名称。 |
| `--local` | 二选一 | 从共享统一源迁移到 `~/.askx/local-skills`。 |
| `--shared` | 二选一 | 从本地目录迁移到 `~/.askx/skills`。 |
| `-y, --yes` | 否 | 确认执行迁移计划。 |
| `--json` | 否 | 输出回执 JSON。 |

- 类型：写入。
- 效果：迁移已有 Skill 的范围；不会同时保留两份副本。

## 事务与修复

### `askx skills history list`

```bash
askx skills history list [--json]
```

- 类型：只读。
- 输出：可追踪和可回滚的 Skills 批次回执。

### `askx skills rollback <receipt-id>`

```bash
askx skills rollback <receipt-id> [-y] [--json]
```

- 类型：写入。
- 效果：根据事务回执生成回滚计划，确认后恢复该批次管理的路径。

### `askx skills manager repair`

```bash
askx skills manager repair [-y] [--json]
```

- 类型：写入。
- 效果：检测并修复缺失、损坏或版本过期的受保护系统 Skill Manager。
- 限制：只有确认计划后写入，不会静默修复。

## 统计与使用记录

### `askx skills stats`

```bash
askx skills stats [--json]
```

- 类型：只读。
- 输出：以当前可用 Skill 为准的共享/本地数量、usage 和纳管统计；已清空或不存在的 Skill 不输出。

### `askx skills usage record <name-or-id>`

```bash
askx skills usage record <name-or-id> [-y] [--json]
```

- 类型：写入。
- 效果：为指定 Skill 生成 usage 计划，确认后把使用次数写入系统 Skill Manager registry。

## 备份管理

### `askx skills backups list`

```bash
askx skills backups list [--json]
```

- 类型：只读。
- 输出：`askx clear` 产生的长期备份版本、名称、时间和路径。

### `askx skills backups restore <backup-version>`

```bash
askx skills backups restore <backup-version> [-y] [--json]
```

- 类型：写入。
- 效果：确认后用指定备份恢复统一源和受管 Skill 数据；失败时恢复操作前状态。

### `askx skills backups remove <backup-version>`

```bash
askx skills backups remove <backup-version> [-y] [--json]
```

- 类型：不可恢复写入。
- 效果：确认后永久删除指定长期备份，不影响当前统一源。

## 自动化示例

```bash
askx skills scan --platform codex --json
askx skills status --json
askx skills stats --json
askx skills link --platform claude --yes --json
askx skills unlink --directory /absolute/path/to/skills --yes --json
askx skills usage record my-skill --yes --json
```
设置前会只读检测平台 Skills 根路径。若该路径已经是 AskX manifest 之外的软链，交互模式会展示平台、软链地址、当前目标和变更后的 AskX 目标，并默认保留现有配置。只有用户明确确认，或非交互命令同时传入 `--takeover-external-link`，才会备份并接管外部软链；之后取消 AskX 软链时会恢复原软链。普通软链本身通常不包含创建软件信息，因此无法验证时会标记为其他软件或用户创建，而不会猜测所有者。

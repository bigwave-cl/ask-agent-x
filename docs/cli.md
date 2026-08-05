# AskAgent X CLI 操作手册

本文档对应 AskAgent X `0.1.0` 的当前实现，介绍 `askx` 命令的用途、参数、操作顺序和安全边界。

- [返回项目 README](../README.md)
- [产品规划](../PLAN.md)

## 1. 运行方式

在当前仓库开发时，通过根目录脚本运行 CLI：

```bash
pnpm askx --help
```

安装 `askagent-x` 包并将其二进制加入 `PATH` 后，可以直接使用：

```bash
askx --help
```

本文后续统一使用 `askx`。在仓库内操作时，在命令前补充 `pnpm` 即可。

## 2. 核心概念

### 2.1 统一源

AskX 默认把受管 Skill 保存到：

```text
~/.askx/skills
```

统一源是 AskX 管理的唯一 Skill 内容来源。平台完成整目录绑定后，其 Skills 根目录会指向统一源，因此只需更新一份内容，各平台就能读取相同版本。

### 2.2 支持的平台

| CLI 标识 | 展示名称 | 默认 Skills 目录 |
| --- | --- | --- |
| `codex` | ChatGPT / Codex | `~/.codex/skills` |
| `claude` | Claude Code | `~/.claude/skills` |
| `cursor` | Cursor | `~/.cursor/skills` |

`askx doctor` 还会检测 `~/.agents/skills`，但它目前只是共享发现目录，不属于 `--platform` 可管理范围。

macOS 和 Linux 使用目录软链接；原生 Windows 使用目录 junction。CLI 参数和操作语义保持一致。

### 2.3 扫描、同步与软链不是同一操作

| 操作 | 是否读取 Skill | 是否修改统一源 | 是否修改平台目录 |
| --- | --- | --- | --- |
| `skills scan` | 是 | 否 | 否 |
| `skills sync` | 是 | 是，复制安全版本 | 否 |
| `skills link` | 可能，只读校验计划前置条件 | 否 | 是，建立或恢复整目录绑定 |
| `skills unlink` | 否 | 否 | 是，无损取消绑定并恢复原目录 |

`scan` 只读是指不会修改任何 Skill 内容或平台目录；如果命令选择了新的平台范围，它会把该范围保存到共享设置。

## 3. 推荐操作顺序

首次使用建议依次执行：

```bash
# 1. 检查平台、目录和链接条件
askx doctor

# 2. 只读查看已有 Skill
askx skills scan --platform claude

# 3. 把安全版本同步到统一源
askx skills sync --platform claude

# 4. 将平台的整个 Skills 目录绑定到统一源
askx skills link --platform claude

# 5. 检查当前扫描拓扑
askx skills status
```

需要恢复平台绑定前的目录时：

```bash
askx skills unlink --platform claude
```

取消绑定不会把统一源内容同步回平台，也不会删除统一源。之后再次执行 `skills link` 会恢复受管绑定。

## 4. 顶层命令

| 命令 | 作用 |
| --- | --- |
| `askx modules list` | 查看内置模块 |
| `askx doctor` | 检测 Agent 安装、Skills 目录和整目录绑定条件 |
| `askx skills` | 扫描、同步和管理 Skills 根目录绑定 |
| `askx settings` | 读取或更新 CLI/Web 共享设置 |
| `askx ui` | 启动本地 Nuxt 管理界面 |

可在任意层级追加 `--help` 查看当前版本的命令帮助：

```bash
askx --help
askx skills --help
askx skills sync --help
```

## 5. 环境诊断

### `askx modules list`

列出当前注册到 Core 的 AskX 模块。该命令不写入配置或文件。

```bash
askx modules list
```

### `askx doctor [--json]`

检查平台命令版本、默认 Skills 目录是否存在，以及目录是否具备切换为受管链接的条件。

```bash
askx doctor
askx doctor --json
```

`--json` 适用于脚本读取，不包含 Ink 装饰输出。

## 6. Skills 命令

### 6.1 公共参数

| 参数 | 适用命令 | 说明 |
| --- | --- | --- |
| `-p, --platform <platform>` | `scan`、`sync`、`link`、`unlink` | 指定 `codex`、`claude` 或 `cursor`；可以重复传入，也可以使用逗号分隔 |
| `-d, --directory <path>` | `sync` | 添加只读扫描与同步来源；最多保存 3 个自定义来源 |
| `-d, --directory <path>` | `link` | 将自定义目录作为使用端绑定到统一源；最多配置 3 个自定义绑定目录 |
| `--json` | `scan`、`sync`、`link`、`unlink` | 输出机器可读 JSON |
| `-y, --yes` | `sync`、`link`、`unlink` | 授权当前生成的不可变计划，跳过交互确认 |

平台参数的两种写法等价：

```bash
askx skills scan --platform codex --platform claude
askx skills scan --platform codex,claude
```

### 6.2 `askx skills scan`

只读扫描选中平台的 Skills 根目录，按名称、内容指纹和有效性整理扫描结果。

```bash
askx skills scan --platform claude
askx skills scan --platform codex --platform cursor --json
```

行为说明：

- 不复制、不删除、不执行 Skill 中的脚本。
- 不建立或取消软链。
- 已初始化时不传 `--platform`，默认使用共享设置中的平台。
- 首次交互运行时不传平台，会打开 Ink 多选界面。
- 首次非交互运行必须显式传入平台，否则返回 `PLATFORM_SELECTION_REQUIRED`。

### 6.3 `askx skills sync`

扫描平台和自定义来源，把能够安全处理的 Skill 复制到 `~/.askx/skills`。

```bash
# 从 Claude Code 同步
askx skills sync --platform claude

# 同时扫描平台和额外目录
askx skills sync \
  --platform claude \
  --directory /absolute/path/to/skills

# 自动化环境
askx skills sync --platform claude --yes --json
```

默认处理规则：

- 单一有效版本：接管到统一源。
- 多个平台内容完全一致：合并为统一版本。
- 同名但内容不同：保留现状，不自动覆盖。
- 无效 Skill、失效链接或无法解析的内容：保留现状并在结果中标记。
- `sync` 不会顺便建立平台软链。

写入前会生成包含扫描指纹、settings revision、manifest revision 和 `planHash` 的计划。交互终端使用 `Y` 确认，`N` 或 `Esc` 取消。

### 6.4 `askx skills link`

将选中平台的整个 Skills 根目录绑定到统一源，或恢复之前取消的受管绑定。

```bash
# 绑定或恢复一个平台
askx skills link --platform claude

# 一次处理多个平台
askx skills link --platform codex --platform cursor

# 将自定义使用目录指向统一源
askx skills link --directory /absolute/path/to/agent-skills

# 自动化环境
askx skills link --platform claude --yes --json
```

行为说明：

- 必须先完成 Skills 初始化，通常先运行一次 `skills sync`。
- `link` 可能为计划新接入读取当前扫描指纹，但不会接管、合并或同步 Skill 内容。
- 已接入的平台会返回 `skipped`，不会重复修改。
- 已取消的平台执行恢复绑定。
- 首次接入的平台会生成独立计划并保护原 Skills 根目录。
- 多个平台逐个处理；单个平台失败不会阻止其他平台继续执行。

### 6.5 `askx skills unlink`

无损取消选中平台的受管整目录链接，并恢复接入前的平台 Skills 目录。

```bash
askx skills unlink --platform claude
askx skills unlink --platform claude --yes --json
```

行为说明：

- 不把统一源内容复制回平台。
- 不删除或修改统一源中的 Skill。
- AskX 创建的链接会移动到平台旁的受管停用位置。
- 接入前的平台目录会从记录的备份关系中原样恢复。
- 之后执行 `skills link` 可以重新绑定，仍不会触发同步。
- 路径被其他内容占用时会安全失败，不覆盖占用内容。

### 6.6 `askx skills status`

扫描共享设置中启用的平台，展示内容冲突、失效链接和拓扑问题。

```bash
askx skills status
```

该命令目前没有 `--json` 参数，也不是平台绑定清单。需要查看完整绑定状态时使用 Web 的 Skills X 页面。

### 6.7 尚未开放的 Skills 命令

以下命令当前只是占位入口，执行后返回未开放提示和退出码 `2`：

```bash
askx skills update
askx skills backups list
askx skills backups restore
askx skills backups remove
```

Web 已有的备份管理能力不代表这些 CLI 子命令已经实现。

## 7. 共享设置

CLI 和 Web 共用：

```text
~/.askx/config.json
```

每次写入都会增加 revision，并记录 `updatedBy`。Web 会轮询新 revision，因此 CLI 修改语言、主题或平台范围后，已打开的 Web 会自动同步。

### `askx settings show [--json]`

```bash
askx settings show
askx settings show --json
```

输出 revision、写入来源、平台、备份偏好、语言和主题色。

### `askx settings set backup <on|off>`

```bash
askx settings set backup on
askx settings set backup off
```

更新 CLI/Web 共享的备份偏好。Skills 模块仍会遵守自身的事务快照、路径保护和回滚约束；`off` 不代表允许静默覆盖平台目录。

### `askx settings set platforms <platforms...>`

```bash
askx settings set platforms codex claude
askx settings set platforms codex,cursor
```

设置后续默认扫描和管理的平台范围，至少需要一个有效平台。

### `askx settings set language <zh-CN|en>`

```bash
askx settings set language zh-CN
askx settings set language en
```

更新 CLI 和受保护 Web 工作台的共享语言。默认中文路由不带语言前缀，英文路由使用 `/en`。

### `askx settings set theme <cyan|rose>`

```bash
askx settings set theme cyan
askx settings set theme rose
```

更新 Web 共享主题色。已打开的 Web 会在下一次设置轮询后应用新主题。

## 8. 本地 Web 管理界面

### `askx ui [--port <port>]`

构建完成后启动本地 Nuxt 服务，只监听 `127.0.0.1`：

```bash
askx ui
askx ui --port 4300
```

端口必须是 `1` 至 `65535` 的整数。启动时会生成本地会话 Token，并在终端显示访问地址；按 `Ctrl+C` 停止。

### `askx ui token`

输出当前运行中的 UI Token：

```bash
askx ui token
```

如果仓库开发服务运行在默认端口，该命令会返回开发 Token `askx-local-dev`。没有活动服务时命令会报错。

不要把 Token 写入仓库、日志或远程脚本。它只用于本机 Web 会话认证。

## 9. 自动化与 JSON 输出

只读命令可以直接使用 `--json`：

```bash
askx doctor --json
askx skills scan --platform claude --json
askx settings show --json
```

Skills 写命令在非交互或 JSON 模式下必须同时使用 `--yes`：

```bash
askx skills sync --platform claude --yes --json
askx skills link --platform claude --yes --json
askx skills unlink --platform claude --yes --json
```

缺少授权时，CLI 返回完整计划和稳定错误码：

```json
{
  "error": {
    "code": "CONFIRMATION_REQUIRED"
  },
  "plan": {}
}
```

自动化脚本不能只依赖进程退出码判断多平台操作结果，还应检查 JSON 中每个平台或事务单元的 `status`。

## 10. 数据文件

| 路径 | 用途 |
| --- | --- |
| `~/.askx/config.json` | CLI/Web 共享设置及 revision |
| `~/.askx/skills` | 统一 Skill 源目录 |
| `~/.askx/skills-manifest.json` | 受管 Skill、平台绑定和自定义目录关系 |
| `~/.askx/backups/skills` | Skills 事务备份与恢复材料 |
| `~/.askx/ui-session.json` | 当前本地 UI 会话信息 |

不要手工修改 manifest、事务备份或受管软链。需要调整绑定时使用 `skills link`、`skills unlink` 或 Web 界面。

## 11. 安全边界

Skills 写操作遵循：

```text
detect → plan → resolve → consent → apply → verify → rollback
```

- 扫描和接管过程不会执行 Skill 附带的脚本。
- 内容冲突不会自动覆盖。
- 未被 manifest 管理的目录或链接不会直接删除。
- 计划与授权通过 `planHash` 绑定；扫描内容或 revision 变化后必须重新生成计划。
- 单个平台或单个 Skill 失败时，只回滚对应事务单元。
- 软链取消和恢复只调整绑定关系，不隐式同步 Skill。

## 12. 常见问题

### 首次运行提示 `PLATFORM_SELECTION_REQUIRED`

非交互环境无法打开平台多选界面，需要显式传入平台：

```bash
askx skills scan --platform claude --json
```

### 写命令提示 `CONFIRMATION_REQUIRED`

当前环境不能进行交互确认。检查返回的计划后，重新执行并加入 `--yes`：

```bash
askx skills link --platform claude --yes --json
```

### 为什么同步后平台内容没有变化

`skills sync` 只更新 AskX 统一源，不建立平台绑定。确认统一源内容后，再执行：

```bash
askx skills link --platform claude
```

### 为什么取消软链后没有把新 Skill 复制回平台

`skills unlink` 只恢复绑定前的平台目录，不执行同步。需要复制内容时使用同步或导出能力，不要依赖取消绑定完成复制。

### Web 为什么会响应 CLI 设置

CLI 和 Web 使用同一个 `~/.askx/config.json`。CLI 写入会增加 revision，Web 在轮询周期内读取并应用新设置。

## 13. 仓库开发命令

```bash
# 构建 CLI 及其依赖
pnpm dev:prepare

# 只启动 CLI 依赖链监听
pnpm dev:cli

# 启动 CLI 与 Web 联调环境
pnpm dev

# 完整检查
pnpm check
```

CLI 命令发生变化时，应同步更新本文档和根目录 README 中的快速开始。

# AskAgent X Base CLI API

本文档对应 AskAgent X `26.812.1`，罗列安装、诊断、清空、Web 服务和卸载命令。

- [命令索引](./cli.md)
- [Skills API](./cli-skills.md)

## API 索引

| 命令 | 类型 | 作用 |
| --- | --- | --- |
| `askx --version` | 只读 | 查看当前版本。 |
| `askx --help` | 只读 | 查看命令和参数。 |
| `askx doctor` | 只读 | 检测 Agent、目录和软链环境。 |
| `askx clear` | 写入 | 清空 Skill、软链配置或全部受管数据。 |
| `askx ui` | 进程 | 前台运行 Web 服务。 |
| `askx ui start` | 进程 | 后台启动 Web 服务。 |
| `askx ui stop` | 进程 | 停止后台 Web 服务。 |
| `askx ui status` | 只读 | 查看 Web 服务状态。 |
| `askx ui restart` | 进程 | 重启后台 Web 服务。 |
| `askx ui token` | 只读 | 获取快速登录地址和 Token。 |
| `askx uninstall` | 写入 | 停止服务并卸载全局包。 |

## `askx --version`

```bash
askx --version
```

- 类型：只读。
- 输出：当前安装版本。

## `askx --help`

```bash
askx --help
askx <command> --help
askx skills <command> --help
```

- 类型：只读。
- 输出：当前版本实际注册的命令、子命令和参数。

## `askx doctor`

```bash
askx doctor [--json]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--json` | 否 | 输出纯 JSON。 |

- 类型：只读。
- 输出：ChatGPT/Codex、Claude Code、Cursor 的检测结果、默认 Skills 路径和软链接入条件。
- 不会：扫描 Skill 内容、创建统一源或修改目录。

## `askx clear`

```bash
askx clear [--links] [--skills] [--backup-name <name> | --no-backup] [-y] [--json]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--links` | 否 | 只清空受管软链及其配置。 |
| `--skills` | 否 | 只清空用户 Skill，保留系统 Skill Manager。 |
| `--backup-name <name>` | 否 | 创建备份并指定名称。 |
| `--no-backup` | 否 | 不创建备份；不能与 `--backup-name` 同时使用。 |
| `-y, --yes` | 否 | 确认执行生成的计划。 |
| `--json` | 否 | 输出纯 JSON。 |

- 类型：写入。
- 默认：同时清空 Skill 和软链配置，并在清空前备份。
- 交互：裸命令选择清空模块、是否备份和备份名称，再确认最终计划。
- 输出：Skill 和软链分别统计已清空、未清空、已备份、未备份，并输出可打开的完整备份路径。
- 不会：清空语言、主题、Web 服务、历史备份或 Registry。

## Web 服务 API

### `askx ui`

```bash
askx ui [-p, --port <port>]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `-p, --port <port>` | 否 | 指定监听端口。 |

- 类型：前台进程。
- 效果：在当前终端运行 Web 服务；`Ctrl+C` 停止。
- 地址：只监听 `127.0.0.1`。

### `askx ui start`

```bash
askx ui [-p, --port <port>] start [--json]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `-p, --port <port>` | 否 | 指定监听端口；属于 `ui` 父命令。 |
| `--json` | 否 | 输出运行状态、PID、端口和 URL JSON。 |

- 类型：后台进程写入。
- 效果：启动后台服务后退出当前命令；服务已运行时不重复启动。
- 端口：开发环境固定 `4242`；发布版默认复用记录的生产端口。
- 冲突：端口被占用时失败，不自动换端口或终止其他进程。

### `askx ui stop`

```bash
askx ui stop [--json]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--json` | 否 | 输出停止结果 JSON。 |

- 类型：后台进程写入。
- 效果：停止 AskX 后台服务并释放端口；服务未运行时不影响其他进程。

### `askx ui status`

```bash
askx ui status [--json]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--json` | 否 | 输出状态 JSON。 |

- 类型：只读。
- 输出：是否运行；运行时包含 PID、端口、启动时间和可点击 URL。

### `askx ui restart`

```bash
askx ui [-p, --port <port>] restart [--json]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `-p, --port <port>` | 否 | 指定重启后的端口；属于 `ui` 父命令。 |
| `--json` | 否 | 输出新进程状态 JSON。 |

- 类型：后台进程写入。
- 效果：停止当前服务后重新启动；未指定端口时复用当前端口。
- 会话：重启后 Token 可能变化，重新执行 `askx ui token`。

### `askx ui token`

```bash
askx ui token
```

- 类型：只读。
- 输出：可点击的 `http://127.0.0.1:<port>/?token=<token>` 快速登录地址，以及单独一行 Token。
- 开发环境：检测到 `4242` 开发服务时使用 `askx-local-dev`。
- 安全：Token 只用于建立本地 HttpOnly Cookie 会话，不应写入仓库或共享日志。

## `askx uninstall`

```bash
askx uninstall
```

- 类型：进程与安装写入。
- 效果：停止 Web 后台服务，再调用安装记录对应的 npm、pnpm、Yarn Classic 或 Bun 全局卸载命令。
- 限制：源码目录运行时没有全局安装记录，不能执行自动卸载。

## 安装 API

需要 Node.js 22+。以下命令任选一个：

```bash
npm install --global askagent-x
pnpm add --global askagent-x
yarn global add askagent-x
bun add --global askagent-x
```

| 包管理器 | 自动启动 Web | 卸载命令 |
| --- | --- | --- |
| npm | 允许生命周期脚本时自动启动 | `npm uninstall --global askagent-x` |
| pnpm | 允许生命周期脚本时自动启动 | `pnpm remove --global askagent-x` |
| Yarn Classic 1.x | 允许生命周期脚本时自动启动 | `yarn global remove askagent-x` |
| Bun | 生命周期脚本可能被信任策略阻止 | `bun remove --global askagent-x` |

安装后检查：

```bash
askx --version
askx ui status
askx ui start
askx ui token
```

首次在交互终端执行 `askx` 时选择中文或 English；CLI 语言与 Web 浏览器语言相互独立。后台启动失败时查看 `~/.askx/ui.log`。

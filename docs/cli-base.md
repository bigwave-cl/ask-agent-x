# AskAgent X CLI 基础使用

本文档对应 AskAgent X `26.806.3`，说明安装后的基础命令、环境诊断、Web 服务和自动化调用规则。

- [CLI 文档总览](./cli.md)
- [Skills 管理](./cli-skills.md)

## 1. 安装与确认

AskAgent X 需要 Node.js 22+。可选择任一支持持久全局安装的包管理器：

```bash
npm install --global askagent-x
pnpm add --global askagent-x
yarn global add askagent-x
bun add --global askagent-x
```

其中 `yarn global` 仅适用于 Yarn Classic（1.x）；Yarn Modern 不再提供全局安装，建议改用 npm、pnpm 或 Bun。安装后确认：

```bash
askx --version
askx --help
```

`askx --version` 输出当前安装版本。`askx --help` 显示一级命令：

| 命令 | 作用 |
| --- | --- |
| `askx doctor` | 检测平台、Skills 路径和软链条件 |
| `askx skills` | 查看和管理 Skill |
| `askx ui` | 管理本地 Web 服务 |
| `askx uninstall` | 停止 Web 服务并卸载 AskAgent X |

查看任意命令的参数：

```bash
askx <command> --help
askx skills <command> --help
```

## 2. 环境诊断

```bash
askx doctor
askx doctor --json
```

诊断内容：

- ChatGPT / Codex、Claude / Claude Code、Cursor 是否可识别。
- CLI 版本、桌面客户端或用户配置目录。
- 每个平台的默认 Skills 根目录。
- 目录是否允许建立 AskX 受管软链。

默认目录：

| 平台 | Skills 根目录 |
| --- | --- |
| ChatGPT / Codex | `~/.codex/skills` |
| Claude / Claude Code | `~/.claude/skills` |
| Cursor | `~/.cursor/skills` |
| Agents shared | `~/.agents/skills`，只参与只读发现 |

`doctor` 只做检测，不会扫描 Skill 内容、创建统一源或修改平台目录。

## 3. 通用参数与写入规则

| 参数 | 作用 |
| --- | --- |
| `--json` | 输出机器可读 JSON，不混入终端装饰 |
| `-y, --yes` | 授权已经展示和签名的写入计划，跳过交互确认 |

AskX 写操作遵循：

```text
detect → plan → resolve → consent → apply → verify → rollback
```

交互终端会显示计划和计划 Hash，按 `Y` 确认，按 `N` 或 `Esc` 取消。非交互环境必须显式传入 `--yes`；该参数不会绕过计划签名、revision、冲突检测或写后验证。

自动化示例：

```bash
askx doctor --json
askx skills status --json
askx skills sync --platform codex --yes --json
```

## 4. 数据范围

AskAgent X 默认只操作当前设备中的本地数据，不上传 Skill 内容，不采集后台 usage，不执行 Skill 附带脚本。

主要本地目录：

| 路径 | 内容 |
| --- | --- |
| `~/.askx/config.json` | AskX 内部状态与 Web 偏好 |
| `~/.askx/skills` | AskX 统一 Skill 源 |
| `~/.askx/install.json` | 全局安装使用的包管理器和包目录 |
| `~/.askx/ui-session.json` | 本地 Web 后台会话信息 |
| `~/.askx/ui.log` | 最近一次后台 Web 启动和运行日志 |

Skills、备份和事务的详细规则见 [Skills 管理文档](./cli-skills.md)。

## 5. Web 服务管理

### 5.1 安装后自动启动

包内提供 `postinstall` 启动入口。npm、pnpm 或 Yarn Classic 允许依赖生命周期脚本时，正常全局安装后会自动在后台启动 Web 服务，安装命令本身会正常退出。

```bash
npm install --global askagent-x
pnpm add --global askagent-x
yarn global add askagent-x
```

确认状态：

```bash
askx ui status
```

如果包管理器禁用了依赖生命周期脚本，需要手动启动。常见情况包括 npm/pnpm 的 `--ignore-scripts`，以及 Bun 默认不信任依赖的生命周期脚本：

```bash
npm install --global --ignore-scripts askagent-x
```

自动启动会被跳过，需要手动执行：

```bash
askx ui start
```

### 5.2 服务边界

- 只监听 `127.0.0.1`，不对局域网或公网开放。
- 发布版未指定端口时自动选择可用的五位端口。
- 每次启动生成新的本地会话 Token。
- Token 不写入普通配置文件或业务日志。
- 浏览器验证成功后使用 HttpOnly Cookie 保存会话。

### 5.3 前台运行

```bash
askx ui
askx ui --port 4300
```

作用：在当前终端以前台方式运行 Web 服务，适合临时使用和故障排查。

效果：终端持续占用，按 `Ctrl+C` 停止。前台模式不由后台服务命令接管。

### 5.4 后台启动

```bash
askx ui start
askx ui start --port 4300
askx ui start --json
```

作用：启动后台 Web 服务并让当前命令退出。

输出：运行状态、PID、端口和访问地址。已有服务运行时不会重复启动。

不指定端口时由系统选择可用端口；指定端口被占用时启动失败，不会停止占用该端口的其他进程。

### 5.5 查看状态

```bash
askx ui status
askx ui status --json
```

显示后台服务是否运行、PID、监听端口和本地访问地址。该命令只读，不启动或停止服务。

### 5.6 获取登录地址和 Token

```bash
askx ui token
```

输出：

```text
快速登录地址: http://127.0.0.1:<port>/?token=<token>
Token: <token>
```

使用方式：

1. 复制第一行完整地址到浏览器。
2. Web 自动校验 URL 中的 Token。
3. 验证成功后建立 Cookie 会话。
4. Web 从地址栏移除 Token。

如果登录页已经打开，可以复制第二行 Token 到页面完成验证。不要把 Token 写入仓库、截图、远程脚本或共享日志。

支持 OSC 8 的终端会把第一行完整地址显示为可点击超链接；重定向输出或不支持超链接的终端仍显示可复制的普通 URL。

### 5.7 停止服务

```bash
askx ui stop
askx ui stop --json
```

作用：停止 AskX 后台进程并等待退出，释放监听端口并清理有效会话状态。服务未运行时不会影响其他进程。

### 5.8 重启服务

```bash
askx ui restart
askx ui restart --port 4300
askx ui restart --json
```

作用：先停止当前后台服务，再启动新服务。PID 和 Token 可能变化；重启后应重新执行：

```bash
askx ui token
```

### 5.9 常见问题

安装后无法打开页面：

```bash
askx ui status
askx ui start
askx ui token
```

后台服务启动失败时，CLI 会提示 `~/.askx/ui.log`，其中保存最近一次后台启动的真实服务错误；每次重新启动会覆盖旧日志。

Token 失效时获取当前服务的新 Token：

```bash
askx ui token
```

指定端口冲突时换一个端口，或不指定端口让系统自动选择：

```bash
askx ui restart --port 4301
askx ui restart
```

### 5.10 安全卸载

推荐命令：

```bash
askx uninstall
```

执行顺序：

1. 检查后台服务。
2. 停止服务并等待进程退出。
3. 根据安装记录调用 npm、pnpm、Yarn Classic 或 Bun 的全局卸载命令。

包管理器不能为这个场景提供一致、可靠的卸载前钩子。直接删除全局包可能先移除源文件，但已经运行的 Node 进程仍会继续占用端口。

必须直接使用包管理器时，先停止服务，再执行安装时对应的卸载命令：

```bash
askx ui stop
npm uninstall --global askagent-x
pnpm remove --global askagent-x
yarn global remove askagent-x
bun remove --global askagent-x
```

如果包已被直接删除但进程仍在运行，可读取 `~/.askx/ui-session.json` 中记录的 PID，核对进程身份后手动停止。

### 5.11 Web 服务 API 速查

| 命令 | 作用效果 | JSON |
| --- | --- | --- |
| `askx ui` | 前台启动，终端退出时停止 | 不支持 |
| `askx ui start` | 启动后台服务 | 支持 |
| `askx ui stop` | 停止后台服务 | 支持 |
| `askx ui status` | 只读查看状态 | 支持 |
| `askx ui restart` | 停止并重新启动 | 支持 |
| `askx ui token` | 只读输出当前登录凭据 | 不支持 |
| `askx uninstall` | 停止服务并卸载全局包 | 不支持 |

# AskAgent X

AskAgent X 是本地优先、无遥测的跨 Agent Skills 管理工具，CLI 命令为 `askx`。

## 安装

```bash
npm install --global askagent-x
pnpm add --global askagent-x
yarn global add askagent-x
bun add --global askagent-x
askx --help
```

以上安装命令任选其一；Yarn 仅支持 Yarn Classic（1.x），运行时要求 Node.js 22+。npm、pnpm 或 Yarn Classic 允许生命周期脚本时会通过 `postinstall` 自动启动后台 UI；Bun 默认阻止不受信任依赖的生命周期脚本，安装后需执行 `askx ui start`。使用 `askx ui start|status|stop|restart` 管理服务，使用 `askx ui token` 获取快速登录地址和当前会话 token。

支持 OSC 8 的终端会将 `askx ui token` 输出的快速登录地址显示为可点击超链接，同时保留完整 URL 便于复制。

运行 `askx skills` 可直接查看当前 Skill 列表；首次运行会依次选择扫描平台、展示文件夹与待处理 Skill、选择软链平台并确认保存。使用 `askx skills stats` 查看版本、使用次数和关联目标统计。

使用 `askx clear` 交互选择清空范围、是否备份和备份名称；也可通过 `--backup-name <名称>` 或 `--no-backup` 提前指定。使用 `askx skills backups list|restore|remove` 管理清理后的备份。

## 命令 API 文档

- [CLI 命令索引](https://github.com/bigwave-cl/ask-agent-x/blob/main/docs/cli.md)：按使用场景快速定位命令
- [基础与 Web API](https://github.com/bigwave-cl/ask-agent-x/blob/main/docs/cli-base.md)：安装、诊断、清空、Web 服务、Token 和卸载
- [Skills API](https://github.com/bigwave-cl/ask-agent-x/blob/main/docs/cli-skills.md)：所有 Skills 命令、参数、副作用和示例

## 卸载

推荐使用：

```bash
askx uninstall
```

该命令会先停止后台 UI，确认进程退出，再调用安装时使用的 npm、pnpm、Yarn Classic 或 Bun 全局卸载当前包。直接运行包管理器卸载命令可能删除包文件但留下仍占用端口的后台进程。

如需直接使用包管理器，请先停止服务，再运行对应卸载命令：

```bash
askx ui stop
npm uninstall --global askagent-x
pnpm remove --global askagent-x
yarn global remove askagent-x
bun remove --global askagent-x
```

如果包已经被直接卸载但服务仍在运行，可查看 `~/.askx/ui-session.json` 中记录的 PID，确认进程身份后手动停止。禁用安装脚本会跳过安装后的自动启动。

完整文档与源码见 [AskAgent X GitHub 仓库](https://github.com/bigwave-cl/ask-agent-x)。

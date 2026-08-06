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

使用 `askx settings reset` 恢复全部共享设置默认值；该命令不会删除 Skills、备份或受管链接。

运行 `askx skills` 可直接查看当前 Skill 列表；首次运行会依次选择扫描平台、展示文件夹与待处理 Skill、选择软链平台并确认保存。使用 `askx skills stats` 查看版本、使用次数和关联目标统计。

使用 `askx skills clear` 按计划清空当前 Skill 列表并创建可恢复备份；使用 `askx skills backups list|restore|remove` 管理清理后的备份。

## 使用文档

- [CLI 基础使用](https://github.com/bigwave-cl/ask-agent-x/blob/main/docs/cli-base.md)：安装、诊断、共享设置、Web 服务、Token 和安全卸载
- [Skills 管理](https://github.com/bigwave-cl/ask-agent-x/blob/main/docs/cli-skills.md)：查看、扫描、验证、软链、管理、统计和完整 API

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

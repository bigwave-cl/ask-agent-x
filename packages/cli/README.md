# AskAgent X

AskAgent X 是本地优先、无遥测的跨 Agent Skills 管理工具，CLI 命令为 `askx`。

## 安装

```bash
npm install --global askagent-x
askx --help
```

全局安装完成后会通过 npm `postinstall` 自动启动后台 UI。使用 `askx ui start|status|stop|restart` 管理服务，使用 `askx ui token` 获取当前会话 token。

## 卸载

推荐使用：

```bash
askx uninstall
```

该命令会先停止后台 UI，确认进程退出，再调用 npm 全局卸载当前包。现代 npm 不执行可靠的卸载生命周期钩子，因此直接运行 `npm uninstall --global askagent-x` 可能删除包文件但留下仍占用端口的后台进程。

如需直接使用 npm，请执行：

```bash
askx ui stop && npm uninstall --global askagent-x
```

如果包已经被直接卸载但服务仍在运行，可查看 `~/.askx/ui-session.json` 中记录的 PID，确认进程身份后手动停止。使用 `npm install --ignore-scripts` 会跳过安装后的自动启动。

完整文档与源码见 [AskAgent X GitHub 仓库](https://github.com/bigwave-cl/ask-agent-x)。

# npm 本地安装、验证与发布

AskAgent X 在发布到 npm Registry 前，先作为普通全局 npm 包在本机安装和使用。构建、安装验证与正式发布必须使用项目内生成的同一个 tarball，发布前不再重新打包。

## 1. 构建发布包

在仓库根目录执行：

```bash
pnpm install
pnpm package:pack
```

`pnpm package:pack` 会依次完成 Core、平台适配器、Skills、Web 和 CLI 构建，再执行 `npm pack`：

- `packages/cli/dist/`：npm 包内部的 CLI、Web 生产服务和内置 Skill。
- `dist/npm/`：最终用于本地安装和正式发布的 tarball。

当前版本的产物为：

```text
./dist/npm/askagent-x-26.805.1.tgz
```

每次执行都会清理并重新创建 `dist/npm/`，避免误用旧产物。

## 2. 像普通 npm 包一样安装

直接全局安装项目生成的 tarball，不需要额外的 `--prefix`：

```bash
npm install --global ./dist/npm/askagent-x-26.805.1.tgz
```

安装完成后，npm `postinstall` 会自动启动后台 Web UI。安装命令会正常退出，后台服务继续运行。

检查安装和服务状态：

```bash
askx --version
askx ui status
askx ui token
askx doctor
```

服务只监听 `127.0.0.1`，未指定端口时自动选择一个可用的五位端口。`askx ui status` 会显示当前地址、端口和 PID。

如果安装时显式使用 `--ignore-scripts`，npm 会跳过 `postinstall`，此时需要手动运行：

```bash
askx ui start
```

## 3. 管理后台服务

```bash
# 查看状态
askx ui status

# 启动
askx ui start

# 停止
askx ui stop

# 重启
askx ui restart

# 获取当前会话 token
askx ui token
```

直接执行 `askx ui` 仍会以前台方式启动，主要用于开发和故障排查；按 `Ctrl+C` 即可停止前台服务。

## 4. 更新本地安装版本

正式生成新构建前，先更新“年月日次”版本号。同一天的后续构建依次使用：

```text
26.805.1
26.805.2
26.805.3
```

停止当前服务，重新构建并安装新 tarball：

```bash
askx ui stop
pnpm package:pack
npm install --global ./dist/npm/askagent-x-26.805.2.tgz
```

新包安装完成后会自动启动后台服务。随后检查：

```bash
askx --version
askx ui status
askx doctor
```

不要在旧后台服务仍运行时直接覆盖安装，因为旧进程可能继续使用已经被替换的包目录。

## 5. 卸载

推荐使用 AskAgent X 自带的受管卸载命令：

```bash
askx uninstall
```

执行顺序为：

```text
停止后台 UI → 确认进程退出 → 调用 npm 全局卸载 askagent-x
```

现代 npm 不执行可靠的卸载生命周期钩子，因此直接运行下面的命令不能保证后台服务停止：

```bash
npm uninstall --global askagent-x
```

如果必须直接使用 npm，请执行：

```bash
askx ui stop && npm uninstall --global askagent-x
```

若包文件已经被直接卸载，但后台进程仍在运行，可以查看：

```bash
cat "$HOME/.askx/ui-session.json"
```

文件中记录了服务 PID 和端口。手动停止前必须确认 PID 仍属于 AskAgent X，避免 PID 被系统复用后误杀其他进程。

## 6. 发布前检查

先检查仓库，再重新生成准备发布的最终产物：

```bash
pnpm check
pnpm package:pack
```

检查 tarball 元数据和内容：

```bash
tar -xOf ./dist/npm/askagent-x-26.805.1.tgz package/package.json
tar -tzf ./dist/npm/askagent-x-26.805.1.tgz
```

发布包至少应包含：

- `dist/index.js`：CLI 入口和 AskX 内置模块。
- `dist/lifecycle.mjs`：全局安装后的后台启动入口。
- `dist/web/.output/`：Nuxt 生产服务和静态资源。
- `dist/builtin/askx-skill-manager/`：内置系统 Skill。
- `package.json`。
- `README.md`。

然后安装这份最终 tarball，并进行一段时间的真实使用验证：

```bash
askx ui stop
npm install --global ./dist/npm/askagent-x-26.805.1.tgz
askx --version
askx ui status
askx doctor
```

## 7. 发布同一个已验证产物

本地观察通过后，不再执行 `npm pack`，直接发布已经安装和验证过的同一个文件：

```bash
npm publish ./dist/npm/askagent-x-26.805.1.tgz --access public
```

完整链路为：

```text
更新版本号
→ pnpm check
→ pnpm package:pack
→ npm install -g ./dist/npm/<tarball>
→ 本地持续使用和验证
→ npm publish ./dist/npm/<同一个 tarball> --access public
```

正式发布前还需要确认 npm 登录状态、包名权限、许可证和发布可见性。

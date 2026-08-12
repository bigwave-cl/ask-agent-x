# AskAgent X CLI 命令索引

本文档对应 AskAgent X `26.812.1`。这里按使用场景索引命令；参数和副作用以 API 文档为准。

- [基础与 Web API](./cli-base.md)
- [Skills API](./cli-skills.md)
- [返回项目 README](../README.md)

## 按场景找命令

| 我需要…… | 命令 | API |
| --- | --- | --- |
| 查看版本或帮助 | `askx --version`、`askx --help` | [基础 API](./cli-base.md#命令-api) |
| 检查平台和目录环境 | `askx doctor` | [doctor](./cli-base.md#askx-doctor) |
| 查看当前 Skill | `askx skills` | [skills](./cli-skills.md#askx-skills) |
| 完整重新扫描 | `askx skills scan` | [scan](./cli-skills.md#askx-skills-scan) |
| 从指定平台或文件夹导入 | `askx skills scan --platform claude` | [scan](./cli-skills.md#askx-skills-scan) |
| 设置或恢复软链 | `askx skills link --platform claude` | [link](./cli-skills.md#askx-skills-link) |
| 取消软链 | `askx skills unlink --platform claude` | [unlink](./cli-skills.md#askx-skills-unlink) |
| 检查 Skill 和软链状态 | `askx skills status` | [status](./cli-skills.md#askx-skills-status) |
| 在本地与共享范围间迁移 Skill | `askx skills scope my-skill --local` | [scope](./cli-skills.md#askx-skills-scope-skill-name) |
| 查看统计 | `askx skills stats` | [stats](./cli-skills.md#askx-skills-stats) |
| 记录一次 Skill 使用 | `askx skills usage record my-skill` | [usage](./cli-skills.md#askx-skills-usage-record-name-or-id) |
| 查看或回滚事务 | `askx skills history list` | [事务 API](./cli-skills.md#事务与修复) |
| 管理清空备份 | `askx skills backups list` | [备份 API](./cli-skills.md#备份管理) |
| 清空 Skill 或软链配置 | `askx clear` | [clear](./cli-base.md#askx-clear) |
| 启动 Web 后台服务 | `askx ui start` | [UI API](./cli-base.md#web-服务-api) |
| 获取 Web 登录地址 | `askx ui token` | [token](./cli-base.md#askx-ui-token) |
| 停止服务并卸载 | `askx uninstall` | [uninstall](./cli-base.md#askx-uninstall) |

## 参数约定

| 参数 | 含义 |
| --- | --- |
| `--json` | 输出纯 JSON，适合脚本读取。 |
| `-y, --yes` | 对已经生成并签名的写入计划确认执行；不会跳过检测、冲突校验或回滚保护。 |
| `-p, --platform <platform>` | 平台标识：`codex`、`claude`、`cursor`；支持逗号分隔或重复传入。 |
| `-d, --directory <path>` | 自定义绝对目录；支持重复传入。 |

所有写操作遵循 `detect → plan → resolve → consent → apply → verify → rollback`。交互中取消或中断时，本次计划作废。

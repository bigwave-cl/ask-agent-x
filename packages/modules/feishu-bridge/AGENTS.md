# @askx/module-feishu-bridge Agent Guide

本模块与 `@askx/module-skills` 同级，独立拥有 Feishu-Codex 桥接服务的配置消费、runtime 状态和生命周期。

- Core 负责 schema、默认值、revision、锁、计划和授权；本模块只消费标准配置。
- CLI/Web 只能调用本模块公开的服务管理器，不得直接改 LaunchAgent、PID 或 runtime 状态。
- 不依赖 `@askx/module-skills`，不把桥接状态或资源写入 Skills registry。
- 新增或修改的 TypeScript 注释使用中文；公开类型、状态和函数补充中文 JSDoc。
- 所有服务动作必须支持幂等、显式确认和失败回滚；测试使用临时目录与 mock runtime。

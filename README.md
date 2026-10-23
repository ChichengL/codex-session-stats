# Codex Session Stats

为 macOS Codex 桌面端增加输入框下方的会话统计和侧栏额度显示。独立安装，无需预装 codex-usage-badge。项目基于该项目的 MIT 源码开发，来源见 [NOTICE](NOTICE.md)。

当前为 `0.1.0-alpha.1` 预发布版，支持 Apple Silicon 和 Intel。非官方扩展，依赖客户端内部界面和本机调试接口，客户端更新后可能需要适配。

## 功能

- 输入框下方居中显示轮次、步数、轮均输出速度、累计 Token、缓存命中率和上下文占用。
- 悬停查看详情，点击固定详情卡，按 Esc 或点击外部关闭。
- 双输入区分别绑定自己的会话。持久会话读取本地日志，临时侧聊读取客户端内存中的统计字段。
- 切回已访问会话时先展示内存缓存，再校验本地记录。首次进入仍需读取日志。
- 保留侧栏额度圆环、项目配色、文件夹容量和会话 Token 显示。

轮均输出速度采用最近完成轮次的输出 Token 除以整轮耗时，包含思考、工具执行和等待。临时会话缺少的数据显示为“未记录”或 `—`，不补造 TPS。指标定义和数据来源见 [统计口径](docs/metrics.md)。

## 安装

从 [GitHub Releases](https://github.com/ChichengL/codex-session-stats/releases) 下载 `CodexSessionStats-macOS-版本号.zip`，完整解压后运行 `安装.command`。已安装原版或内部版 codex-usage-badge 时，先使用原插件的卸载入口移除它。

安装完成后，结束正在运行的任务，再按 `⌘Q` 完全退出客户端。从原来的应用图标打开。`诊断.command` 查看连接和各输入区状态；`卸载.command` 移除本扩展。

安装器需要 Node.js 24+，会优先使用客户端自带的运行环境。普通安装无需 Python 或编译工具。详细步骤、自定义应用位置及故障处理见 [macOS 安装](docs/macos.md)。

## 开发与发布

源码位于 `src/`，`build.py` 将其合并成无第三方运行时依赖的 `agent.cjs`。原生启动助手由公开的 Objective-C 源码编译。

构建、隔离测试、白名单审计和发布操作见 [开发说明](docs/development.md)。安装包和源码包都附带 SHA-256 文件清单。项目使用手动更新。

[隐私与安全](SECURITY.md) · [问题反馈](https://github.com/ChichengL/codex-session-stats/issues) · [MIT 许可](LICENSE)

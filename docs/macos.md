# macOS 安装

安装包提供 Apple Silicon 和 Intel 通用启动助手，需要已安装的 macOS Codex 桌面端及 Node.js 24+。启动脚本优先使用客户端自带的 Node.js。原生助手使用临时签名，尚未经过 Apple 公证。

## 安装步骤

1. 若已安装 codex-usage-badge，先使用原插件的卸载入口移除它。两个扩展共用客户端调试接口和部分界面元素，不能同时运行。
2. 下载 macOS ZIP 和外部 `SHA256SUMS.txt`，在下载目录运行 `shasum -a 256 -c SHA256SUMS.txt`。同一清单也列出了源码 ZIP；只下载 macOS 包时，可用 `shasum -a 256 文件名.zip` 手动核对对应行。
3. 将 ZIP 完整解压，双击 `安装.command`。若脚本被系统阻止，可在解压目录运行 `bash ./安装.command`。
4. 结束正在运行的任务，再按 `⌘Q` 完全退出 Codex。从原来的应用图标打开，等待启动助手建立连接。
5. 运行 `诊断.command`，检查后台、主窗口连接数和 `threadMetrics` 中各输入区的状态。

安装器不会退出正在使用的客户端。安装失败时会尝试恢复安装前的程序文件和后台服务。它不修改客户端应用包或签名。

## 更新与卸载

更新时下载本项目的新安装包，再运行 `安装.command`。本项目不自动下载更新。

`卸载.command` 停止本扩展的后台，移除可连接窗口中的扩展界面，并把扩展文件移入废纸篓。不可连接窗口中的残留界面会在下次打开客户端时清除。卸载不会删除聊天记录或修改账号登录状态。

## 自定义位置

安装器查找 `Codex.app` 或带有 Codex CLI 的 `ChatGPT.app`。自定义位置可通过环境变量指定：

```bash
CODEX_BADGE_APP="$HOME/Apps/Codex.app" bash ./安装.command
```

扩展文件位于 `~/Library/Application Support/CodexSessionStats`，日志位于 `~/Library/Logs/CodexSessionStats.*.log`。配置名称沿用上游的 `CODEX_BADGE_*` 环境变量。

## 常见情况

- 主窗口连接数为 0：结束任务后完全退出客户端，再从原图标打开。启动时立即输入或切换应用，可能使助手跳过本次自动加载；两次重开尝试有冷却时间。
- 额度不可用：核对客户端与 CLI 的账号状态。API Key 登录可能没有订阅额度。
- 指标显示 `—`：该来源未提供相应字段，或记录尚未完整加载。远程和云端会话不跨环境读取。
- 更新客户端后失效：先运行诊断脚本。内部界面或字段变化可能需要适配新版本扩展。

数据访问范围与调试端口的影响见 [隐私与安全](../SECURITY.md)。

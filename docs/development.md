# 开发与发布

开发环境需要 Node.js 24+、Python 3.10+ 和 macOS Xcode Command Line Tools。运行时仅使用 Node.js 内置模块；Playwright 用于测试，不随安装包分发。

## 构建与测试

在源码根目录运行：

```bash
npm ci --ignore-scripts
npx playwright install chromium --only-shell
python3 scripts/build_release.py --platform macOS
npm test
python3 tests/release.py
node tests/startup-native.cjs .devtools/macos-startup-bridge
python3 scripts/audit_release.py
```

`build.py` 合并 `src/` 中的代码；`scripts/build_native.py` 从 `macos/startup/bridge.m` 编译 arm64 / x86_64 通用助手，并检查临时签名。`scripts/build_release.py` 生成 macOS 安装 ZIP、源码 ZIP 和外部 SHA-256 清单。

源码 ZIP 由 `release-files.json` 明确列出文件。新增源码或文档时需要更新该清单。审计脚本会拒绝清单外的源码文件，并逐项核对两个 ZIP 的内容与当前源码、文件权限、CRC 和校验清单。生成的 `agent.cjs`、`dist/`、`.devtools/`、依赖目录和 Git 元数据不进入源码 ZIP。

测试使用模拟页面、临时数据库、日志 fixture 和隔离的应用。安装测试模拟用户目录、launchctl 和客户端操作，不使用真实账号数据。原生助手测试仅创建临时隐藏应用。

浏览器下载受网络限制时，可使用本机已有的 Chrome 执行 UI 测试：

```bash
PLAYWRIGHT_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm test
```

## 分发边界

本项目复用上游的本机安装和启动机制，使用独立安装目录与后台任务名称。首版移除自动更新链路，避免下载上游包覆盖本项目的统计功能。增加自动更新时，需要先确定本项目发行资产的校验与来源约束。

独立命名空间不能解决同时注入的问题。两个扩展仍会访问同一客户端，所以安装器会拒绝与 codex-usage-badge 共存。安装器不自动关闭或卸载原扩展。

双输入区、持久与临时来源、字段异常隔离和详情卡交互由 fixture 覆盖。真实非空临时侧聊在中断后继续运行的完整场景尚未完成验收。当前仓库不发布 Windows 安装包，客户端更新后的兼容性也需要重新验证。

## GitHub 发布

目标仓库为 [ChichengL/codex-session-stats](https://github.com/ChichengL/codex-session-stats)。更新版本时，同步修改 `package.json`、`package-lock.json`、`src/agent-main.js` 和 `manage.cjs`，再运行上面的构建、测试和审计。

CI 使用 macOS runner 构建、测试和审计，并提供发行候选附件；它不自动发布 GitHub Release。维护者发布预发布版时，上传 `dist/` 中对应版本的两个 ZIP 和 `SHA256SUMS.txt`。

提交代码前检查 `git diff` 和审计输出，避免加入账号配置、诊断日志、真实截图、数据库或解包的客户端资源。来源与版权说明见 [NOTICE](../NOTICE.md)。

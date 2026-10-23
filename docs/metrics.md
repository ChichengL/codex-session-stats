# 统计口径

统计实现位于 [thread-metrics-reader.js](https://github.com/ChichengL/codex-session-stats/blob/main/src/thread-metrics-reader.js) 和 [thread-metrics-ui.js](https://github.com/ChichengL/codex-session-stats/blob/main/src/thread-metrics-ui.js)。账号额度与会话统计使用不同来源，不互相推算。

| 指标 | 持久会话来源与含义 | 临时侧聊 |
| --- | --- | --- |
| 轮次 | 日志中识别的去重轮次 | 仅在轮次元数据完整加载且身份可确认时计数 |
| 本轮步数 | 当前轮次中按 `response_id` 去重的模型响应数 | 未提供 |
| 轮均输出速度 | 最近完成轮次的输出 Token 除以 `duration_ms`，包含思考、工具执行和等待 | 缺少轮输出用量，不计算 |
| 首 Token 延迟 | 轮次日志提供的 `time_to_first_token_ms` | 未提供 |
| 累计 Token | 输入与输出的累计值，输出已包含推理 Token | 客户端的累计用量，可能继承分叉前的 Token |
| 缓存命中率 | 缓存读取 Token / 输入 Token | 同左，仅在字段有效时显示 |
| 上下文占用 | 最近请求用量 / 模型上下文窗口，作为近似值 | 客户端提供最近请求用量与窗口时计算 |

双输入区分别绑定当前输入框的本地会话身份。右侧页签的名称不能判定持久性；扩展根据会话记录的 `ephemeral` 字段选择本地日志或客户端内存。身份不明确时不展示该输入区的统计。

持久会话切换时可先展示该会话上次的内存缓存，并标注正在校验。首次访问、缓存失效或重开页面后仍需读取日志。缓存容量有界，不写入磁盘。

临时会话的累计用量、上下文和轮次分别校验。某组字段异常时，只将相应指标设为未知。缺失数据保持未知，不按 0 显示。客户端未提供系统提示词、工具定义和对话消息的完整分类用量，因此详情卡只显示可确认的总量。

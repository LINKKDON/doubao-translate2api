# 更新记录

本文件记录本项目的主要变更。版本号与 `package.json` 保持一致。

## v0.2.1

### 字幕模式

- `subtitle` 不再把单条字幕内部的多行拆分或归一化：只把独立一行的 `%%` 当作字幕边界，普通空行、连续空行、CRLF 和正文首尾空白都原样保留并回填。
- 新增 `subtitle-context` 上下文模式：整个正文作为一个上游翻译单元发送，保留 `%%` 结构，用于改善相邻字幕的上下文连贯性。
- `subtitle-context` 会校验上游返回的独立 `%%` 分隔符数量，数量不一致时返回 `502 upstream_stream_error`，避免字幕错位。
- `x-doubao-context-mode` 只接受 `default` / `subtitle` / `subtitle-context`，其他值返回 `400 invalid_request`。

### 稳定性与错误语义

- 上游 `429` 改为 `rate_limit_error`，并透传合法的 `Retry-After`；CORS 暴露 `Retry-After` 与 `x-request-id`。
- `Retry-After` 只透传纯秒数或标准 RFC 1123 HTTP-date，不再接受可被 `Date.parse` 误判的其他字符串（如 `7.5`）。
- 上游 `5xx` 和网络异常增加 1 次随机退避重试（`200–399 ms`），仍失败时保持原有 `502` / `504` 语义。
- 区分上游超时与客户端取消：上游超时返回 `504 upstream_timeout` 且不重试；客户端断开返回 `499 request_cancelled`，不再误报为超时。
- SSE 在索引完整时不再强制要求 `[DONE]`；索引缺失仍返回 `502 upstream_incomplete_result`。
- 翻译指令允许省略冒号，支持 `Translate to <语言>` 与 `翻译成<语言>` 的首行形式，并避免把指令送入翻译正文。
- 新增 `test-hardening.mjs`（35 项）并接入 `npm run build`，覆盖字幕模式、`Retry-After`、重试、超时与取消归因。
- 单文件 Worker 仍低于 32,000 字节上限（约 26.9 KB，gzip 约 8.8 KB）。

### 部署配置

- `wrangler.jsonc` 不再声明 `secrets.required`，改为 `keep_vars: true`：`API_KEY` 与 `DOUBAO_COOKIE` 由 Cloudflare 面板以明文变量维护，构建部署时保留面板变量，不再被删除。
- 说明：面板上已是明文变量时，配置里若仍保留 `secrets.required`，构建会以 `The following required secrets have not been set` 失败；README 已补充明文变量与 Secret 两种维护方式的取舍。

### 命名

- 去掉 `lite` 品牌：`/health` 的 `runtime` 返回值改为 `cloudflare-workers`；`stream: true` 与内部错误兜底的提示文案不再包含 Lite 字样。

## v0.2.0

### 新增：请求内批次并发

- 新增 `DOUBAO_MAX_CONCURRENCY` 环境变量，取值 `1`–`4`，默认 `4`。
- 批次从严格串行改为按并发度分组并发执行。
- 实测（上游每批模拟 500ms 延迟，200 行 = 4 批）：

  | 配置 | 耗时 | 加速比 |
  | --- | --- | --- |
  | 串行（旧版） | 2043 ms | 1.00x |
  | `DOUBAO_MAX_CONCURRENCY=1` | 2044 ms | 1.00x |
  | `DOUBAO_MAX_CONCURRENCY=2` | 1032 ms | 1.98x |
  | `DOUBAO_MAX_CONCURRENCY=4`（默认） | 504 ms | 4.05x |

- 设为 `1` 时行为与旧版完全一致（实测耗时差 1 ms）。
- **输出顺序不变**：结果按原始行序回填，不会因并发错位。
- **错误语义不变**：任一批次失败时返回的错误码与串行版一致，且无未处理的 Promise 拒绝。

  | 失败场景 | 返回 |
  | --- | --- |
  | 上游 429 | `429 upstream_rate_limit` |
  | 上游 5xx | `502 upstream_http_error` |
  | 上游流不完整 | `502 upstream_incomplete_result` |
  | 网络失败 / 超时 | `502 upstream_network_error` / `504 upstream_timeout` |

### 新增：`scene` 参数可配置

- 新增 `DOUBAO_DEFAULT_SCENE` 环境变量，取值 `1`–`6`，默认 `2`（与旧版硬编码值一致）。
- 新增 `x-doubao-scene` 请求头，可按请求覆盖环境变量。
- 非法值处理：

  | 来源 | 非法时返回 |
  | --- | --- |
  | `x-doubao-scene` | `400 invalid_request` |
  | `DOUBAO_DEFAULT_SCENE` | `503 configuration_error` |

### 测试

- 新增 13 个回归测试套件，全部通过：
  - 语言解析优先级（9 项）
  - HTML 守卫（16 项）
  - SSE 解析（5 项）
  - 行数与批次数上限
  - 413 归因（区分请求体过大与批次数超限）
  - 队列参数边界
  - 并发错误语义（6 项）
  - `scene` 参数（7 项）

### 体积

- `worker.js`：8,071 → 14,254 字节，仍远低于 32,000 字节上限。

---

## v0.1.3

- 语言解析优先级修正：`target_lang` / `x-doubao-target-lang` > user 消息前缀 > system 提示词（仅取有效猜测）> `DOUBAO_DEFAULT_TARGET_LANG`。
- 语言表扩容，覆盖更多语言名；地区码归一化（`en-US` → `en`、`zh-TW` → `zh-Hant` 等）。
- HTML 守卫收紧：只在真实标记时拒绝，正文中作为普通文字出现的标签名不再误判。
- 上游重复 `index` 时取最后一条，避免结果被旧值覆盖。

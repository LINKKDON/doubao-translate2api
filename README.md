# 豆包翻译 Lite

单文件 OpenAI Chat Completions 翻译接口，JavaScript 本身不超过 32,000 字节。

> 本项目是独立的非官方实现，与豆包及其相关平台不存在隶属或合作关系。仅供学习、研究和开发交流；请仅使用本人拥有或已获合法授权的账号与 Cookie，并自行承担账号风控、Cookie 泄露、接口变更等风险。

本项目源自 [mu-zi-lee/doubao-translate2api](https://github.com/mu-zi-lee/doubao-translate2api) 的 `workers-lite` 版本，在此基础上独立维护（MIT 许可，保留原始版权声明）。

---

## 目录

- [这是什么](#这是什么)
- [点击部署](#点击部署)
- [环境变量与 Secret 完整说明](#环境变量与-secret-完整说明)
- [请求侧可用的参数](#请求侧可用的参数)
- [接口能力与硬性限制](#接口能力与硬性限制)
- [客户端配置](#客户端配置)
- [性能调优](#性能调优)
- [本地运行](#本地运行)
- [更新记录](#更新记录)

---

## 这是什么

把豆包网页版的**纯翻译接口**（`/samantha/plugin/stream_article_translate`）包装成 OpenAI 兼容的 `/v1/chat/completions`，供沉浸式翻译、陪读蛙（Read Frog）等翻译客户端调用。

**它不是通用 LLM 网关。** 上游是一个专用翻译接口，不接受提示词、不支持多轮对话、不支持工具调用。详见 [接口能力与硬性限制](#接口能力与硬性限制)。

---

## 点击部署

[![Deploy Lite to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/LINKKDON/doubao-translate2api-lite)

1. 点击按钮，登录 Cloudflare，连接 GitHub 并按页面提示创建自己的仓库。
2. 构建命令 `npm run build`，部署命令 `npm run deploy`，Node.js 使用 24。
3. 按提示填写两个 Secret：`API_KEY` 与 `DOUBAO_COOKIE`。若页面未收集，部署后在 Worker 设置里按 **Secret** 类型添加并重新部署。
4. 在客户端中填写 `https://你的Worker地址/v1/chat/completions`、同一个 `API_KEY`、模型 `doubao-ai`，**关闭流式输出**并使用**纯文本模板**。

```text
Translate to {{to}}:

{{text}}
```

支持独立一行的 `%%` 分隔符。

---

## 环境变量与 Secret 完整说明

Worker 一共读取 **5 个环境变量**。两个必须配置（Secret），三个可选（普通变量，有内置默认值）。

### 必须配置（Secret）

| 变量名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `API_KEY` | Secret | **至少 16 位，不含任何空白字符** | 客户端访问本 Worker 的凭证。不满足长度或含空格会直接返回 `503 configuration_error`。 |
| `DOUBAO_COOKIE` | Secret | 必须同时包含 `sessionid`、`sid_tt`、`uid_tt` | 你自己豆包账号的 Cookie Header。可以带 `Cookie: ` 前缀（会被自动去掉）。含换行符会返回 `503`。 |

> 这两个变量**不要**写进仓库。`API_KEY` 请用随机生成器产生，不要用有语义的字符串。

### 可选配置（普通变量）

| 变量名 | 默认值 | 取值范围 | 说明 |
| --- | --- | --- | --- |
| `DOUBAO_DEFAULT_TARGET_LANG` | `zh` | 语言代码或语言名 | 当请求里完全没有指定目标语言时的兜底值。 |
| `DOUBAO_DEFAULT_SCENE` | `2` | 整数 `1`–`6` | 传给豆包上游的 `scene` 参数。**这是上游唯一的翻译行为调节旋钮**，见下文。填非法值返回 `503 configuration_error`。 |
| `DOUBAO_MAX_CONCURRENCY` | `4` | 整数 `1`–`4` | 同一请求内多个批次的并发度。**设为 `1` 即完全等价于旧版串行行为**。填非法值返回 `503 configuration_error`。 |

### 配置示例

Cloudflare 控制台路径：**你的 Worker → 设置 → 变量和机密**

```
（机密 / Secret）
API_KEY                = <至少16位随机串>
DOUBAO_COOKIE          = sessionid=xxx; sid_tt=xxx; uid_tt=xxx

（变量 / Plaintext）
DOUBAO_DEFAULT_TARGET_LANG = zh
DOUBAO_DEFAULT_SCENE       = 2
DOUBAO_MAX_CONCURRENCY     = 4
```

### 本地开发变量

本目录创建 `.dev.vars`（参考 `.dev.vars.example`）：

```dotenv
API_KEY=
DOUBAO_COOKIE=
# 可选
DOUBAO_DEFAULT_TARGET_LANG=zh
DOUBAO_DEFAULT_SCENE=2
DOUBAO_MAX_CONCURRENCY=4
```

命令行上传 Secret：

```sh
npx wrangler secret put API_KEY
npx wrangler secret put DOUBAO_COOKIE
```

---

## 请求侧可用的参数

### 请求体字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `model` | 否 | 只接受 `doubao-ai`。传其他值返回 `404 model_not_found`。 |
| `messages` | **是** | 必须是消息数组，且**最后一条 `user` 消息的 `content` 必须是字符串**。 |
| `target_lang` | 否 | 最高优先级的目标语言指定方式。 |
| `stream` | 否 | **必须省略或为 `false`**。Lite 版不支持流式，传 `true` 返回 `400 unsupported_feature`。 |
| `tools` / `functions` / `reasoning` | 否 | **一律不允许出现**，出现即 `400 unsupported_feature`。 |

### 请求头

| 请求头 | 说明 |
| --- | --- |
| `Authorization: Bearer <API_KEY>` | 鉴权，也可用 `x-api-key`。 |
| `x-doubao-target-lang` | 指定目标语言，优先级低于请求体 `target_lang`。 |
| `x-doubao-scene` | 覆盖本次请求的 `scene`（整数 `1`–`6`），优先级高于 `DOUBAO_DEFAULT_SCENE`。填非法值返回 `400 invalid_request`。 |

### 目标语言解析优先级（从高到低）

1. 请求体 `target_lang`
2. 请求头 `x-doubao-target-lang`
3. `user` 消息开头的翻译指令（如 `Translate to Chinese:` / `翻译成中文：`）
4. `system` / `developer` 消息中的有效语言猜测（多个且冲突时返回 `400 invalid_request`）
5. 环境变量 `DOUBAO_DEFAULT_TARGET_LANG`

### `scene` 参数说明

`scene` 是豆包上游接口唯一可调的行为参数，取值 `1`–`6`，默认 `2`（与旧版硬编码值一致，因此默认行为没有任何变化）。

上游未公开各取值的具体语义，社区实践表明它会改变上游的翻译策略。建议的做法是：给网页翻译和字幕翻译各建一个指向本 Worker 的客户端配置，分别带上不同的 `x-doubao-scene`，实测对比后再固定下来。

---

## 接口能力与硬性限制

### 不支持的请求体字段

| 字段 | 行为 |
| --- | --- |
| `stream: true` | `400 unsupported_feature`（Lite 版不实现流式） |
| `tools` / `functions` / `reasoning` | `400 unsupported_feature` |
| `model` 非 `doubao-ai` | `404 model_not_found` |

### 输入限制

| 项目 | 上限 | 超出行为 |
| --- | --- | --- |
| 整个 HTTP 请求体 | 64 KB | `413 request_too_large`，`"Body is too large."` |
| 翻译正文总长度 | 20,000 字符 | `413 request_too_large` |
| 单行长度 | 10,000 字符 | `413 request_too_large` |
| 非空行数 | 200 行 | `413 request_too_large`（见下） |
| 单请求批次数 | 4 批 | `413 request_too_large` |

> **200 行上限的由来**：Worker 内部按「50 行 / 10,000 字符」分批，最多 4 批，因此 `4 × 50 = 200` 行是硬上限。第 201 行会直接返回 `413`，**且客户端不会自动重试**。如果你的客户端支持设置批量行数，请把它设为 **25 或更低**（给多行段落留出余量）。

### 输出限制

| 项目 | 上限 | 超出行为 |
| --- | --- | --- |
| 上游响应体 | 512 KB | `502 upstream_stream_error` |
| 翻译结果总量 | 256 KB | `502 upstream_stream_error` |
| 单批次超时 | 45 秒 | `504 upstream_timeout` |
| 整个请求超时 | 90 秒 | `504 upstream_timeout` |

### 输入内容限制

**不支持 HTML / YAML 模板。** 检测到真实的 HTML 标签（如 `</p>`、`<div class="...">`）或 `yaml` / `text` 包装标签会返回 `400 unsupported_input`。

注意这是**标记级**检测：正文里作为普通文字出现的 `<br>`、`<p>`、比较运算符 `a < b`、数学表达式等**不会**被误判。

### 关于提示词（重要）

**本 Worker 不会把任何提示词转发给豆包。**

Worker 发给上游的请求体固定只有 5 个字段：

```json
{"raw_text":["..."],"target_lang":"zh","translate_service":"1","scene":2,"frontend_source":1}
```

客户端传入的 `system` / `developer` 消息**只被用于猜测目标语言**，正文不会被转发。因此：

- 在客户端里自定义翻译提示词**不会生效**；
- 术语表（glossary）走的是同一条 `system` 通道，同样**不会生效**；
- 如果自定义提示词里包含 `{{input}}` 之类的占位符，客户端可能把整段正文**同时塞进 system 和 user**，使请求体翻倍并撞上 64 KB 上限 → `413 "Body is too large."`。请使用不含 `{{input}}` 的提示词。

如果需要提示词真正生效，请改用火山方舟官方 API（陪读蛙内置了 Volcengine provider，`baseURL` 为 `https://ark.cn-beijing.volces.com/api/v3`）。

---

## 客户端配置

### 沉浸式翻译

| 字段 | 值 |
| --- | --- |
| API 地址 | `https://你的Worker地址/v1/chat/completions` |
| API Key | 与 `API_KEY` 相同 |
| 模型 | `doubao-ai` |
| 流式输出 | **关闭** |
| 模板 | 纯文本，见上方 `Translate to {{to}}:` |

### 陪读蛙（Read Frog）

在「API 提供商」中选择 OpenAI 兼容（或等效的自定义 provider），填入 Base URL、API Key 与模型 `doubao-ai`。

**网页翻译建议**：批量行数设为 **25**（而非 50），避免 200 行硬上限触发 `413`。

**字幕翻译说明**：陪读蛙的字幕路径是**每条字幕一个独立请求**（内部 5 条并发），因此本 Worker 的批次并发改造对字幕**不产生加速效果** —— 单个请求只有 1 个批次，没有可重叠的对象。字幕吞吐由客户端的 5 并发决定。

---

## 性能调优

### Worker 内部批次并发

旧版是严格串行：一个请求内最多 4 个批次，一个接一个等待上游返回。

新版按 `DOUBAO_MAX_CONCURRENCY`（默认 4）并发执行批次。实测（上游每批模拟 500ms 延迟，200 行 = 4 批）：

| 配置 | 耗时 | 加速比 |
| --- | --- | --- |
| 串行（旧版） | 2043 ms | 1.00x |
| `DOUBAO_MAX_CONCURRENCY=1` | 2044 ms | 1.00x |
| `DOUBAO_MAX_CONCURRENCY=2` | 1032 ms | 1.98x |
| `DOUBAO_MAX_CONCURRENCY=4`（默认） | 504 ms | **4.05x** |

并发度上限为 4 是刻意设计：单请求最多 4 批，设更大没有意义。

> **风险提示**：并发意味着同一个 Cookie 会同时向豆包发起多个请求。豆包网页版对单账号并发较敏感，可能触发限流或风控。**若出现 `429 upstream_rate_limit` 或不明原因失败，请先把 `DOUBAO_MAX_CONCURRENCY` 降到 `2` 或 `1`。**

### Cloudflare 侧

在 **Workers & Pages → 你的 Worker → 设置 → 运行时 → 放置** 中可选择 **智能（Smart Placement）**。

它会把 Worker 调度到离上游更近的位置，但对本项目**收益有限**：本 Worker 的耗时几乎全部来自豆包自身的生成时间（实测 `cpuTimeMs` 仅 2–6 ms，而 `wallTimeMs` 约 965–2338 ms），网络往返只占很小比例。此外 Cloudflare 在中国大陆没有节点，而豆包源站主要在大陆。

开启后等待约 15 分钟，用响应头验证是否真的生效：

```sh
curl -sI "https://你的Worker地址/health" | grep -i cf-placement
```

- `remote-XXX` → 已走智能放置
- `local-XXX` → 未走，仍在默认位置

> 该响应头处于 beta，可能被 Cloudflare 移除，请勿用于自动化逻辑。

---

## 本地运行

```sh
npm ci
npm run build
```

在此目录创建 `.dev.vars`，按 `.dev.vars.example` 填写凭据，然后执行 `npm run dev`。命令行部署使用 `npm run deploy`。

本仓库是自包含的：`worker.js` 就是最终产物，可以直接整份复制到 Cloudflare 控制台或通过本仓库按钮部署，不依赖任何父目录或构建步骤。`check-size.mjs` 只负责校验体积上限与语法。按钮部署及真实云端翻译仍需在自己的账号验收。

---

## 更新记录

### v0.2.0

**新增：请求内批次并发**

- 新增 `DOUBAO_MAX_CONCURRENCY` 环境变量（`1`–`4`，默认 `4`）。批次从串行改为并发执行，多批次请求最高 **4.05x** 加速。
- 设为 `1` 时行为与旧版完全一致（实测耗时差 1 ms）。
- 输出顺序保持不变：结果仍按原始行序回填，不会因并发错位。
- 错误语义保持不变：任一批次失败时返回的错误码与串行版一致（`429` / `502` / `504`），且不产生未处理的 Promise 拒绝。

**新增：`scene` 参数可配置**

- 新增 `DOUBAO_DEFAULT_SCENE` 环境变量（`1`–`6`，默认 `2`，与旧版硬编码值一致）。
- 新增 `x-doubao-scene` 请求头，可按请求覆盖。
- 非法值分别返回 `400 invalid_request`（请求头）或 `503 configuration_error`（环境变量）。

**其他**

- 新增 13 个回归测试套件与专项测试（语言优先级、HTML 守卫、SSE、行数上限、413 归因、队列边界、并发错误语义等），全部通过。
- 文件体积 8,071 → 14,254 字节，仍远低于 32,000 字节上限。

### v0.1.3

- 语言解析优先级修正：`target_lang` / `x-doubao-target-lang` > user 前缀 > system 提示词（仅取有效猜测）> `DOUBAO_DEFAULT_TARGET_LANG`。
- 语言表扩容，地区码归一化（`en-US` → `en`、`zh-TW` → `zh-Hant` 等）。
- HTML 守卫收紧，只在真实标记时拒绝。
- 上游重复 `index` 时取最后一条。

---

## 许可证

MIT，见 [LICENSE](LICENSE)。

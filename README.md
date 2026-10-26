# 豆包翻译 Lite

把豆包网页版的专用翻译接口封装成 Cloudflare Worker，对外提供一个**非流式、纯文本**的 OpenAI Chat Completions 兼容端点，供沉浸式翻译、Read Frog 等支持自定义 OpenAI Provider 的客户端使用。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/LINKKDON/doubao-translate2api-lite)

> 本项目是非官方实现，与豆包及其相关平台没有隶属或合作关系。请只使用本人拥有或已获授权的账号与 Cookie，并自行承担账号风控、Cookie 泄露和上游接口变更等风险。
>
> 上游是专用翻译接口，不是通用大模型。它不会执行自定义提示词、术语表、多轮对话或工具调用。**本项目也不是通用 LLM 网关。**

本项目基于 [mu-zi-lee/doubao-translate2api](https://github.com/mu-zi-lee/doubao-translate2api) 的 `workers-lite` 版本独立维护，遵循 MIT 许可证。

## 功能概览

- `POST /v1/chat/completions`：非流式文本翻译
- `GET /health`：无需鉴权的健康检查
- 支持正文 `target_lang`、`x-doubao-target-lang` 请求头和翻译指令三种目标语言来源
- 支持普通网页逐行翻译，以及可选的字幕上下文模式
- 上游 `5xx` / 网络错误自动重试一次；`429` 保留限流语义并透传 `Retry-After`
- 单文件 Worker，构建时检查语法、运行回归测试并限制在 32,000 字节以内

## 快速部署

### 一键部署

1. 点击上方 **Deploy to Cloudflare**，登录 Cloudflare 并连接 GitHub。
2. 按提示创建自己的仓库。构建命令为 `npm run build`，部署命令为 `npm run deploy`，Node.js 版本为 24。
3. 配置两个 Secret：`API_KEY` 和 `DOUBAO_COOKIE`。
4. 部署完成后访问 `https://<你的 Worker 域名>/health`，确认返回 `{"status":"ok",...}`。

### Wrangler 部署

```sh
npm ci
npx wrangler secret put API_KEY
npx wrangler secret put DOUBAO_COOKIE
npm run deploy
```

`worker.js` 是可直接部署的完整入口，不依赖父目录。也可以把文件内容粘贴到 Cloudflare 控制台，但推荐使用 GitHub 或 Wrangler，便于保留版本记录。

## 配置

### 必需 Secret

| 名称 | 要求 | 说明 |
| --- | --- | --- |
| `API_KEY` | 至少 16 个字符，不能包含空白字符 | 客户端访问 Worker 时使用的 Bearer Token |
| `DOUBAO_COOKIE` | 必须包含 `sessionid`、`sid_tt`、`uid_tt` | 本人豆包账号的 Cookie Header，可带 `Cookie:` 前缀 |

Secret 缺失或格式不正确时，Worker 返回 `503 configuration_error`。不要把真实 Cookie 或 API Key 提交到仓库。

### 可选变量

| 名称 | 代码兜底值 | 本仓库 `wrangler.jsonc` | 范围 | 说明 |
| --- | --- | --- | --- | --- |
| `DOUBAO_DEFAULT_TARGET_LANG` | `zh` | `zh` | 支持的语言代码或名称 | 请求完全未指定目标语言时使用 |
| `DOUBAO_DEFAULT_SCENE` | `2` | `2` | 整数 `1`–`6` | 传给豆包上游的 `scene` 参数 |
| `DOUBAO_MAX_CONCURRENCY` | `4` | `3` | 整数 `1`–`4` | 单个请求内最多同时执行多少个批次 |

`DOUBAO_MAX_CONCURRENCY` 需要注意两处默认值的区别：本仓库部署配置固定为 `3`；如果变量未设置，代码内部兜底为 `4`。提高并发可能加快多批次翻译，也可能增加同一 Cookie 触发豆包限流的概率。出现 `429 upstream_rate_limit` 时，建议先降到 `2` 或 `1`。

本地开发时，把 `.dev.vars.example` 复制为 `.dev.vars` 并填写：

```dotenv
API_KEY=至少16位随机字符串
DOUBAO_COOKIE=sessionid=xxx; sid_tt=xxx; uid_tt=xxx
DOUBAO_DEFAULT_TARGET_LANG=zh
DOUBAO_DEFAULT_SCENE=2
DOUBAO_MAX_CONCURRENCY=4
```

## 客户端配置

| 配置项 | 值 |
| --- | --- |
| Base URL / API 地址 | `https://<你的 Worker 域名>/v1/chat/completions` |
| API Key | 与 Worker 的 `API_KEY` 相同 |
| 模型 | `doubao-ai` |
| 流式输出 | 关闭 |
| 模板 | 纯文本，不要使用 HTML、YAML 或 JSON 包装 |

推荐模板：

```text
Translate to {{to}}:

{{text}}
```

也可以使用中文指令：

```text
翻译成中文：

{{text}}
```

### 请求示例

```sh
curl "https://<你的 Worker 域名>/v1/chat/completions" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-ai",
    "messages": [
      {
        "role": "user",
        "content": "Translate to Chinese:\nHello world"
      }
    ],
    "stream": false
  }'
```

成功响应是标准 Chat Completions 结构，翻译结果位于 `choices[0].message.content`。`usage` 中的 token 数固定为 `0`，因为上游没有返回可用的 token 计量。

## 接口契约

### 请求字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `messages` | 是 | 消息数组；最后一条 `user` 消息的 `content` 必须是字符串 |
| `model` | 否 | 省略或使用 `doubao-ai`；其他值返回 `404 model_not_found` |
| `stream` | 否 | 省略或设为 `false`；`true` 返回 `400 unsupported_feature` |
| `target_lang` | 否 | 请求体中的目标语言，优先级最高 |
| `tools` / `functions` / `reasoning` | 否 | 不允许出现，否则返回 `400 unsupported_feature` |

### 请求头

| 请求头 | 说明 |
| --- | --- |
| `Authorization: Bearer <API_KEY>` | 鉴权；也支持 `x-api-key` |
| `x-doubao-target-lang` | 目标语言，优先级低于请求体 `target_lang` |
| `x-doubao-scene` | 本次请求使用的 `scene`，整数 `1`–`6` |
| `x-doubao-context-mode` | 正文拆分模式：`default`、`subtitle` 或 `subtitle-context` |

### 目标语言优先级

从高到低：

1. 请求体 `target_lang`
2. 请求头 `x-doubao-target-lang`
3. `user` 消息开头的翻译指令
4. `system` / `developer` 消息中的有效语言猜测
5. `DOUBAO_DEFAULT_TARGET_LANG`

支持带冒号的指令，例如 `Translate to Chinese:` 或 `翻译成中文：`。也支持把指令单独放在首行并省略冒号：

```text
Translate into Chinese
Hello world
```

Worker 会把这条首行识别为指令，从翻译正文中移除，并按换行继续解析正文。如果移除后没有正文，返回 `400 empty_translation_input`。

如果多个 `system` / `developer` 消息给出了互相冲突的目标语言，返回 `400 invalid_request`。

## 网页与字幕模式

**Worker 不会根据文本内容自动判断是网页还是字幕。** 模式必须由客户端通过 `x-doubao-context-mode` 显式指定。普通网页翻译不发送该请求头即可，行为与旧版一致。

### `default` 或省略

每个非空行都是独立翻译单元。空行和独立一行的 `%%` 会作为分隔符保留。适合原本就按行组织文本的网页翻译客户端。

```text
Translate to Chinese:
First line
Second line
```

上游收到两个翻译单元：`First line`、`Second line`。

### `subtitle`

用于客户端已经按字幕条组织请求的场景。**独立一行的 `%%` 才是字幕边界**，普通空行不会切断字幕；相邻两条字幕之间可以有多个空行，依然只在 `%%` 处切开。

```text
Translate to Chinese:
第一条字幕的第一行
第一条字幕的第二行

%%

第二条字幕
```

上游收到两个翻译单元，每条字幕的原文（包括内部换行、CRLF、行尾空白和多余空行）按原样发送，不做归一化：

```text
第一条字幕的第一行
第一条字幕的第二行
```

以及 `第二条字幕`。Worker 回填译文时同样按原文保留 `%%` 前后的空行与换行风格，因此客户端只需按 `%%` 拆回各条字幕。

### `subtitle-context`

把整个请求正文作为一个上下文组发送给上游，保留所有换行和 `%%`，不再由 Worker 拆成多条字幕。适合希望一次翻译相邻字幕、改善上下文连续性的客户端。

```text
Translate to Chinese:
上一句字幕
当前句字幕
%%
下一句字幕
```

该模式只有一个上游翻译单元，整个正文最多 10,000 字符，并保留指令换行之外的正文首尾空白。Worker 会校验上游返回的独立 `%%` 分隔符数量；数量不一致时返回 `502 upstream_stream_error`，避免字幕错位。客户端仍应校验拆分后的条数与内容，失败时回退到逐条翻译或缓存中的旧译文。

### 客户端兼容性

`subtitle` 和 `subtitle-context` 只有在客户端能够设置自定义请求头时才有意义。官方 Read Frog 是否转发该请求头取决于客户端版本和配置；本 Worker 不修改客户端代码，也不会自动猜测字幕请求。如果客户端无法添加请求头，请使用 `default`，或在客户端侧实现对应的请求头与结果拆分逻辑。

## 硬性限制

| 项目 | 上限 | 超出行为 |
| --- | --- | --- |
| 整个 HTTP 请求体 | 64 KiB | `413 request_too_large` |
| 翻译正文 | 20,000 字符 | `413 request_too_large` |
| `default` 单行 / `subtitle` 单条字幕 | 10,000 字符 | `413 request_too_large` |
| `subtitle-context` 上下文组 | 10,000 字符 | `413 request_too_large` |
| 非空翻译单元 | 200 个 | `413 request_too_large` |
| 上游批次 | 最多 4 批，每批最多 50 个单元 / 10,000 字符 | `413 request_too_large` |
| 上游响应体 | 512 KiB | `502 upstream_stream_error` |
| 翻译输出总量 | 256 KiB | `502 upstream_stream_error` |
| 单批次超时 | 45 秒 | `504 upstream_timeout` |
| 整个请求超时 | 90 秒 | `504 upstream_timeout` |

建议网页翻译客户端把每批行数控制在 25 左右，给多行段落留出余量。字幕客户端应确保单条字幕和上下文组不超过 10,000 字符。

不支持 HTML、YAML 或 `text` 包装模板。Worker 会拒绝真实 HTML 标记以及 `yaml` / `text` 包装；普通文本中的 `<br>`、`a < b` 等不会被当作模板标记。

## 错误、重试与响应头

### 常见错误

| HTTP 状态 | 常见 `code` | 含义 |
| --- | --- | --- |
| `400` | `invalid_request` | JSON、参数或上下文模式不合法 |
| `400` | `unsupported_input` | 使用了 HTML / YAML 等不支持的模板 |
| `400` | `empty_translation_input` | 移除指令后没有正文 |
| `400` | `unsupported_feature` | 请求了流式、工具或其他不支持的能力 |
| `401` | `unauthorized` | API Key 缺失或错误 |
| `404` | `model_not_found` | 使用了 `doubao-ai` 以外的模型 |
| `413` | `request_too_large` | 超过请求体、正文、批次或单条字幕限制 |
| `429` | `upstream_rate_limit` | 豆包上游限流 |
| `499` | `request_cancelled` | 客户端在翻译完成前断开连接 |
| `502` | `upstream_http_error` / `upstream_network_error` | 上游 HTTP 或网络失败 |
| `502` | `upstream_incomplete_result` | 上游没有返回完整索引 |
| `502` | `upstream_stream_error` | 上游流格式错误，或字幕分隔结构未被保留 |
| `503` | `configuration_error` | Secret 或可选配置不合法 |
| `504` | `upstream_timeout` | 上游超时 |

### 重试规则

- 上游 `5xx` 或网络异常：自动重试 **1 次**，每次等待 `200–399 ms` 随机退避；第二次仍失败则返回原错误语义。
- 上游 `429`：不重试，直接返回 `429 upstream_rate_limit`。
- 上游 `429` 带合法 `Retry-After` 时：原样透传该响应头。
- 上游 SSE 没有发送 `[DONE]`：只要所有输入索引都有非空译文，仍视为成功。
- SSE 缺少索引或存在非法结果：返回 `502 upstream_incomplete_result` 或 `502 upstream_stream_error`。
- 上游超时（45 秒单批次 / 90 秒整体）：不重试，返回 `504 upstream_timeout`。
- 客户端主动断开：返回 `499 request_cancelled`，不会与上游超时混淆。

所有响应都会带 `x-request-id`。CORS 允许并暴露 `retry-after` 与 `x-request-id`。`Retry-After` 仅透传秒数或可解析的 HTTP-date，不转发其他任意字符串。

## 提示词与内容限制

Worker 不会把客户端提示词、系统消息或术语表转发给豆包。发给上游的请求体固定为：

```json
{
  "raw_text": ["..."],
  "target_lang": "zh",
  "translate_service": "1",
  "scene": 2,
  "frontend_source": 1
}
```

`system` / `developer` 消息只用于猜测目标语言。以下能力不会生效：

- 自定义翻译风格或提示词
- 术语表 / glossary
- 多轮对话
- 工具调用、函数调用、推理参数
- 流式输出

如果客户端把 `{{input}}` 同时放进 system 和 user 消息，请求体会变大，可能触发 64 KiB 上限。请使用纯文本模板，并避免把正文重复放入系统消息。

## 本地开发与验证

```sh
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run build
npm run dev
```

`npm run build` 会执行：

1. `node --check worker.js`：检查语法
2. `node test-hardening.mjs`：运行回归测试
3. `node check-size.mjs`：检查 Worker 体积不超过 32,000 字节

本地测试使用模拟上游，覆盖目标语言解析、CORS、429 / `Retry-After`（含非法值与 HTTP-date）、`5xx` 和网络重试、超时与客户端取消的错误归因、SSE 完整性、批次并发顺序、字幕拆分与上下文模式（含 CRLF、连续空行、首尾空白、分隔符数量不符）及 400 / 413 边界。它**不能替代真实账号、真实 Cookie 和真实豆包上游的联调**；部署后请用自己的客户端做一次端到端验收。

## 版本与许可

当前版本：`0.2.1`。本次主要新增字幕上下文模式、逐条字幕的原文保留、429 限流语义、`Retry-After` 透传、5xx / 网络重试、超时与客户端取消的区分、无 `[DONE]` 的完整索引兼容，以及省略冒号的翻译指令解析。完整历史见 [CHANGELOG.md](CHANGELOG.md)。

MIT License，见 [LICENSE](LICENSE)。

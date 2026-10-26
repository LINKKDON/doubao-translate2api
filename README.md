# 豆包翻译 Lite

把豆包网页版的翻译接口包成一个 Cloudflare Worker，对外提供 **OpenAI Chat Completions 兼容端点**。只要客户端支持「自定义 OpenAI Provider」，就能把它当翻译 API 用：非流式、纯文本、无状态，代码里不含任何账号信息。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/LINKKDON/doubao-translate2api-lite)

> **免责声明**：非官方项目，与豆包及字节跳动无隶属或合作关系。请只使用本人拥有或已获授权的账号与 Cookie；账号风控、Cookie 泄露、上游接口变更等风险自负。
>
> **它不是通用大模型网关**：上游是豆包网页版的专用翻译接口，只会翻译你发过去的正文，不执行自定义提示词、术语表、多轮对话、工具调用或流式输出。

本项目基于 [mu-zi-lee/doubao-translate2api](https://github.com/mu-zi-lee/doubao-translate2api) 的 `workers-lite` 版本独立维护，MIT 许可。

## 目录

- [三分钟部署](#三分钟部署)
- [配置](#配置)
- [客户端接入](#客户端接入)
- [接口契约](#接口契约)
- [翻译模式](#翻译模式)
- [限制与超时](#限制与超时)
- [错误、重试与响应头](#错误重试与响应头)
- [安全与隐私](#安全与隐私)
- [本地开发与测试](#本地开发与测试)
- [常见问题](#常见问题)
- [版本与许可](#版本与许可)

## 三分钟部署

需要三样东西：Cloudflare 账号、豆包账号的 Cookie、一个自己生成的 API Key。

### 1) 部署 Worker

**方式 A：一键部署（推荐）**

点顶部 **Deploy to Cloudflare** → 登录并连接 GitHub → 按提示创建你自己的仓库。构建命令 `npm run build`、部署命令 `npm run deploy`、Node.js 24；之后每次推送 `main` 都会自动构建上线。

**方式 B：本地 Wrangler**

```sh
npm ci
npm run deploy
```

**方式 C：控制台粘贴**

把 `worker.js` 的内容贴进 Cloudflare 控制台的 Worker 编辑器保存即可。`worker.js` 是完整可部署的单文件入口，不依赖任何 npm 包；缺点是改动没有版本记录，建议只在临时试用时用。

部署后 `https://<你的 Worker 域名>/health` 应返回 `{"status":"ok","runtime":"cloudflare-workers-lite"}`。

### 2) 放入两个必需变量

在 Worker 的 **设置 → 运行时变量和密钥** 里添加：

| 名称 | 类型 | 值 |
| --- | --- | --- |
| `API_KEY` | 变量（明文即可） | 自己生成的随机串，至少 16 字符、不含空白字符 |
| `DOUBAO_COOKIE` | 变量（明文即可） | 本人豆包 Cookie，必须包含 `sessionid`、`sid_tt`、`uid_tt` |

生成 `API_KEY`：

```sh
# macOS / Linux
openssl rand -hex 32

# Windows PowerShell（需要 Node）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

取 `DOUBAO_COOKIE`：

1. 浏览器登录 `https://www.doubao.com`；
2. 按 `F12` → **Network** → 刷新页面 → 点任意一个请求 → **Request Headers** 里找到 `Cookie`；
3. 复制其中的 `sessionid=...; sid_tt=...; uid_tt=...`，整行直接粘贴也可以（Worker 会自动去掉开头的 `Cookie:`）。

> `sessionid` 是 HttpOnly Cookie，`document.cookie` 读不到，只能从请求头里取。它等同于账号登录凭据，请当密码对待。

### 3) 客户端填三个值

| 配置项 | 值 |
| --- | --- |
| API 地址 / Base URL | `https://<你的 Worker 域名>/v1/chat/completions` |
| API Key | 与 Worker 的 `API_KEY` 相同 |
| 模型 | `doubao-ai` |
| 流式输出 | 关闭 |

模板必须是**纯文本**，推荐：

```text
Translate to {{to}}:

{{text}}
```

中文写法也行：`翻译成中文：` 后跟正文。不要使用 HTML、YAML、JSON 或 `text` 包装模板。

### 4) 自测

```sh
curl -s "https://<你的 Worker 域名>/health"
# {"status":"ok","runtime":"cloudflare-workers-lite"}

curl -s "https://<你的 Worker 域名>/v1/chat/completions" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-ai","messages":[{"role":"user","content":"Translate to Chinese:\nHello there."}]}'
```

第二条的 `choices[0].message.content` 应是中文译文；`usage` 里的 token 数固定为 `0`（上游不提供用量）。所有响应都带 `x-request-id`，排查问题时带上它即可定位。

## 配置

### 必需变量

| 名称 | 要求 | 说明 |
| --- | --- | --- |
| `API_KEY` | 至少 16 个字符，不含空白 | 客户端调用 Worker 时使用的 Bearer Token |
| `DOUBAO_COOKIE` | 包含 `sessionid`、`sid_tt`、`uid_tt` | 本人豆包账号的 Cookie Header，可带 `Cookie:` 前缀 |

两者缺失或格式不合法时，Worker 返回 `503 configuration_error`，响应体里的 `message` 会说明具体原因。

### 明文变量还是 Secret

本仓库默认用**明文变量**，`wrangler.jsonc` 里设了 `"keep_vars": true`：每次构建部署都会保留面板上已有的明文变量，所以换 Cookie 只需在面板改一次，不用动代码。

想改用 Secret：

1. `npx wrangler secret put API_KEY`、`npx wrangler secret put DOUBAO_COOKIE`；
2. 在 `wrangler.jsonc` 里加回 `"secrets": { "required": ["API_KEY", "DOUBAO_COOKIE"] }`——否则下一次 `wrangler deploy` 会把这两个 Secret 直接删掉。

两种方式不要混用：面板上是明文变量、配置里却写着 `secrets.required`，构建会失败并报 `The following required secrets have not been set`。

| 对比项 | 明文变量 | Secret |
| --- | --- | --- |
| 面板能否读回 | 能，任何有账户权限的人都看得到 | 不能，写入后只显示名称 |
| 改值方式 | 面板里直接编辑 | `wrangler secret put` 重写 |
| 适合 | 单人维护、Cookie 会频繁更换 | 多人协作或更在意暴露面 |

> **改完要确认已生效**：Git 连接的 Worker 在面板改变量会先生成一个新版本，需要到「部署」页把该版本提升到 100% 流量才会真正生效。改完请用上面的 curl 复测一次。

### 可选变量

| 变量 | 代码兜底 | 本仓库 `wrangler.jsonc` | 取值 | 作用 |
| --- | --- | --- | --- | --- |
| `DOUBAO_DEFAULT_TARGET_LANG` | `zh` | `zh` | 语言代码或语言名 | 请求完全没有指定目标语言时的兜底 |
| `DOUBAO_DEFAULT_SCENE` | `2` | `2` | 整数 `1`–`6` | 传给上游的 `scene`，可用 `x-doubao-scene` 逐请求覆盖 |
| `DOUBAO_MAX_CONCURRENCY` | `4` | `3` | 整数 `1`–`4` | 单个请求内最多同时翻译几批 |

`DOUBAO_MAX_CONCURRENCY` 是唯一影响速度与限流的旋钮：并发越高越快，越容易撞到豆包限流。出现 `429 upstream_rate_limit` 时先降到 `2` 或 `1`。注意代码兜底是 `4`，本仓库配置固定为 `3`，两者不同属正常。

本地开发把 `.dev.vars.example` 复制成 `.dev.vars` 填上同样的值即可（`.dev.vars*` 已在 `.gitignore` 中忽略）。

## 客户端接入

### 沉浸式翻译等通用客户端

按下表填，模板用纯文本：

| 配置项 | 值 |
| --- | --- |
| API 地址 | `https://<你的 Worker 域名>/v1/chat/completions` |
| API Key | `<API_KEY>` |
| 模型 | `doubao-ai` |
| 流式 | 关闭 |

### Read Frog 等字幕客户端

字幕相关模式必须由客户端主动带上 `x-doubao-context-mode` 请求头，Worker **不会**根据内容猜测这是网页还是字幕。客户端如果无法设置自定义请求头，只能用默认逐行模式，或者自己在客户端侧实现拆包与结果回填。

### 直接调用

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
    ]
  }'
```

返回标准 Chat Completions 结构，译文在 `choices[0].message.content`。

## 接口契约

### 端点与鉴权

| 方法与路径 | 鉴权 | 说明 |
| --- | --- | --- |
| `POST /v1/chat/completions` | 必需 | 翻译入口；`Authorization: Bearer <API_KEY>` 或 `x-api-key: <API_KEY>` |
| `GET /health` | 无需 | 健康检查 |
| `OPTIONS /任何路径` | 无需 | 返回 `204`，供浏览器预检 |

任何响应都带 `x-request-id`。CORS 允许任意来源（`access-control-allow-origin: *`），并暴露 `retry-after` 与 `x-request-id`。

### 请求体字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `messages` | 是 | 消息数组；最后一条 `user` 消息的 `content` 必须是字符串 |
| `model` | 否 | 省略或填 `doubao-ai`；其他值返回 `404 model_not_found` |
| `stream` | 否 | 省略或 `false`；`true` 返回 `400 unsupported_feature` |
| `target_lang` | 否 | 目标语言，优先级最高 |
| `tools` / `functions` / `reasoning` | 否 | 一旦出现就返回 `400 unsupported_feature` |

### 请求头

| 请求头 | 说明 |
| --- | --- |
| `Authorization: Bearer <API_KEY>` | 鉴权；也支持 `x-api-key` |
| `x-doubao-target-lang` | 目标语言，优先级低于请求体 `target_lang` |
| `x-doubao-scene` | 本次请求使用的 `scene`，整数 `1`–`6` |
| `x-doubao-context-mode` | 正文拆分模式：`default`、`subtitle`、`subtitle-context` |

### 目标语言优先级

从高到低：

1. 请求体 `target_lang`
2. 请求头 `x-doubao-target-lang`
3. `user` 消息开头的翻译指令（`Translate to Chinese:`、`翻译成中文：`）
4. `system` / `developer` 消息里能识别的语言名
5. 环境变量 `DOUBAO_DEFAULT_TARGET_LANG`

指令可以省略冒号，把语言单独写在首行即可，Worker 会把它从正文里剥掉：

```text
Translate into Chinese
Hello world
```

如果剥掉指令后没有正文，返回 `400 empty_translation_input`；多条 `system` / `developer` 给出互相冲突的语言时，返回 `400 invalid_request`；无法识别的语言值返回 `400 unsupported_target_language`。

### 提示词为什么不生效

发给豆包上游的请求体是固定的，只会带上正文与语言：

```json
{
  "raw_text": ["..."],
  "target_lang": "zh",
  "translate_service": "1",
  "scene": 2,
  "frontend_source": 1
}
```

`system` / `developer` 消息只用于猜目标语言。以下能力一律不生效：自定义风格或提示词、术语表、多轮对话、工具与函数调用、推理参数、流式输出。如果客户端把 `{{input}}` 同时塞进 system 和 user 消息，请求体会翻倍，更容易撞上 64 KiB 上限——请用纯文本模板，并避免重复发送正文。

## 翻译模式

模式由请求头 `x-doubao-context-mode` 显式指定，省略即 `default`。**Worker 不会自动判断网页还是字幕。**

| 模式 | 取值 | 拆分方式 | 上下文范围 | 适用场景 |
| --- | --- | --- | --- | --- |
| 逐行 | 省略 / `default` | 每个非空行一个翻译单元 | 行内 | 网页整页翻译 |
| 字幕逐条 | `subtitle` | 仅独立一行的 `%%` 是边界，字幕内部换行原样保留 | 单条字幕内 | 客户端已按字幕条组包 |
| 字幕成组 | `subtitle-context` | 整个正文作为一个翻译单元 | 整组字幕，跨句连贯 | 想改善相邻字幕的上下文 |

### `default` —— 逐行翻译

每个非空行独立送上游，空行与单独一行的 `%%` 作为分隔符原样保留，适合普通网页翻译。

### `subtitle` —— 逐条字幕

只有**独立一行**的 `%%` 才切断字幕，普通空行不会切；每条字幕的原文（含内部换行、CRLF、行尾空白、连续空行）按原样送上游，回填时也保留 `%%` 前后的换行风格，客户端按 `%%` 拆回各条即可。

```text
Translate to Chinese:
第一条字幕的第一行
第一条字幕的第二行

%%

第二条字幕
```

### `subtitle-context` —— 整组成组翻译

整个正文作为一个上下文组送上游（保留所有换行与 `%%`），适合希望「上一句 + 当前句」一起翻译、避免上下句割裂的客户端。

```text
Translate to Chinese:
上一句字幕
当前句字幕
%%
下一句字幕
```

该模式只有一个上游单元，整个正文上限 10,000 字符。Worker 会校验上游返回的独立 `%%` 数量，数量不一致时返回 `502 upstream_stream_error`，避免字幕错位；客户端仍应校验拆分后的条数，失败时回退到逐条模式或缓存译文。

## 限制与超时

| 项目 | 上限 | 超出行为 |
| --- | --- | --- |
| 整个 HTTP 请求体 | 64 KiB | `413 request_too_large` |
| 翻译正文总长 | 20,000 字符 | `413 request_too_large` |
| `default` 单行 / `subtitle` 单条 / `subtitle-context` 整组 | 10,000 字符 | `413 request_too_large` |
| 非空翻译单元 | 200 个 | `413 request_too_large` |
| 上游批次 | 最多 4 批（每批 ≤ 50 单元且 ≤ 10,000 字符） | `413 request_too_large` |
| 上游响应体 | 512 KiB | `502 upstream_stream_error` |
| 译文输出总量 | 256 KiB | `502 upstream_stream_error` |
| 单批超时 | 45 秒 | `504 upstream_timeout` |
| 整个请求超时 | 90 秒 | `504 upstream_timeout` |

网页翻译建议每批控制在 25 行左右，给长段落留余量；字幕客户端要保证单条字幕和上下文组不超过 10,000 字符。HTML、YAML、`text` 包装模板都会被拒绝（`400 unsupported_input`），但正文里普通的 `<br>`、`a < b` 不会被误判。

## 错误、重试与响应头

### 错误对照

| 状态 | `code` | 含义 |
| --- | --- | --- |
| `400` | `invalid_request` | JSON、参数或上下文模式不合法 |
| `400` | `unsupported_input` | 用了 HTML / YAML 等不支持的模板 |
| `400` | `empty_translation_input` | 剥掉指令后没有正文 |
| `400` | `unsupported_feature` | 请求了流式、工具、推理等不支持的能力 |
| `400` | `unsupported_target_language` | 目标语言无法识别 |
| `401` | `unauthorized` | API Key 缺失或错误 |
| `404` | `model_not_found` / `not_found` | 模型不是 `doubao-ai`，或路径错误 |
| `413` | `request_too_large` | 超过请求体、正文、单元数或批次限制 |
| `429` | `upstream_rate_limit` | 豆包上游限流 |
| `499` | `request_cancelled` | 客户端在翻译完成前断开 |
| `502` | `upstream_auth_error` | 豆包登录态失效（Cookie 过期，上游返回 `710012001`） |
| `502` | `upstream_http_error` / `upstream_network_error` | 上游 HTTP 或网络失败 |
| `502` | `upstream_incomplete_result` / `upstream_stream_error` | 上游返回不完整或格式异常 |
| `503` | `configuration_error` | 必需变量或可选变量不合法 |
| `504` | `upstream_timeout` | 上游超时 |

### 重试规则

- 上游 `5xx` 或网络异常：自动重试 **1 次**，每次等待 `200–399 ms` 随机退避；仍失败则返回原错误语义。
- 上游 `429`：不重试，直接返回 `429 upstream_rate_limit`；若上游带了合法的 `Retry-After`，原样透传该响应头。
- 上游超时（单批 45 秒 / 整体 90 秒）：不重试，返回 `504 upstream_timeout`。
- 客户端断开：返回 `499 request_cancelled`，不会和上游超时混淆。
- 上游 SSE 没有 `[DONE]`：只要所有输入索引都有非空译文，仍算成功；缺索引或格式非法分别返回 `502 upstream_incomplete_result` / `502 upstream_stream_error`。

`Retry-After` 只透传纯秒数或标准 HTTP-date，其他任意字符串不会被转发。

## 安全与隐私

- **本仓库是公开仓库**：任何提交、Issue、PR 里都不要出现真实 Cookie 或 API Key。`.gitignore` 已忽略 `.dev.vars*`。
- **明文变量 = 面板可见**：任何拥有该 Cloudflare 账户访问权的人（协作者、子账户、带 Workers 读权限的 API Token）都能读到 Cookie 与 Key；改用 Secret 则写入后不可回读。
- **Cookie 的价值等于账号**：`sessionid` / `sid_tt` 泄露即可冒用你的豆包登录态；Key 泄露只影响这个 Worker，随时可换。
- **Cookie 会过期**：届时翻译返回 `502 upstream_auth_error`（`Doubao login has expired`），重新从浏览器取一次，替换 `DOUBAO_COOKIE` 即可。
- **CORS 是 `*`**：任何网站都能调用你的 Worker，但仍然必须带 Key，所以不要把 Key 写进前端页面或公开文档。
- 轮换建议：怀疑泄露就换 `API_KEY`，换完记得同步所有客户端；Cookie 建议定期重取。

## 本地开发与测试

```sh
npm ci
Copy-Item .dev.vars.example .dev.vars    # Windows PowerShell
npm run build
npm run dev
```

`npm run build` 依次执行：

1. `node --check worker.js`：语法检查
2. `node test-hardening.mjs`：回归测试
3. `node check-size.mjs`：确保 Worker 不超过 32,000 字节

回归测试用模拟上游覆盖：目标语言解析与优先级、CORS、`429` 与 `Retry-After`（含非法值、HTTP-date）、`5xx` 与网络重试、超时与客户端取消的归因、SSE 完整性、批次并发顺序、字幕拆分与上下文模式（含 CRLF、连续空行、首尾空白、`%%` 数量不符）、`400` / `413` 边界。它**不能替代真实账号与真实 Cookie 的联调**，上线后请用自己的客户端做一次端到端验收。

## 常见问题

**`401 unauthorized`**：客户端里的 Key 与 Worker 的 `API_KEY` 不一致，或多了空格 / 引号。

**`503 configuration_error`**：`API_KEY`、`DOUBAO_COOKIE`、`DOUBAO_DEFAULT_SCENE`、`DOUBAO_MAX_CONCURRENCY` 之一缺失或越界，响应 `message` 会直接说明是哪一项。

**`404 model_not_found`**：模型名必须写 `doubao-ai`（省略也等同于它）。

**`400 unsupported_input`**：模板不是纯文本。改成 `Translate to {{to}}:\n\n{{text}}` 这类纯文本模板。

**`502 upstream_auth_error`**：Cookie 过期或账号未登录，重新取 Cookie 覆盖 `DOUBAO_COOKIE`。

**`429 upstream_rate_limit`**：同一 Cookie 请求太密。把 `DOUBAO_MAX_CONCURRENCY` 降到 `1`–`2`、减少客户端并发数，或按上游返回的 `Retry-After` 退避。

**`413 request_too_large`**：一次发的正文太多。网页翻译每批 ≤ 25 行，字幕单条 / 上下文组 ≤ 10,000 字符。

**`502 upstream_stream_error`**：上游返回格式异常；在 `subtitle-context` 模式下通常意味着 `%%` 数量对不上，客户端应回退到逐条模式。

**字幕上下句不连贯 / 一次只翻一句**：客户端需要主动发送 `x-doubao-context-mode: subtitle-context` 才能拿到整组上下文；不发这个请求头就是逐行模式。

**提示词、术语表没反应**：上游只接收正文和语言，这些能力本来就不支持。

**面板改了变量但线上没变化**：新版本可能还没承接流量。到「部署」页确认最新版本已 100%，或点「提升版本」。

## 版本与许可

当前版本 `0.2.1`，主要包含字幕上下文模式、逐条字幕原文保留、`429` 限流语义与 `Retry-After` 透传、`5xx` / 网络重试、上游超时与客户端取消区分、允许缺少 `[DONE]` 的完整索引响应、省略冒号的翻译指令解析。完整历史见 [CHANGELOG.md](CHANGELOG.md)。

MIT License，见 [LICENSE](LICENSE)。

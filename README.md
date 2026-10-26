<div align="center">

# 豆包翻译 2API

**把豆包网页版的翻译能力封装成一个 Cloudflare Worker，喂给任何支持自定义 OpenAI Provider 的翻译插件。**

非流式 · 纯文本 · 单文件 · 无状态 · MIT

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/LINKKDON/doubao-translate2api)

![Node](https://img.shields.io/badge/Node.js-24-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Worker](https://img.shields.io/badge/worker.js-26.9%20KB-333333?style=flat-square)
![Tests](https://img.shields.io/badge/tests-35%20passing-2EA44F?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

</div>

```text
沉浸式翻译 / 陪读蛙 ──► Worker（本仓库）──► 豆包网页版翻译接口
  OpenAI 兼容请求          鉴权·拆包·回填          raw_text + target_lang
```

> [!WARNING]
> **非官方项目**，与豆包、字节跳动没有隶属或合作关系。请只使用本人账号或已获授权的 Cookie；账号风控、Cookie 泄露、上游接口变更等风险自负。
>
> **它不是通用 LLM 网关**。上游只接收「正文 + 目标语言」，自定义提示词、术语表、多轮对话、工具调用、流式输出一律不生效。

| 适合 ✅ | 不适合 ❌ |
| --- | --- |
| 沉浸式翻译、陪读蛙等支持 OpenAI 兼容接口的插件 | 需要提示词控制、术语表或自定义风格 |
| 网页整页翻译、视频字幕批量翻译 | 多轮对话、function calling、流式返回 |

**目录**　[快速开始](#quickstart) · [配置](#config) · [客户端接入](#client) · [字幕与上下文](#modes) · [接口参考](#api) · [限制与超时](#limits) · [错误与重试](#errors) · [安全与隐私](#security) · [本地开发](#local) · [排错速查](#troubleshoot) · [许可](#license)

---

<a id="quickstart"></a>

## 🚀 快速开始

四步：**部署 Worker** → **填两个变量** → **客户端填三个值** → **curl 自测**。

### 1 · 部署

| 方式 | 怎么做 | 适合 |
| --- | --- | --- |
| **一键部署** | 点上方 **Deploy to Cloudflare**，登录并连接 GitHub，按提示建自己的仓库 | 推荐，之后推 `main` 自动上线 |
| **本地 Wrangler** | `npm ci` 然后 `npm run deploy` | 本机有 Node 24 |
| **控制台粘贴** | 把 `worker.js` 整个贴进 Worker 编辑器保存 | 临时试一下 |

构建命令 `npm run build`，部署命令 `npm run deploy`，运行时 Node.js 24。

### 2 · 填两个必需变量

Worker → **设置 → 运行时变量和密钥**：

| 名称 | 填什么 | 类型 |
| --- | --- | --- |
| `API_KEY` | 自己生成的随机串，≥ 16 字符且不含空白 | 变量 |
| `DOUBAO_COOKIE` | 含 `sessionid`、`sid_tt`、`uid_tt` 的豆包 Cookie | 变量 |

<details>
<summary><b>生成 API_KEY · 取 Cookie 的具体步骤</b></summary>

生成一个 Key：

```sh
# macOS / Linux
openssl rand -hex 32

# Windows PowerShell（需要 Node）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

取 Cookie：

1. 浏览器登录 `https://www.doubao.com`
2. 按 `F12` → **Network** → 刷新页面 → 点任意一个请求 → **Request Headers** 里找到 `Cookie`
3. 复制 `sessionid=...; sid_tt=...; uid_tt=...` 整串，带不带 `Cookie:` 前缀都可以（Worker 会自动去掉）

> [!IMPORTANT]
> `sessionid` 是 HttpOnly，`document.cookie` 读不到，只能从请求头里复制。它等同于你的账号密码，别贴到任何公开地方。

</details>

### 3 · 客户端填三个值

| 配置项 | 值 |
| --- | --- |
| API 地址 / Base URL | `https://<你的 Worker 域名>/v1/chat/completions` |
| API Key | 与 Worker 的 `API_KEY` 相同 |
| 模型 | `doubao-ai` |
| 流式输出 | 关闭 |
| 模板 | 纯文本：`Translate to {{to}}:\n\n{{text}}` |

### 4 · 自测

```sh
curl -s "https://<你的 Worker 域名>/health"
# {"status":"ok","runtime":"cloudflare-workers"}

curl -s "https://<你的 Worker 域名>/v1/chat/completions" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-ai","messages":[{"role":"user","content":"Translate to Chinese:\nHello there."}]}'
```

第二条的 `choices[0].message.content` 应该是一句中文译文；`usage` 里的 token 数固定为 `0`（上游不返回用量）。

> [!TIP]
> 所有响应都带 `x-request-id`。排错时把这条 ID 一起提供，定位最快。

---

<a id="config"></a>

## ⚙️ 配置

### 必需变量

| 名称 | 要求 | 说明 |
| --- | --- | --- |
| `API_KEY` | 至少 16 个字符，不含空白 | 客户端调用 Worker 时使用的 Bearer Token |
| `DOUBAO_COOKIE` | 包含 `sessionid`、`sid_tt`、`uid_tt` | 豆包账号的 Cookie Header，可带 `Cookie:` 前缀 |

缺失或格式不合法时返回 `503 configuration_error`，响应 `message` 直接说明是哪一项。

<details>
<summary><b>明文变量还是 Secret？怎么切换</b></summary>

本仓库默认用**明文变量**，`wrangler.jsonc` 里设了 `"keep_vars": true`：每次构建部署都会保留面板上的明文变量，所以换 Cookie 只需在面板改一次，不用动代码。

想改用 Secret：

1. 执行 `npx wrangler secret put API_KEY`、`npx wrangler secret put DOUBAO_COOKIE`
2. 在 `wrangler.jsonc` 加回 `"secrets": { "required": ["API_KEY", "DOUBAO_COOKIE"] }`，否则下一次 `wrangler deploy` 会把这两个 Secret 直接删掉

| 对比项 | 明文变量 | Secret |
| --- | --- | --- |
| 面板能否读回 | 能，有账户权限的人都看得到 | 不能，写入后只显示名称 |
| 改值方式 | 面板直接编辑 | `wrangler secret put` 重写 |
| 适合 | 单人维护、Cookie 经常更换 | 多人协作或更在意暴露面 |

> [!CAUTION]
> 两种方式不要混用：面板上是明文变量、配置里却写着 `secrets.required`，构建会失败并报 `The following required secrets have not been set`。

</details>

> [!NOTE]
> 面板改完变量**不等于已生效**：Git 连接的 Worker 会先生成一个新版本，需要到「部署」页把该版本提升到 100% 流量。改完请用第 4 步的 curl 复测一次。

### 可选变量

| 变量 | 代码兜底 | 本仓库配置 | 取值 | 作用 |
| --- | --- | --- | --- | --- |
| `DOUBAO_DEFAULT_TARGET_LANG` | `zh` | `zh` | 语言代码或语言名 | 请求完全没指定目标语言时的兜底 |
| `DOUBAO_DEFAULT_SCENE` | `2` | `2` | 整数 `1`–`6` | 传给上游的 `scene`，可用 `x-doubao-scene` 逐请求覆盖 |
| `DOUBAO_MAX_CONCURRENCY` | `4` | `3` | 整数 `1`–`4` | 单个请求内最多同时翻译几批 |

`DOUBAO_MAX_CONCURRENCY` 是唯一影响速度与限流的旋钮：并发越高越快，也越容易撞上豆包限流。出现 `429 upstream_rate_limit` 时先降到 `2` 或 `1`。

本地开发把 `.dev.vars.example` 复制成 `.dev.vars`，填同样的值即可（`.dev.vars*` 已被 `.gitignore` 忽略）。

---

<a id="client"></a>

## 🧩 客户端接入

### 通用配置

| 配置项 | 值 |
| --- | --- |
| API 地址 | `https://<你的 Worker 域名>/v1/chat/completions` |
| API Key | `<API_KEY>` |
| 模型 | `doubao-ai` |
| 模板 | 纯文本，例如 `Translate to {{to}}:\n\n{{text}}` |

### OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(base_url="https://<你的 Worker 域名>/v1", api_key="<API_KEY>")
resp = client.chat.completions.create(
    model="doubao-ai",
    messages=[{"role": "user", "content": "Translate to Chinese:\nHello there."}],
)
print(resp.choices[0].message.content)
```

### 字幕类客户端

`subtitle` / `subtitle-context` 模式必须由客户端主动带 `x-doubao-context-mode` 请求头——Worker **不会**根据内容猜这是网页还是字幕。客户端如果加不了自定义请求头，只能用默认逐行模式，或自己在客户端侧实现拆包与回填。

---

<a id="modes"></a>

## 🎬 字幕与上下文模式

模式由请求头 `x-doubao-context-mode` 决定，省略即 `default`。

| 模式 | 取值 | 拆分方式 | 上下文范围 | 适用 |
| --- | --- | --- | --- | --- |
| 逐行 | 省略 / `default` | 每个非空行一个翻译单元 | 行内 | 网页整页翻译 |
| 字幕逐条 | `subtitle` | **独立一行的 `%%`** 才是边界，字幕内部换行原样保留 | 单条字幕内 | 客户端已按字幕条组包 |
| 字幕成组 | `subtitle-context` | 整个正文作为一个单元 | 整组字幕，跨句连贯 | 想改善上下句割裂 |

<details>
<summary><b>三种模式的输入输出示例</b></summary>

**`subtitle`（逐条，空行不切分）**

```text
Translate to Chinese:
第一条字幕的第一行
第一条字幕的第二行

%%

第二条字幕
```

上游收到两条字幕，原文（含内部换行、CRLF、行尾空白、连续空行）按原样发送；Worker 回填时同样保留 `%%` 前后的换行风格，客户端按 `%%` 拆回即可。

**`subtitle-context`（整组成组）**

```text
Translate to Chinese:
上一句字幕
当前句字幕
%%
下一句字幕
```

整组作为一个上游单元，上限 10,000 字符。Worker 会校验上游返回的独立 `%%` 数量；数量不一致时返回 `502 upstream_stream_error`，避免字幕错位。客户端仍应校验拆分后的条数，失败时回退到逐条模式或缓存译文。

</details>

---

<a id="api"></a>

## 📡 接口参考

### 端点与鉴权

| 方法与路径 | 鉴权 | 说明 |
| --- | --- | --- |
| `POST /v1/chat/completions` | 必需 | 翻译入口；`Authorization: Bearer <API_KEY>` 或 `x-api-key: <API_KEY>` |
| `GET /health` | 无需 | 健康检查 |
| `OPTIONS ...` | 无需 | 预检，返回 `204` |

任何响应都带 `x-request-id`；CORS 允许任意来源（`access-control-allow-origin: *`），并暴露 `retry-after` 与 `x-request-id`。

### 请求体

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `messages` | 是 | 消息数组；最后一条 `user` 消息的 `content` 必须是字符串 |
| `model` | 否 | 省略或填 `doubao-ai`；其他值返回 `404 model_not_found` |
| `stream` | 否 | 省略或 `false`；`true` 返回 `400 unsupported_feature` |
| `target_lang` | 否 | 目标语言，优先级最高 |
| `tools` / `functions` / `reasoning` | 否 | 出现即 `400 unsupported_feature` |

### 请求头

| 请求头 | 说明 |
| --- | --- |
| `Authorization: Bearer <API_KEY>` | 鉴权；也支持 `x-api-key` |
| `x-doubao-target-lang` | 目标语言，优先级低于请求体 `target_lang` |
| `x-doubao-scene` | 本次请求的 `scene`，整数 `1`–`6` |
| `x-doubao-context-mode` | 拆分模式：`default` / `subtitle` / `subtitle-context` |

### 目标语言优先级

1. 请求体 `target_lang`
2. 请求头 `x-doubao-target-lang`
3. `user` 消息开头的翻译指令（`Translate to Chinese:`、`翻译成中文：`）
4. `system` / `developer` 消息里能识别的语言名
5. 环境变量 `DOUBAO_DEFAULT_TARGET_LANG`

指令可以省略冒号，把语言单独写在首行：

```text
Translate into Chinese
Hello world
```

首行会被识别为指令并从正文移除；移除后没有正文返回 `400 empty_translation_input`，多条 `system` / `developer` 给出冲突语言返回 `400 invalid_request`，语言无法识别返回 `400 unsupported_target_language`。

<details>
<summary><b>为什么提示词、术语表都不生效</b></summary>

发给豆包上游的请求体是固定的，只带正文与语言：

```json
{
  "raw_text": ["..."],
  "target_lang": "zh",
  "translate_service": "1",
  "scene": 2,
  "frontend_source": 1
}
```

`system` / `developer` 消息只用于猜目标语言，以下能力一律不生效：自定义风格或提示词、术语表、多轮对话、工具与函数调用、推理参数、流式输出。

如果客户端把 `{{input}}` 同时放进 system 和 user 消息，请求体会翻倍，更容易撞上 64 KiB 上限——请用纯文本模板，别重复发送正文。

</details>

---

<a id="limits"></a>

## 📏 限制与超时

| 项目 | 上限 | 超出行为 |
| --- | --- | --- |
| HTTP 请求体 | 64 KiB | `413 request_too_large` |
| 翻译正文总长 | 20,000 字符 | `413 request_too_large` |
| 单行 / 单条字幕 / 上下文组 | 10,000 字符 | `413 request_too_large` |
| 非空翻译单元 | 200 个 | `413 request_too_large` |
| 上游批次 | 最多 4 批（每批 ≤ 50 单元且 ≤ 10,000 字符） | `413 request_too_large` |
| 上游响应体 | 512 KiB | `502 upstream_stream_error` |
| 译文输出总量 | 256 KiB | `502 upstream_stream_error` |
| 单批超时 | 45 秒 | `504 upstream_timeout` |
| 整个请求超时 | 90 秒 | `504 upstream_timeout` |

网页翻译建议每批 25 行左右，给长段落留余量。HTML、YAML、`text` 包装模板都会被拒绝（`400 unsupported_input`），但正文里普通的 `<br>`、`a < b` 不会误判。

---

<a id="errors"></a>

## 🚨 错误与重试

<details open>
<summary><b>错误码对照表</b></summary>

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

响应遵循 OpenAI 错误结构：`401` → `authentication_error`、其他 4xx → `invalid_request_error`、`429` → `rate_limit_error`、5xx → `api_error`，具体原因看 `code` 字段。

</details>

**重试规则**

| 情况 | 行为 |
| --- | --- |
| 上游 `5xx` / 网络异常 | 自动重试 1 次，随机退避 `200–399 ms`，仍失败则返回原错误 |
| 上游 `429` | 不重试；带合法 `Retry-After` 时原样透传该响应头 |
| 上游超时（单批 45 s / 整体 90 s） | 不重试，返回 `504 upstream_timeout` |
| 客户端断开 | 返回 `499 request_cancelled`，不与上游超时混淆 |
| 上游 SSE 缺少 `[DONE]` | 索引齐全且有译文即成功；缺索引返回 `502 upstream_incomplete_result` |

`Retry-After` 只透传纯秒数或标准 HTTP-date，其他任意字符串不会被转发。

---

<a id="security"></a>

## 🔐 安全与隐私

| 事项 | 说明 |
| --- | --- |
| 本仓库是公开仓库 | 任何提交、Issue、PR 都不要出现真实 Cookie 或 Key；`.dev.vars*` 已忽略 |
| 明文变量 = 面板可见 | 有账户权限的人（协作者、子账户、带 Workers 读权限的 Token）都能读到值 |
| Cookie 等价于账号 | `sessionid` / `sid_tt` 泄露即可冒用你的豆包登录态 |
| Key 只影响本项目 | 泄露后换一个即可，记得同步所有客户端 |
| CORS 是 `*` | 任何网站都能调用你的 Worker，但仍必须带 Key，别把 Key 写进前端 |

> [!CAUTION]
> Cookie 过期时翻译返回 `502 upstream_auth_error`（`Doubao login has expired`）。重新从浏览器取一次 Cookie 覆盖 `DOUBAO_COOKIE` 即可，仓库配置不需要改动。

---

<a id="local"></a>

## 🛠️ 本地开发

```sh
git clone https://github.com/LINKKDON/doubao-translate2api.git
cd doubao-translate2api
npm ci
Copy-Item .dev.vars.example .dev.vars    # Windows PowerShell
npm run build
npm run dev
```

`npm run build` 依次执行：

| 步骤 | 命令 | 作用 |
| --- | --- | --- |
| 1 | `node --check worker.js` | 语法检查 |
| 2 | `node test-hardening.mjs` | 35 项回归测试 |
| 3 | `node check-size.mjs` | 确保 Worker 不超过 32,000 字节 |

回归测试用模拟上游覆盖：语言解析与优先级、CORS、`429` 与 `Retry-After`（含非法值、HTTP-date）、`5xx` 与网络重试、超时与客户端取消归因、SSE 完整性、批次并发顺序、字幕拆分与上下文模式（CRLF、连续空行、首尾空白、`%%` 数量不符）、`400` / `413` 边界。

> [!NOTE]
> 模拟测试不能替代真实账号与真实 Cookie 的联调，上线后请用自己的客户端做一次端到端验收。

---

<a id="troubleshoot"></a>

## 🔧 排错速查

| 现象 | 原因与处理 |
| --- | --- |
| `401 unauthorized` | 客户端 Key 与 `API_KEY` 不一致，或多了空格 / 引号 |
| `503 configuration_error` | 变量缺失或越界，响应 `message` 会指明是哪一项 |
| `404 model_not_found` | 模型名必须写 `doubao-ai`（省略等同） |
| `400 unsupported_input` | 模板不是纯文本，换成 `Translate to {{to}}:\n\n{{text}}` |
| `502 upstream_auth_error` | Cookie 过期或账号未登录，重新取 Cookie 覆盖 |
| `429 upstream_rate_limit` | 请求太密：把 `DOUBAO_MAX_CONCURRENCY` 降到 `1`–`2`，或按 `Retry-After` 退避 |
| `413 request_too_large` | 一次发送太多：网页每批 ≤ 25 行，字幕单条/组 ≤ 10,000 字符 |
| `502 upstream_stream_error` | 上游返回格式异常；`subtitle-context` 下通常意味着 `%%` 数量对不上，回退逐条 |
| 字幕上下句不连贯 | 客户端没带 `x-doubao-context-mode: subtitle-context`，默认是逐行模式 |
| 提示词 / 术语表没反应 | 上游只接收正文和语言，这些能力本来就不支持 |
| 面板改了变量但线上没变 | 新版本还没承接流量：到「部署」页提升到 100% |

---

<a id="license"></a>

## 📄 许可与致谢

- 当前版本 `0.2.1`：字幕上下文模式、逐条字幕原文保留、`429` 限流语义与 `Retry-After` 透传、`5xx` / 网络重试、上游超时与客户端取消区分、允许缺少 `[DONE]` 的完整索引响应、省略冒号的翻译指令解析。完整历史见 [CHANGELOG.md](CHANGELOG.md)
- 基于 [mu-zi-lee/doubao-translate2api](https://github.com/mu-zi-lee/doubao-translate2api) 独立维护的 Cloudflare Worker 实现
- MIT License，见 [LICENSE](LICENSE)

<div align="center">

<sub>只用本人账号，别把 Cookie 和 Key 交给任何人 · 觉得有用就点个 Star ⭐</sub>

</div>

import worker from "./worker.js";

const env = {
  API_KEY: "1234567890abcdef",
  DOUBAO_COOKIE: "sessionid=fake; sid_tt=fake; uid_tt=fake",
  DOUBAO_DEFAULT_TARGET_LANG: "zh",
  DOUBAO_MAX_CONCURRENCY: "4",
};

const originalFetch = globalThis.fetch;
let calls = 0;
let pass = 0;
let fail = 0;
const unhandled = [];
process.on("unhandledRejection", (error) => {
  unhandled.push(String(error));
});

function sse(items, { done = true } = {}) {
  const chunks = items.map(
    (item) =>
      `event: json\ndata: ${JSON.stringify({
        code: 0,
        data: { items: [item] },
      })}\n\n`,
  );
  if (done) chunks.push("data: [DONE]\n\n");
  return chunks.join("");
}

function upstream(items, options) {
  return new Response(sse(items, options), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function call(content, options = {}) {
  const request = new Request(
    options.url ?? "https://worker.example/v1/chat/completions",
    {
      method: options.method ?? "POST",
      headers: {
        authorization: `Bearer ${env.API_KEY}`,
        "content-type": "application/json",
        ...(options.headers ?? {}),
      },
      body:
        (options.method ?? "POST") === "GET"
          ? undefined
          : (options.body ??
            JSON.stringify({
              model: "doubao-ai",
              messages: [{ role: "user", content }],
            })),
    },
  );
  const response = await worker.fetch(request, options.env ?? env);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: response.status,
    headers: response.headers,
    json,
    text,
  };
}

function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}  ${detail}`);
  }
}

function echoCalls() {
  calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    return upstream(
      body.raw_text.map((_, index) => ({
        index,
        res: `T${index}`,
      })),
    );
  };
}

echoCalls();
let result = await call("Translate into Chinese\nhello world");
check(
  "directive without colon is removed",
  result.status === 200 &&
    result.json.choices?.[0]?.message?.content === "T0",
  JSON.stringify({ status: result.status, body: result.json }),
);

globalThis.fetch = async (_url, init) => {
  calls += 1;
  const body = JSON.parse(init.body);
  check(
    "directive without colon does not enter upstream raw_text",
    body.raw_text[0] === "hello world",
    JSON.stringify(body.raw_text),
  );
  return upstream([{ index: 0, res: "你好世界" }]);
};
result = await call("Translate into Chinese\nhello world");
check(
  "directive without colon resolves target language",
  result.status === 200 &&
    result.json.choices?.[0]?.message?.content === "你好世界",
  JSON.stringify(result.json),
);

globalThis.fetch = async (_url, init) => {
  calls += 1;
  const body = JSON.parse(init.body);
  return upstream([{ index: 0, res: `译文:${body.raw_text[0]}` }]);
};
result = await call("翻译成日语\n你好");
check(
  "Chinese directive without colon is parsed",
  result.status === 200 &&
    result.json.choices?.[0]?.message?.content === "译文:你好",
  JSON.stringify(result.json),
);

calls = 0;
globalThis.fetch = async (_url, init) => {
  calls += 1;
  if (calls === 1) {
    return new Response("limited", {
      status: 429,
      headers: { "retry-after": "7" },
    });
  }
  throw new Error("429 must not be retried");
};
result = await call("Translate into Chinese:\nhello");
check(
  "429 uses rate_limit_error and propagates Retry-After",
  result.status === 429 &&
    result.json?.error?.type === "rate_limit_error" &&
    result.headers.get("retry-after") === "7" &&
    calls === 1,
  JSON.stringify({
    status: result.status,
    type: result.json?.error?.type,
    retryAfter: result.headers.get("retry-after"),
    calls,
  }),
);
check(
  "CORS exposes retry-after and x-request-id",
  result.headers
    .get("access-control-expose-headers")
    ?.includes("retry-after") &&
    result.headers.get("x-request-id")?.length > 0,
  JSON.stringify(Object.fromEntries(result.headers)),
);

for (const status of [500, 502, 503]) {
  calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    if (calls === 1) return new Response("temporary", { status });
    const body = JSON.parse(init.body);
    return upstream(
      body.raw_text.map((_, index) => ({ index, res: `ok${index}` })),
    );
  };
  result = await call("Translate into Chinese:\nhello");
  check(
    `${status} is retried once and recovers`,
    result.status === 200 && calls === 2,
    JSON.stringify({ status: result.status, calls }),
  );
}

calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  throw new TypeError("network down");
};
result = await call("Translate into Chinese:\nhello");
check(
  "network error is retried once",
  result.status === 502 &&
    result.json?.error?.code === "upstream_network_error" &&
    calls === 2,
  JSON.stringify({ status: result.status, calls, body: result.json }),
);

for (const status of [500, 503]) {
  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("still failing", { status });
  };
  result = await call("Translate into Chinese:\nhello");
  check(
    `${status} retries only once before returning 502`,
    result.status === 502 &&
      result.json?.error?.code === "upstream_http_error" &&
      calls === 2,
    JSON.stringify({ status: result.status, calls, body: result.json }),
  );
}

calls = 0;
globalThis.fetch = async (_url, init) => {
  calls += 1;
  if (calls === 1) throw new TypeError("temporary network failure");
  const body = JSON.parse(init.body);
  return upstream(
    body.raw_text.map((_, index) => ({ index, res: `recovered${index}` })),
  );
};
result = await call("Translate into Chinese:\nhello");
check(
  "network error can recover on the retry",
  result.status === 200 &&
    result.json.choices?.[0]?.message?.content === "recovered0" &&
    calls === 2,
  JSON.stringify({ status: result.status, calls, body: result.json }),
);

calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  return new Response("bad request", { status: 400 });
};
result = await call("Translate into Chinese:\nhello");
check(
  "non-retryable upstream 4xx is not retried",
  result.status === 502 && calls === 1,
  JSON.stringify({ status: result.status, calls, body: result.json }),
);

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  return upstream(
    body.raw_text.map((_, index) => ({ index, res: `ok${index}` })),
    { done: false },
  );
};
result = await call("Translate into Chinese:\nhello");
check(
  "complete indexes are accepted without [DONE]",
  result.status === 200 &&
    result.json.choices?.[0]?.message?.content === "ok0",
  JSON.stringify({ status: result.status, body: result.json }),
);

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  return upstream([{ index: 0, res: "only first" }], { done: false });
};
result = await call("Translate into Chinese:\nfirst\nsecond");
check(
  "missing indexes still fail without [DONE]",
  result.status === 502 &&
    result.json?.error?.code === "upstream_incomplete_result",
  JSON.stringify({ status: result.status, body: result.json }),
);

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  return upstream(
    body.raw_text.map((_, index) => ({ index, res: `ok${index}` })),
  );
};
result = await call("Translate into Chinese:\nhello");
check(
  "request id is returned",
  result.status === 200 && /^[0-9a-f-]{36}$/.test(result.headers.get("x-request-id")),
  result.headers.get("x-request-id"),
);

result = await call("", {
  url: "https://worker.example/health",
  method: "GET",
});
check(
  "health endpoint remains available",
  result.status === 200 && result.json?.status === "ok",
  JSON.stringify(result.json),
);

let attemptsByText = new Map();
calls = 0;
globalThis.fetch = async (_url, init) => {
  calls += 1;
  const body = JSON.parse(init.body);
  const key = body.raw_text[0];
  const attempts = (attemptsByText.get(key) ?? 0) + 1;
  attemptsByText.set(key, attempts);
  if (key === "Line 1" && attempts === 1) {
    return new Response("temporary", { status: 500 });
  }
  return upstream(
    body.raw_text.map((text, index) => ({
      index,
      res: `T[${text}]`,
    })),
  );
};
result = await call(
  `Translate into Chinese:\n${Array.from(
    { length: 51 },
    (_, index) => `Line ${index + 1}`,
  ).join("\n")}`,
);
const concurrentContent = result.json.choices?.[0]?.message?.content ?? "";
check(
  "concurrent batch retry preserves order",
  result.status === 200 &&
    calls === 3 &&
    concurrentContent.indexOf("T[Line 1]") <
      concurrentContent.indexOf("T[Line 51]"),
  JSON.stringify({ status: result.status, calls }),
);

let capturedRawText;
let preservedRawText;
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  capturedRawText = body.raw_text;
  return upstream(
    body.raw_text.map((text, index) => ({
      index,
      res: `T[${text}]`,
    })),
  );
};
result = await call("Translate into Chinese:\nfirst line\nsecond line", {
  headers: { "x-doubao-context-mode": "default" },
});
check(
  "default mode still splits internal line breaks",
  result.status === 200 &&
    JSON.stringify(capturedRawText) ===
      JSON.stringify(["first line", "second line"]),
  JSON.stringify({ status: result.status, rawText: capturedRawText }),
);

capturedRawText = undefined;
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  capturedRawText = body.raw_text;
  return upstream(
    body.raw_text.map((rawText, index) => ({
      index,
      res: `T[${rawText}]`,
    })),
  );
};
result = await call("Translate into Chinese:\nfirst line\nsecond line", {
  headers: { "x-doubao-context-mode": "subtitle" },
});
check(
  "subtitle mode keeps one cue's internal line breaks together",
  result.status === 200 &&
    JSON.stringify(capturedRawText) ===
      JSON.stringify(["first line\nsecond line"]),
  JSON.stringify({ status: result.status, rawText: capturedRawText }),
);

capturedRawText = undefined;
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  capturedRawText = body.raw_text;
  return upstream(
    body.raw_text.map((text, index) => ({
      index,
      res: text,
    })),
  );
};
result = await call(
  "Translate into Chinese:\nfirst cue\n\n%%\n\nsecond cue",
  { headers: { "x-doubao-context-mode": "subtitle" } },
);
check(
  "subtitle mode keeps %% as cue boundaries",
  result.status === 200 &&
    JSON.stringify(capturedRawText) ===
      JSON.stringify(["first cue", "second cue"]) &&
    result.json.choices?.[0]?.message?.content.includes("%%"),
  JSON.stringify({
    status: result.status,
    rawText: capturedRawText,
    content: result.json?.choices?.[0]?.message?.content,
  }),
);

capturedRawText = undefined;
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  capturedRawText = body.raw_text;
  return upstream(
    body.raw_text.map((text, index) => ({
      index,
      res: text,
    })),
  );
};
result = await call(
  "Translate into Chinese:\nfirst cue\nline two\n\n%%\n\nsecond cue",
  { headers: { "x-doubao-context-mode": "subtitle-context" } },
);
check(
  "subtitle-context mode splits cues like subtitle mode",
  result.status === 200 &&
    JSON.stringify(capturedRawText) ===
      JSON.stringify(["first cue\nline two", "second cue"]),
  JSON.stringify({ status: result.status, rawText: capturedRawText }),
);

calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  return upstream([{ index: 0, res: "unused" }]);
};
result = await call(
  `Translate into Chinese:\n${"a".repeat(10001)}`,
  { headers: { "x-doubao-context-mode": "subtitle" } },
);
check(
  "subtitle mode rejects a cue over 10,000 characters before upstream",
  result.status === 413 &&
    result.json?.error?.code === "request_too_large" &&
    calls === 0,
  JSON.stringify({ status: result.status, calls, body: result.json }),
);

result = await call(
  `Translate into Chinese:\n${"a".repeat(10001)}`,
  { headers: { "x-doubao-context-mode": "subtitle-context" } },
);
check(
  "subtitle-context mode rejects a cue over 10,000 characters before upstream",
  result.status === 413 &&
    result.json?.error?.code === "request_too_large" &&
    calls === 0,
  JSON.stringify({ status: result.status, calls, body: result.json }),
);

calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  return upstream([{ index: 0, res: "unused" }]);
};
result = await call("Translate into Chinese:\nhello", {
  headers: { "x-doubao-context-mode": "unknown" },
});
check(
  "invalid context mode is rejected before upstream",
  result.status === 400 &&
    result.json?.error?.code === "invalid_request" &&
    calls === 0,
  JSON.stringify({ status: result.status, calls, body: result.json }),
);

const contextEchoFetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  preservedRawText = body.raw_text;
  return upstream(body.raw_text.map((text, index) => ({ index, res: text })));
};

globalThis.fetch = contextEchoFetch;
const crlfCue = "Translate to Chinese:\r\nfirst\r\nsecond\r\n\r\n%%\r\n\r\nthird";
result = await call(crlfCue, {
  headers: { "x-doubao-context-mode": "subtitle" },
});
check(
  "subtitle mode preserves CRLF and cue separators verbatim",
  result.status === 200 &&
    JSON.stringify(preservedRawText) ===
      JSON.stringify(["first\r\nsecond", "third"]) &&
    result.json.choices?.[0]?.message?.content ===
      "first\r\nsecond\r\n\r\n%%\r\n\r\nthird",
  JSON.stringify({ status: result.status, rawText: preservedRawText, body: result.json, expected: ["first\r\nsecond", "third"] }),
);

const spacedCue = "Translate to Chinese:\nfirst\n\n\n\nsecond";
result = await call(spacedCue, {
  headers: { "x-doubao-context-mode": "subtitle" },
});
check(
  "subtitle mode preserves consecutive blank lines",
  result.status === 200 &&
    result.json.choices?.[0]?.message?.content === "first\n\n\n\nsecond",
  JSON.stringify({ status: result.status, body: result.json }),
);

const paddedContext = "Translate to Chinese:\n\nfirst\n\n%%\n\nsecond\n\n";
result = await call(paddedContext, {
  headers: { "x-doubao-context-mode": "subtitle-context" },
});
check(
  "subtitle-context preserves leading and trailing whitespace",
  result.status === 200 &&
    result.json.choices?.[0]?.message?.content === "\nfirst\n\n%%\n\nsecond\n\n",
  JSON.stringify({ status: result.status, body: result.json }),
);

// Translations that do NOT echo %%; alignment must come from the index, not the text.
globalThis.fetch = async () =>
  upstream([
    { index: 0, res: "第一" },
    { index: 1, res: "第二" },
  ]);
result = await call("Translate to Chinese:\nfirst\n\n%%\n\nsecond", {
  headers: { "x-doubao-context-mode": "subtitle-context" },
});
check(
  "subtitle-context aligns by index instead of requiring %% in the translation",
  result.status === 200 &&
    result.json?.choices?.[0]?.message?.content === "第一\n\n%%\n\n第二",
  JSON.stringify({ status: result.status, body: result.json }),
);

// --- subtitle-context parity with subtitle (regression for the 5-cue 502) ---

const fiveCues = [
  "Good morning, everyone.",
  "Today we are going to talk about\nthe ocean.",
  "It covers most of our planet.",
  "But we have explored\nvery little of it.",
  "That is what makes it fascinating.",
];
const fiveCueBody = `Translate to Chinese:\n\n\n${fiveCues.join("\n\n%%\n\n")}`;

for (const mode of ["subtitle", "subtitle-context"]) {
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    capturedRawText = body.raw_text;
    // Upstream returns translations with no %% at all, like the real endpoint.
    return upstream(
      body.raw_text.map((text, index) => ({ index, res: `译${index}：${text}` })),
    );
  };
  result = await call(fiveCueBody, {
    headers: { "x-doubao-context-mode": mode },
  });
  const out = result.json?.choices?.[0]?.message?.content ?? "";
  const parts = out.split("\n\n%%\n\n");
  check(
    `${mode} keeps a 5-cue batch index-aligned when upstream omits %%`,
    result.status === 200 &&
      capturedRawText.length === 5 &&
      parts.length === 5 &&
      // The instruction separator's leftover newlines stay on cue 0 by design.
      parts[0].endsWith("译0：\n\nGood morning, everyone.") &&
      parts[1] === "译1：Today we are going to talk about\nthe ocean." &&
      parts[4] === "译4：That is what makes it fascinating.",
    JSON.stringify({ status: result.status, rawText: capturedRawText, parts }),
  );
}

// Cues that repeat identical text must not collapse into one another.
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  return upstream(
    body.raw_text.map((_text, index) => ({ index, res: `第${index + 1}条` })),
  );
};
result = await call("Translate to Chinese:\nSame.\n\n%%\n\nSame.\n\n%%\n\nSame.", {
  headers: { "x-doubao-context-mode": "subtitle-context" },
});
check(
  "duplicate cues stay separate units",
  result.status === 200 &&
    result.json?.choices?.[0]?.message?.content === "第1条\n\n%%\n\n第2条\n\n%%\n\n第3条",
  JSON.stringify({ status: result.status, body: result.json }),
);

// A cue made only of whitespace must not become an empty upstream slot.
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  capturedRawText = body.raw_text;
  return upstream(body.raw_text.map((_text, index) => ({ index, res: `译${index}` })));
};
result = await call("Translate to Chinese:\nfirst\n\n%%\n\n   \n\n%%\n\nthird", {
  headers: { "x-doubao-context-mode": "subtitle-context" },
});
check(
  "blank-only cue is folded into the separator, not sent upstream",
  result.status === 200 &&
    JSON.stringify(capturedRawText) === JSON.stringify(["first", "third"]),
  JSON.stringify({ status: result.status, rawText: capturedRawText }),
);

// --- webpage translation regression: default mode must stay line-based ---

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  capturedRawText = body.raw_text;
  return upstream(body.raw_text.map((text, index) => ({ index, res: `中${index}` })));
};
result = await call(
  "Translate to Chinese:\nFirst paragraph.\nSecond line.\n\nThird paragraph.",
);
check(
  "webpage default mode still splits every non-empty line",
  result.status === 200 &&
    JSON.stringify(capturedRawText) ===
      JSON.stringify(["First paragraph.", "Second line.", "Third paragraph."]) &&
    result.json?.choices?.[0]?.message?.content ===
      "中0\n中1\n\n中2",
  JSON.stringify({ status: result.status, rawText: capturedRawText, body: result.json }),
);

globalThis.fetch = async () =>
  new Response("limited", {
    status: 429,
    headers: { "retry-after": "not-a-valid-retry-after" },
  });
result = await call("Translate to Chinese:\nhello");
check(
  "invalid Retry-After is not propagated",
  result.status === 429 && result.headers.get("retry-after") === null,
  JSON.stringify({ status: result.status, headers: Object.fromEntries(result.headers) }),
);

globalThis.fetch = async () =>
  new Response("limited", {
    status: 429,
    headers: { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" },
  });
result = await call("Translate to Chinese:\nhello");
check(
  "HTTP-date Retry-After is propagated",
  result.status === 429 &&
    result.headers.get("retry-after") === "Wed, 21 Oct 2026 07:28:00 GMT",
  JSON.stringify({ status: result.status, headers: Object.fromEntries(result.headers) }),
);

calls = 0;
globalThis.fetch = async (_url, init) => {
  calls += 1;
  const error = new Error("aborted");
  error.name = "AbortError";
  throw error;
};
const controller = new AbortController();
controller.abort();
const cancelledRequest = new Request("https://worker.example/v1/chat/completions", {
  method: "POST",
  signal: controller.signal,
  headers: {
    authorization: `Bearer ${env.API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Translate to Chinese:\nhello" }],
  }),
});
const cancelledResponse = await worker.fetch(cancelledRequest, env);
const cancelledBody = await cancelledResponse.json();
check(
  "client cancellation is not reported as an upstream timeout",
  cancelledResponse.status === 499 &&
    cancelledBody.error?.code === "request_cancelled",
  JSON.stringify({ status: cancelledResponse.status, body: cancelledBody, calls }),
);

calls = 0;
globalThis.fetch = async (_url, init) => {
  calls += 1;
  throw init.signal.reason;
};
const originalTimeout = AbortSignal.timeout;
AbortSignal.timeout = () => AbortSignal.abort();
try {
  result = await call("Translate to Chinese:\nhello");
  check(
    "timeout abort is not retried or reported as a network error",
    result.status === 504 &&
      result.json?.error?.code === "upstream_timeout" &&
      calls === 1,
    JSON.stringify({ status: result.status, body: result.json, calls }),
  );
} finally {
  AbortSignal.timeout = originalTimeout;
}

globalThis.fetch = async (_url, init) => {
  calls += 1;
  const body = JSON.parse(init.body);
  return upstream(
    body.raw_text.map((_, index) => ({ index, res: `stream${index}` })),
  );
};
result = await call("Translate to Chinese:\nhello", {
  body: JSON.stringify({
    model: "doubao-ai",
    stream: true,
    messages: [{ role: "user", content: "Translate to Chinese:\nhello" }],
  }),
});
const streamEvents = result.text
  .split("\n\n")
  .filter((event) => event.startsWith("data: ") && event !== "data: [DONE]")
  .map((event) => JSON.parse(event.slice(6)));
check(
  "stream true returns an OpenAI-compatible SSE completion",
  result.status === 200 &&
    result.headers.get("content-type")?.startsWith("text/event-stream") &&
    streamEvents[0]?.object === "chat.completion.chunk" &&
    streamEvents[0]?.choices?.[0]?.delta?.content === "stream0" &&
    streamEvents[1]?.choices?.[0]?.finish_reason === "stop" &&
    result.text.endsWith("data: [DONE]\n\n"),
  JSON.stringify({
    status: result.status,
    contentType: result.headers.get("content-type"),
    text: result.text,
  }),
);

result = await call("Translate to Chinese:\nhello", {
  body: JSON.stringify({
    model: "doubao-ai",
    stream: true,
    stream_options: { include_usage: true },
    messages: [{ role: "user", content: "Translate to Chinese:\nhello" }],
  }),
});
const usageEvents = result.text
  .split("\n\n")
  .filter((event) => event.startsWith("data: ") && event !== "data: [DONE]")
  .map((event) => JSON.parse(event.slice(6)));
check(
  "stream include_usage appends a zero-token usage chunk",
  result.status === 200 &&
    usageEvents.length === 3 &&
    usageEvents[2]?.choices?.length === 0 &&
    usageEvents[2]?.usage?.total_tokens === 0,
  JSON.stringify({ status: result.status, text: result.text }),
);

result = await call("Translate to Chinese:\nhello", {
  body: JSON.stringify({
    model: "doubao-ai",
    stream: "false",
    messages: [{ role: "user", content: "Translate to Chinese:\nhello" }],
  }),
});
check(
  "non-boolean stream is rejected",
  result.status === 400 &&
    result.json?.error?.code === "invalid_request",
  JSON.stringify({ status: result.status, body: result.json }),
);

globalThis.fetch = originalFetch;
await new Promise((resolve) => setTimeout(resolve, 20));
check(
  "no unhandled promise rejections",
  unhandled.length === 0,
  unhandled.join("; "),
);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;

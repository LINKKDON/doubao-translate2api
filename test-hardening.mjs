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

globalThis.fetch = originalFetch;
await new Promise((resolve) => setTimeout(resolve, 20));
check(
  "no unhandled promise rejections",
  unhandled.length === 0,
  unhandled.join("; "),
);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;

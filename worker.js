var S=new TextEncoder,E={"access-control-allow-origin":"*","access-control-allow-methods":"POST, GET, OPTIONS","access-control-allow-headers":"authorization, content-type, x-api-key, x-doubao-target-lang, x-doubao-scene, x-doubao-context-mode","access-control-expose-headers":"retry-after, x-request-id"};function t(e,r,i=400,h){throw[e,r,i,h]}function z(e,r=200){return new Response(JSON.stringify(e),{status:r,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}function A(e){return!!e&&typeof e=="object"&&!Array.isArray(e)}function x(e,r=!1){let i;try{i=JSON.parse(e)}catch{}return A(i)||t("Invalid JSON object.",r?"upstream_stream_error":"invalid_request",r?502:400),i}async function v(e,r,i=!1){let o=e.body?.getReader();if(!o)return"";let n=new TextDecoder,l="",c=0;try{for(;;){let u=await o.read();if(u.done)return l+n.decode();c+=u.value.byteLength,c>r&&t("Body is too large.",i?"upstream_stream_error":"request_too_large",i?502:413),l+=n.decode(u.value,{stream:!0})}}finally{await o.cancel().catch(()=>{}),o.releaseLock()}}var j={"traditional chinese":"zh-Hant","simplified chinese":"zh","chinese":"zh","繁体中文":"zh-Hant","繁體中文":"zh-Hant","简体中文":"zh","中文":"zh","english":"en","英文":"en","英语":"en","japanese":"ja","日文":"ja","日语":"ja","korean":"ko","韩文":"ko","韩语":"ko","french":"fr","german":"de","spanish":"es","portuguese":"pt","russian":"ru","arabic":"ar","italian":"it","indonesian":"id","malay":"ms","thai":"th","vietnamese":"vi","filipino":"fil","tagalog":"fil","uzbek":"uz","zh-cn":"zh","zh-hans":"zh","zh-tw":"zh-Hant","zh-hk":"zh-Hant","simplified mandarin chinese":"zh","traditional mandarin chinese":"zh-Hant","cantonese":"zh","standard arabic":"ar","bengali":"bn","hindi":"hi","javanese (javanese)":"jv","javanese":"jv","telugu":"te","marathi":"mr","tamil":"ta","turkish":"tr","urdu":"ur","gujarati":"gu","polish":"pl","ukrainian":"uk","kannada":"kn","malayalam":"ml","iranian persian":"fa","burmese":"my","swahili (individual language)":"sw","swahili":"sw","sundanese":"su","romanian":"ro","panjabi":"pa","amharic":"am","hausa":"ha","nigerian fulfulde":"ff","bosnian (cyrillic)":"bs","bosnian":"bs","croatian":"hr","dutch":"nl","serbian (cyrillic)":"sr","serbian":"sr","central kurdish":"ku","yoruba":"yo","northern uzbek (cyrillic)":"uz","northern uzbek":"uz","malay (individual language) (arabic)":"ms","igbo":"ig","nepali (individual language)":"ne","nepali":"ne","hungarian":"hu","north azerbaijani (cyrillic)":"az","north azerbaijani":"az","sinhala":"si","modern greek (1453-)":"el","modern greek":"el","czech":"cs","belarusian":"be","nyanja":"ny","kinyarwanda":"rw","zulu":"zu","bulgarian":"bg","swedish":"sv","lingala":"ln","somali":"so","kazakh":"kk","hebrew":"he","norwegian bokmål":"nb","norwegian nynorsk":"nn","afrikaans":"af","albanian":"sq","assamese":"as","basque":"eu","breton":"br","catalan":"ca","corsican":"co","welsh":"cy","danish":"da","divehi":"dv","esperanto":"eo","estonian":"et","faroese":"fo","fijian":"fj","finnish":"fi","western frisian":"fy","scottish gaelic":"gd","irish":"ga","galician":"gl","guarani":"gn","haitian creole":"ht","armenian":"hy","ido":"io","interlingua":"ia","icelandic":"is","georgian":"ka","khmer":"km","kyrgyz":"ky","lao":"lo","latin":"la","latvian":"lv","lithuanian":"lt","luxembourgish":"lb","macedonian":"mk","maltese":"mt","mongolian":"mn","maori":"mi","occitan":"oc","odia":"or","oromo":"om","sanskrit":"sa","slovak":"sk","slovenian":"sl","samoan":"sm","shona":"sn","sindhi":"sd","southern sotho":"st","tahitian":"ty","tatar":"tt","tajik":"tg","tigrinya":"ti","tongan":"to","tswana":"tn","turkmen":"tk","uyghur":"ug","volapük":"vo","wolof":"wo","xhosa":"xh","eastern yiddish":"yi","akan":"ak","bambara":"bm","bislama":"bi","tibetan":"bo","chechen":"ce","chuvash":"cv","dzongkha":"dz","ewe":"ee","ganda":"lg","ossetian":"os","swati":"ss","venda":"ve","north ndebele":"nd","south ndebele":"nr","chamorro":"ch","marshallese":"mh"};var KNOWN_LANGS=["zh","zh-Hant","en","ja","ko","fr","de","es","es-ES","pt","ru","ar","it","id","ms","th","vi","fil","uz","bn","hi","jv","te","mr","ta","tr","ur","gu","pl","uk","kn","ml","fa","my","sw","su","ro","pa","am","ha","ff","bs","hr","nl","sr","ku","yo","ig","ne","hu","az","si","el","cs","be","ny","rw","zu","bg","sv","ln","so","kk","he","nb","nn","af","sq","as","eu","br","ca","co","cy","da","dv","eo","et","fo","fj","fi","fy","gd","ga","gl","gn","ht","hy","io","ia","is","ka","km","ky","lo","la","lv","lt","lb","mk","mt","mn","mi","oc","or","om","sa","sk","sl","sm","sn","sd","st","ty","tt","tg","ti","to","tn","tk","ug","vo","wo","xh","yi","ak","bm","bi","bo","ce","cv","dz","ee","lg","os","ss","ve","nd","nr","ch","mh"];
function normalizeRegionCode(e,r){
  // e is already lowercased, "_"->"-", parens stripped, spaces collapsed.
  let i=e.indexOf("-");
  if(i<1)return null;
  let base=e.slice(0,i);
  if(!/^[a-z]{2,3}$/.test(base))return null;
  if(base==="zh"){
    // Script subtags beat region subtags; zh-Hant/zh-TW stay Traditional.
    let traditional=/-(tw|hk|mo|hant)\b/.test(e)||r;
    return traditional?"zh-Hant":"zh";
  }
  let hit=KNOWN_LANGS.find(s=>s.toLowerCase()===base);
  return hit||null
}
function normalizeLangGuess(raw){
  // Detect "traditional" markers BEFORE stripping parentheses/qualifiers,
  // since content like "(Traditional)" would otherwise be discarded along
  // with the parens before this check ever sees it.
  let compact=raw.replace(/[_]/g,"-").replace(/\s+/g," ").trim();
  let isTraditional=/traditional|hant|taiwan|hong\s?kong/.test(compact);
  compact=compact.replace(/\([^)]*\)/g," ").replace(/\s+/g," ").trim();
  let applyTraditional=r=>r==="zh"&&isTraditional?"zh-Hant":r;
  if(j[compact]!==void 0)return applyTraditional(j[compact]);let regionHit=normalizeRegionCode(compact,isTraditional);if(regionHit)return regionHit;
  let codeHit=KNOWN_LANGS.find(l=>l.toLowerCase()===compact);
  if(codeHit)return codeHit;
  let stripped=compact.replace(/\b(simplified|traditional|standard|modern|literary|mandarin|the|language)\b/g,"").replace(/\s+/g," ").trim();
  if(stripped&&j[stripped]!==void 0){
    return applyTraditional(j[stripped]);
  }
  let strippedCodeHit=stripped&&KNOWN_LANGS.find(l=>l.toLowerCase()===stripped);
  if(strippedCodeHit)return strippedCodeHit;
  if(/chinese|cantonese|mandarin/.test(compact))return isTraditional?"zh-Hant":"zh";
  if(/arabic/.test(compact))return"ar";
  if(/portuguese/.test(compact))return"pt";
  if(/spanish/.test(compact))return"es";
  return null
}

const LANGUAGE_PATTERN =
  /(?:\btranslate\b[^\n:：]{0,160}?\b(?:to|into)\s+|翻译(?:成|为)|(?:target|output)\s+language\s*[:：]\s*)([^\n:：.!]+)(?=[:：.!]|$)/i;

function targetLang(value) {
  if (typeof value !== "string") {
    t("Target language must be a string.", "unsupported_target_language");
  }
  const normalized = normalizeLangGuess(value.trim().toLowerCase());
  if (!normalized) {
    t(
      "Unsupported target language. Use target_lang with a language code.",
      "unsupported_target_language",
    );
  }
  return normalized;
}

function stripInstruction(content, mode) {
  const bodyStart = (prefix) =>
    content
      .slice(prefix.length)
      .replace(
        mode === "default" ? /^(?:\r\n|\r|\n)+/ : /^(?:\r\n|\r|\n)/,
        "",
      );
  const colonMatch =
    content.match(/^(?:please\s+)?translate[^\n:：]{1,160}[:：][ \t]*/i) ??
    content.match(/^(?:请)?翻译(?:成|为)[^\n:：]{1,80}[:：][ \t]*/);

  if (colonMatch) {
    return {
      instruction: colonMatch[0],
      body: bodyStart(colonMatch[0]),
    };
  }

  // Some clients omit the colon. Treat a leading directive line as an
  // instruction instead of translating the directive itself.
  const firstLine = content.match(/^[^\r\n]*/)?.[0] ?? "";
  const newlineDirective =
    /^(?:please\s+)?translate\b[^\r\n:：]{0,160}?\b(?:to|into)\s+\S[^\r\n]*$/i.test(
      firstLine,
    ) || /^(?:请)?翻译(?:成|为)\s*\S[^\r\n]*$/.test(firstLine);

  if (newlineDirective) {
    return {
      instruction: firstLine,
      body: bodyStart(firstLine),
    };
  }

  return { instruction: "", body: content };
}

function resolveContextMode(request) {
  const header = request.headers.get("x-doubao-context-mode");
  if (header === null || header.trim() === "") {
    return { mode: "default" };
  }
  const mode = header.trim().toLowerCase();
  if (
    mode !== "default" &&
    mode !== "subtitle" &&
    mode !== "subtitle-context"
  ) {
    t(
      "x-doubao-context-mode must be default, subtitle, or subtitle-context.",
      "invalid_request",
    );
  }
  return { mode };
}

function splitTranslationUnits(text, { mode }) {
  if (mode === "subtitle-context") {
    if (text.length > 10000) {
      t(
        "A subtitle context group exceeds 10,000 characters.",
        "request_too_large",
        413,
      );
    }
    return [{ text, separator: "" }];
  }

  if (mode === "subtitle") {
    // Keep each cue verbatim. Only a standalone %% line is a boundary;
    // everything between boundaries, including blank lines, stays intact.
    const parts = text.split(
      /((?:\r\n|\r|\n)+[ \t]*%%[ \t]*(?:(?:\r\n|\r|\n)+|$))/,
    );
    const units = [];
    for (let index = 0; index < parts.length; index += 2) {
      const cue = parts[index] ?? "";
      const separator = parts[index + 1] ?? "";
      if (cue.length > 10000) {
        t("One subtitle cue exceeds 10,000 characters.", "request_too_large", 413);
      }
      units.push(
        cue.trim()
          ? { text: cue, separator }
          : { text: "", separator: cue + separator },
      );
    }
    return units;
  }

  const body = text;
  const parts = body.split(/((?:\r\n|\r|\n)+)/);
  const segments = [];
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index] ?? "";
    const separator = parts[index + 1] ?? "";
    if (!line.trim() || /^[ \t]*%%[ \t]*$/.test(line)) {
      segments.push({
        text: "",
        separator: line + separator,
        boundary: /^[ \t]*%%[ \t]*$/.test(line),
      });
    } else {
      if (line.length > 10000) {
        t("One line exceeds 10,000 characters.", "request_too_large", 413);
      }
      segments.push({ text: line, separator });
    }
  }

  return segments;
}

function countSubtitleBoundaries(text) {
  return (text.match(/(?:^|\r\n|\r|\n)[ \t]*%%[ \t]*(?=\r\n|\r|\n|$)/g) ?? [])
    .length;
}

function resolveConcurrency(env) {
  const raw = env.DOUBAO_MAX_CONCURRENCY;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return 4;
  }
  const value = Number(String(raw).trim());
  if (Number.isInteger(value) && value >= 1 && value <= 4) {
    return value;
  }
  t(
    "DOUBAO_MAX_CONCURRENCY must be an integer from 1 to 4.",
    "configuration_error",
    503,
  );
}

function resolveScene(request, env) {
  const header = request.headers.get("x-doubao-scene");
  if (header !== null && header.trim() !== "") {
    const value = Number(header.trim());
    if (Number.isInteger(value) && value >= 1 && value <= 6) {
      return value;
    }
    t(
      "x-doubao-scene must be an integer from 1 to 6.",
      "invalid_request",
    );
  }

  const configured = env.DOUBAO_DEFAULT_SCENE;
  if (
    configured === undefined ||
    configured === null ||
    String(configured).trim() === ""
  ) {
    return 2;
  }
  const value = Number(String(configured).trim());
  if (Number.isInteger(value) && value >= 1 && value <= 6) {
    return value;
  }
  t(
    "DOUBAO_DEFAULT_SCENE must be an integer from 1 to 6.",
    "configuration_error",
    503,
  );
}

function checkUpstreamCode(payload) {
  if (payload.code === undefined || payload.code === 0) {
    return;
  }
  if (payload.code === 710012001) {
    t("Doubao login has expired.", "upstream_auth_error", 502);
  }
  t("Doubao translation failed.", "upstream_stream_error", 502);
}

function parseUpstreamJson(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {}
  if (!A(payload)) {
    t("Invalid Doubao stream JSON.", "upstream_stream_error", 502);
  }
  return payload;
}

function retryAfterHeader(value) {
  const trimmed = value?.trim();
  return trimmed &&
    trimmed.length <= 128 &&
    (/^\d+$/.test(trimmed) ||
      /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/i.test(
        trimmed,
      ))
    ? { "retry-after": trimmed }
    : undefined;
}

function randomBackoff() {
  return 200 + Math.floor(Math.random() * 200);
}

function delayWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function translateBatch(
  rawText,
  target,
  cookie,
  signal,
  scene,
  contextMode,
  requestSignal,
) {
  let retried = false;

  for (;;) {
    try {
      const response = await fetch(
        "https://www.doubao.com/samantha/plugin/stream_article_translate",
        {
          method: "POST",
          redirect: "manual",
          signal,
          headers: {
            "content-type": "application/json",
            accept: "*/*",
            cookie,
          },
          body: JSON.stringify({
            raw_text: rawText,
            target_lang: target,
            translate_service: "1",
            scene,
            frontend_source: 1,
          }),
        },
      );

      if (!response.ok) {
        const status = response.status;
        const retryAfter = retryAfterHeader(
          response.headers.get("retry-after"),
        );
        await response.body?.cancel().catch(() => {});

        if (status >= 500 && status <= 599 && !retried) {
          retried = true;
          await delayWithAbort(randomBackoff(), signal);
          continue;
        }
        if (status === 429) {
          t(
            "Doubao rate limit reached.",
            "upstream_rate_limit",
            429,
            retryAfter,
          );
        }
        t(
          "Doubao access refused or request failed.",
          "upstream_http_error",
          502,
        );
      }

      const streamText = (await v(response, 512 * 1024, true))
        .replace(/\r\n|\r/g, "\n")
        .trimStart();
      if (!streamText) {
        t(
          "Doubao returned an empty response.",
          "upstream_incomplete_result",
          502,
        );
      }
      if (streamText.startsWith("{")) {
        checkUpstreamCode(parseUpstreamJson(streamText));
        t(
          "Upstream returned no translations.",
          "upstream_incomplete_result",
          502,
        );
      }

      const translations = new Map();
      for (const block of streamText.split(/\n\n+/)) {
        let event = "message";
        const data = [];
        for (const line of block.split("\n")) {
          const trimmed = line.trimEnd();
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (trimmed.startsWith("event:")) {
            event = trimmed.slice(6).trim();
          }
          if (trimmed.startsWith("data:")) {
            data.push(trimmed.slice(5).replace(/^ /, ""));
          }
        }
        if (!data.length) continue;

        const payloadText = data.join("\n").trim();
        if (payloadText === "[DONE]") continue;
        if (!["json", "message", "err", "done"].includes(event)) continue;
        if (event === "done") {
          if (payloadText) checkUpstreamCode(parseUpstreamJson(payloadText));
          continue;
        }

        const payload = parseUpstreamJson(payloadText);
        checkUpstreamCode(payload);
        if (event === "err") {
          t(
            "Upstream stream reported an error.",
            "upstream_stream_error",
            502,
          );
        }

        const items =
          A(payload.data) && Array.isArray(payload.data.items)
            ? payload.data.items
            : [];
        for (const item of items) {
          if (
            !A(item) ||
            typeof item.index !== "number" ||
            !Number.isInteger(item.index) ||
            item.index < 0 ||
            item.index >= rawText.length ||
            typeof item.res !== "string" ||
            !item.res.trim()
          ) {
            t(
              "Invalid upstream translation item.",
              "upstream_stream_error",
              502,
            );
          }
          translations.set(item.index, item.res);
        }
      }

      // A complete index set is sufficient; [DONE] is optional.
      if (translations.size !== rawText.length) {
        t(
          "Upstream translation is incomplete.",
          "upstream_incomplete_result",
          502,
        );
      }
      if (
        contextMode === "subtitle-context" &&
        countSubtitleBoundaries(translations.get(0) ?? "") !==
          countSubtitleBoundaries(rawText[0])
      ) {
        t(
          "Upstream did not preserve subtitle boundaries.",
          "upstream_stream_error",
          502,
        );
      }
      return rawText.map((_, index) => translations.get(index));
    } catch (error) {
      if (Array.isArray(error)) throw error;
      const timedOut =
        signal?.aborted && !requestSignal?.aborted ||
        error?.name === "TimeoutError";
      if (timedOut) {
        t("Doubao request timed out.", "upstream_timeout", 504);
      }
      if (requestSignal?.aborted) {
        t("Request was cancelled.", "request_cancelled", 499);
      }
      if (!retried) {
        retried = true;
        try {
          await delayWithAbort(randomBackoff(), signal);
        } catch {
          if (requestSignal?.aborted) {
            t("Request was cancelled.", "request_cancelled", 499);
          }
          t("Doubao request timed out.", "upstream_timeout", 504);
        }
        continue;
      }
      if (signal?.aborted) {
        if (requestSignal?.aborted) {
          t("Request was cancelled.", "request_cancelled", 499);
        }
        t("Doubao request timed out.", "upstream_timeout", 504);
      }
      t("Doubao connection failed.", "upstream_network_error", 502);
    }
  }
}

function parseTranslationRequest(body, request, env) {
  if (!Array.isArray(body.messages) || !body.messages.every(A)) {
    t("A messages array is required.", "invalid_request");
  }

  const messages = body.messages;
  const user = messages.findLast((message) => message.role === "user");
  if (typeof user?.content !== "string") {
    t("A plain-text user message is required.", "unsupported_input");
  }

  const contextMode = resolveContextMode(request);
  const { instruction, body: text } = stripInstruction(
    user.content,
    contextMode.mode,
  );
  const systemTexts = messages
    .filter(
      (message) =>
        message.role === "system" || message.role === "developer",
    )
    .map((message) =>
      typeof message.content === "string" ? message.content : "",
    );

  const explicit =
    body.target_lang ?? request.headers.get("x-doubao-target-lang");
  let target;
  if (explicit !== null) {
    target = targetLang(explicit);
  } else {
    const fromInstruction = instruction.match(LANGUAGE_PATTERN)?.[1];
    if (fromInstruction !== undefined) {
      target = targetLang(fromInstruction);
    } else {
      const guesses = [];
      for (const systemText of systemTexts) {
        const guess = systemText.match(LANGUAGE_PATTERN)?.[1];
        if (guess === undefined) continue;
        try {
          const code = targetLang(guess);
          if (code) guesses.push(code);
        } catch {}
      }
      const unique = [...new Set(guesses)];
      if (unique.length > 1) {
        t("Conflicting target languages.", "invalid_request");
      }
      target =
        unique[0] ?? targetLang(env.DOUBAO_DEFAULT_TARGET_LANG ?? "zh");
    }
  }

  if (!text.trim()) {
    t("Translation input is empty.", "empty_translation_input");
  }
  if (text.length > 20000) {
    t("Text exceeds 20,000 characters.", "request_too_large", 413);
  }
  if (
    /^\s*<(?:yaml|text)\b/i.test(text) ||
    /<\/(?:html|a|p|div|span|code|pre|h[1-6]|strong|em|br|ul|li|table)\b|<(?:html|a|p|div|span|code|pre|h[1-6]|strong|em|br|ul|li|table)\b[^>]*(?:=|\/)[^>]*>/i.test(
      text,
    )
  ) {
    t(
      "Use a plain-text template; HTML and YAML wrappers are unsupported.",
      "unsupported_input",
    );
  }

  const segments = splitTranslationUnits(text, contextMode);

  const lines = segments.filter((segment) => segment.text).map((segment) => segment.text);
  if (!lines.length) {
    t("Translation input is empty.", "empty_translation_input");
  }

  const batches = [];
  let current = [];
  let currentLength = 0;
  for (const line of lines) {
    if (current.length === 50 || currentLength + line.length > 10000) {
      batches.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length;
  }
  batches.push(current);
  if (batches.length > 4) {
    t(
      "Text exceeds four batches (50 lines / 10,000 characters each).",
      "request_too_large",
      413,
    );
  }

  return { target, segments, batches, contextMode };
}

async function handleRequest(request, env, requestId) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return z({ status: "ok", runtime: "cloudflare-workers-lite" });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (url.pathname !== "/v1/chat/completions") {
    t("Route not found.", "not_found", 404);
  }
  if (request.method !== "POST") {
    t("POST is required.", "method_not_allowed", 405);
  }

  const cookie = env.DOUBAO_COOKIE?.replace(/^Cookie:\s*/i, "").trim();
  if (
    !env.API_KEY ||
    env.API_KEY.length < 16 ||
    /\s/.test(env.API_KEY) ||
    !cookie ||
    /[\r\n]/.test(cookie) ||
    !["sessionid", "sid_tt", "uid_tt"].every((name) =>
      new RegExp(`(?:^|;\\s*)${name}=[^;\\s]+`).test(cookie),
    )
  ) {
    t(
      "Worker secrets are missing or invalid.",
      "configuration_error",
      503,
    );
  }

  const providedKey =
    request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1] ??
    request.headers.get("x-api-key");
  if (providedKey !== env.API_KEY) {
    t("Invalid or missing API Key.", "unauthorized", 401);
  }

  const body = x(await v(request, 64 * 1024));
  if (body.stream !== undefined && body.stream !== false) {
    t("Disable stream in Lite mode.", "unsupported_feature");
  }
  if (
    ["tools", "functions", "reasoning"].some(
      (field) => body[field] !== undefined,
    )
  ) {
    t(
      "Only plain-text translation is supported.",
      "unsupported_feature",
    );
  }
  if (body.model !== undefined && body.model !== "doubao-ai") {
    t("Only doubao-ai is supported.", "model_not_found", 404);
  }

  const scene = resolveScene(request, env);
  const { target, segments, batches, contextMode } = parseTranslationRequest(
    body,
    request,
    env,
  );
  const results = [];
  const overallTimeout = AbortSignal.timeout(90000);
  const concurrency = resolveConcurrency(env);
  let outputBytes = 0;

  for (let offset = 0; offset < batches.length; offset += concurrency) {
    const group = await Promise.all(
      batches
        .slice(offset, offset + concurrency)
        .map((batch) =>
          translateBatch(
            batch,
            target,
            cookie,
            AbortSignal.any([
              overallTimeout,
              request.signal,
              AbortSignal.timeout(45000),
            ]),
            scene,
            contextMode.mode,
            request.signal,
          ),
        ),
    );
    for (const batchResult of group) {
      for (const translation of batchResult) {
        outputBytes += S.encode(translation).byteLength;
        if (outputBytes > 256 * 1024) {
          t(
            "Translation output is too large.",
            "upstream_stream_error",
            502,
          );
        }
        results.push(translation);
      }
    }
  }

  let resultIndex = 0;
  const content = segments
    .map(
      (segment) =>
        (segment.text ? results[resultIndex++] : "") + segment.separator,
    )
    .join("");

  return z({
    id: `chatcmpl_${requestId.replaceAll("-", "")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "doubao-ai",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

const worker = {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    let response;
    try {
      response = await handleRequest(request, env, requestId);
    } catch (error) {
      const [message, code, status, headers] = Array.isArray(error)
        ? error
        : ["Lite Worker failed.", "internal_error", 500];
      const statusCode = Number.isInteger(status) ? status : 500;
      const type =
        statusCode === 429
          ? "rate_limit_error"
          : statusCode === 401
            ? "authentication_error"
            : statusCode < 500
              ? "invalid_request_error"
              : "api_error";
      response = z(
        { error: { type, message, code, param: null } },
        statusCode,
      );
      if (headers) {
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      }
    }

    response.headers.set("x-request-id", requestId);
    for (const [name, value] of Object.entries(E)) {
      response.headers.set(name, value);
    }
    return response;
  },
};

export default worker;

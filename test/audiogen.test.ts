import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APIKeyEnvVar,
  CapDiarStream,
  CapSTT,
  CapTTS,
  CapTTSClone,
  Capabilities,
  Generators,
  LangCurl,
  LangPython,
  LangTypeScript,
  Languages,
  Models,
  endpoint,
  endpointSpec,
  generate,
  generateAll,
  generateForModel,
  generatorFor,
  lookupModel,
  modelsWithCapability,
  parseCapability,
  parseLanguage,
  supports,
  type Capability,
  type Language,
} from "../src/index.ts";

const testURL = "https://router.example.com";

/**
 * base returns the normalised base URL for a router URL. The normalisation is
 * internal, so this reads it back off a non-streaming endpoint.
 */
function base(url: string): string {
  return endpoint(CapTTS, { URL: url, Model: "m" }).replace(/\/audio\/speech$/, "");
}

test("a router URL is normalised to an https base ending in /v1", () => {
  const cases: [string, string][] = [
    ["https://router.example.com", "https://router.example.com/v1"],
    ["https://router.example.com/", "https://router.example.com/v1"],
    ["https://router.example.com/v1", "https://router.example.com/v1"],
    ["https://router.example.com/v1/", "https://router.example.com/v1"],
    ["router.example.com", "https://router.example.com/v1"],
    ["http://localhost:8080", "http://localhost:8080/v1"],
    ["wss://router.example.com/v1", "https://router.example.com/v1"],
    ["https://router.example.com/api", "https://router.example.com/api/v1"],
    ["  https://router.example.com  ", "https://router.example.com/v1"],
  ];
  for (const [input, want] of cases) {
    assert.equal(base(input), want, `normalising ${input}`);
  }
});

test("an unusable router URL is rejected", () => {
  for (const input of ["", "   ", "ftp://router.example.com"]) {
    assert.throws(() => base(input), `${JSON.stringify(input)} should have failed`);
  }
});

test("streaming capabilities use the WebSocket scheme", () => {
  const req = { URL: testURL, Model: "m" };
  const streaming = new Set<Capability>(["stt_stream", CapDiarStream]);
  for (const capability of Capabilities) {
    const ep = endpoint(capability, req);
    assert.equal(ep.startsWith("wss://"), streaming.has(capability), `${capability} endpoint ${ep}`);
  }
});

// This is the broad safety net: every capability must render in every language,
// mention its model and endpoint, and never leak an unrendered delimiter.
test("every capability renders in every language", () => {
  const model = "Olares/vendor/some-model";
  for (const capability of Capabilities) {
    for (const lang of Languages) {
      const req = { URL: testURL, Model: model, Lang: lang };
      const code = generate(capability, req);
      const where = `${capability}/${lang}`;

      assert.notEqual(code.trim(), "", `${where} produced empty output`);
      assert.ok(code.includes(model), `${where} does not mention the model`);
      const ep = endpoint(capability, req);
      assert.ok(
        code.includes(ep) || code.includes("router.example.com"),
        `${where} does not mention the endpoint ${ep}`,
      );
      for (const bad of ["<<", ">>", "<no value>"]) {
        assert.ok(!code.includes(bad), `${where} contains ${bad}`);
      }
      assert.ok(code.endsWith("\n"), `${where} should end with a newline`);
      assert.ok(!code.startsWith("\n"), `${where} should not start with a blank line`);
    }
  }
});

// Guards the requirement that generated samples carry no Chinese (or other CJK) text.
test("snippets are English only", () => {
  const cjk = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u;
  for (const capability of Capabilities) {
    for (const lang of Languages) {
      const code = generate(capability, { URL: testURL, Model: "m", Lang: lang });
      const found = cjk.exec(code);
      assert.equal(found, null, `${capability}/${lang} contains non-English text ${found?.[0]}`);
    }
  }
});

test("a supplied API key is inlined", () => {
  const key = "sk-secret-value";
  for (const lang of Languages) {
    const code = generate(CapSTT, { URL: testURL, Model: "m", APIKey: key, Lang: lang });
    assert.ok(code.includes(key), `${lang} snippet should inline the provided key`);
    assert.ok(
      !code.includes(APIKeyEnvVar),
      `${lang} snippet should not reference ${APIKeyEnvVar} when a key is given`,
    );
  }
});

test("a missing API key falls back to the environment", () => {
  for (const lang of Languages) {
    const code = generate(CapSTT, { URL: testURL, Model: "m", Lang: lang });
    assert.ok(
      code.includes(APIKeyEnvVar),
      `${lang} snippet should read ${APIKeyEnvVar} when no key is given`,
    );
  }
  // The Python snippet only imports os when it actually reads the environment.
  const withEnv = generate(CapSTT, { URL: testURL, Model: "m", Lang: LangPython });
  assert.ok(withEnv.includes("import os"), "python snippet should import os when reading the environment");
  const withKey = generate(CapSTT, { URL: testURL, Model: "m", APIKey: "sk-x", Lang: LangPython });
  assert.ok(!withKey.includes("import os"), "python snippet should not import os when the key is inlined");
});

test("quoting escapes special characters", () => {
  const code = generate(CapSTT, { URL: testURL, Model: "m", APIKey: 'sk-"quote\\slash', Lang: LangPython });
  assert.ok(code.includes('sk-\\"quote\\\\slash'), `python snippet did not escape the key:\n${code}`);
});

test("bad input is rejected", () => {
  assert.throws(() => generate(CapSTT, { URL: "", Model: "m", Lang: LangCurl }), /url is required/);
  assert.throws(() => generate(CapSTT, { URL: testURL, Model: "", Lang: LangCurl }), /model is required/);
  assert.throws(
    () => generate(CapSTT, { URL: testURL, Model: "m", Lang: "cobol" as Language }),
    /unknown language/,
  );
  assert.throws(
    () => generate("teleport" as Capability, { URL: testURL, Model: "m", Lang: LangCurl }),
    /unknown capability/,
  );
});

test("an omitted language defaults to curl", () => {
  assert.equal(
    generate(CapSTT, { URL: testURL, Model: "m" }),
    generate(CapSTT, { URL: testURL, Model: "m", Lang: LangCurl }),
  );
});

test("generateAll returns one snippet per language", () => {
  const out = generateAll(CapTTS, { URL: testURL, Model: "m" });
  assert.equal(Object.keys(out).length, Languages.length);
  for (const lang of Languages) {
    assert.notEqual(out[lang].trim(), "", `generateAll produced no ${lang} snippet`);
  }
});

// Keeps the per-capability functions and the capability list from drifting apart.
test("every capability has a generator", () => {
  assert.equal(Generators.size, Capabilities.length);
  for (const capability of Capabilities) {
    const fn = generatorFor(capability);
    assert.ok(fn, `no generator registered for ${capability}`);
    assert.doesNotThrow(() => fn({ URL: testURL, Model: "m", Lang: LangCurl }));
  }
});

test("every registry model declares usable capabilities", () => {
  assert.notEqual(Models.length, 0, "registry is empty");
  const seen = new Set<string>();
  for (const m of Models) {
    assert.ok(!seen.has(m.Name), `duplicate model ${m.Name} in registry`);
    seen.add(m.Name);
    assert.notEqual(m.Capabilities.length, 0, `model ${m.Name} declares no capabilities`);
    for (const capability of m.Capabilities) {
      assert.ok(endpointSpec(capability), `model ${m.Name} declares unknown capability ${capability}`);
    }
  }
});

test("generateForModel covers every capability a model declares", () => {
  const snippets = generateForModel("Olares/openbmb/VoxCPM2", { URL: testURL, Lang: LangCurl });
  assert.equal(snippets.length, 2, "expected 2 capabilities for VoxCPM2");
  assert.deepEqual(snippets.map((s) => s.Capability), [CapTTS, CapTTSClone]);
  for (const s of snippets) {
    assert.ok(s.Code.includes("Olares/openbmb/VoxCPM2"), `${s.Capability} snippet does not name the model`);
    assert.equal(s.Language, LangCurl);
  }
  assert.throws(() => generateForModel("nope/not-a-model", { URL: testURL }), /not in the registry/);
});

test("lookupModel ignores case and surrounding whitespace", () => {
  assert.ok(lookupModel("olares/openbmb/voxcpm2"), "lookup should fall back to a case-insensitive match");
  assert.ok(lookupModel("  Olares/pyannote/embedding  "), "lookup should tolerate surrounding whitespace");
  assert.equal(lookupModel("nope/not-a-model"), undefined);
});

test("modelsWithCapability filters the registry", () => {
  const tts = modelsWithCapability(CapTTS);
  assert.notEqual(tts.length, 0, "expected at least one tts model");
  for (const m of tts) {
    assert.ok(supports(m, CapTTS), `${m.Name} was returned but does not support tts`);
  }
});

test("parseLanguage accepts the common aliases", () => {
  const cases: Record<string, Language> = {
    curl: LangCurl, CURL: LangCurl, bash: LangCurl,
    py: LangPython, Python: LangPython,
    ts: LangTypeScript, typescript: LangTypeScript, node: LangTypeScript,
  };
  for (const [input, want] of Object.entries(cases)) {
    assert.equal(parseLanguage(input), want, `parseLanguage(${input})`);
  }
  assert.throws(() => parseLanguage("rust"), /unknown language/);
});

test("parseCapability trims and lowercases", () => {
  assert.equal(parseCapability("  TTS_Clone "), CapTTSClone);
  assert.throws(() => parseCapability("dance"), /unknown capability/);
});

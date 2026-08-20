// The snippet bodies live inside TypeScript template literals, so a backslash,
// a backtick or a "${" in the payload has to be escaped. Getting that wrong is
// mostly a type error, except for a lone trailing backslash, which silently
// swallows the newline that follows it. These tests pin down the shapes that
// would break in that case.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Capabilities } from "../src/capability.ts";
import { LangCurl, LangTypeScript, Languages } from "../src/language.ts";
import { generate } from "../src/audiogen.ts";

const req = { URL: "https://router.example.com", Model: "m" };

test("curl snippets keep their line continuations", () => {
  // A swallowed continuation joins two lines and leaves the second line's
  // indentation in the middle of the first, so no line body may contain a run
  // of spaces. curl is the only language whose snippets use backslashes at all.
  for (const capability of Capabilities) {
    const lines = generate(capability, { ...req, Lang: LangCurl }).split("\n");
    for (const [i, line] of lines.entries()) {
      const body = line.trimStart();
      if (body.startsWith("#")) continue; // the protocol comments align their own numbering
      assert.ok(
        !body.includes("  "),
        `${capability}: line ${i + 1} runs two lines together, so a line continuation lost its backslash:\n${line}`,
      );
    }
  }
});

test("TypeScript snippets keep their template literals", () => {
  for (const capability of Capabilities) {
    const code = generate(capability, { ...req, Lang: LangTypeScript });
    if (!code.includes("Authorization:")) continue; // the OpenAI SDK snippets pass the key to the client
    assert.ok(
      code.includes("`Bearer ${apiKey}`"),
      `${capability}: the Authorization header lost its template literal`,
    );
  }
});

test("no snippet line carries trailing whitespace", () => {
  for (const capability of Capabilities) {
    for (const lang of Languages) {
      const code = generate(capability, { ...req, Lang: lang });
      const offender = code.split("\n").findIndex((line) => /\s$/.test(line));
      assert.equal(offender, -1, `${capability}/${lang}: line ${offender + 1} has trailing whitespace`);
    }
  }
});

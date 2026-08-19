import assert from "node:assert/strict";
import { test } from "node:test";
import { Capabilities } from "../src/capability.ts";
import { Languages } from "../src/language.ts";
import { render, templateNames } from "../src/template.ts";

test("there is exactly one template per capability and language", () => {
  const want = Capabilities.flatMap((c) => Languages.map((l) => `${c}.${l}`)).sort();
  assert.deepEqual(templateNames(), want);
});

test("an unknown template name is rejected", () => {
  assert.throws(() => render("tts.rust", {}), /no template named tts\.rust/);
});

test("a template referencing an absent field is rejected", () => {
  assert.throws(() => render("tts.curl", {}), /no field named/);
});

test("if blocks follow the truthiness of their field", () => {
  const values = {
    Model: "m",
    BaseURL: "https://host/v1",
    Endpoint: "https://host/v1/audio/transcriptions",
    CurlAuth: "$KEY",
    PyAuth: '"key"',
    TSAuth: '"key"',
    CurlPreamble: "",
  };
  assert.ok(render("stt.python", { ...values, PyImportOS: true }).startsWith("import os\n"));
  assert.ok(render("stt.python", { ...values, PyImportOS: false }).startsWith("from openai import"));
});

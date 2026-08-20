import type { SnippetSet } from "./types.ts";

export const vad: SnippetSet = {
  curl: (d) => `
${d.curlPreamble}curl -X POST "${d.endpoint}" \\
  -H "Authorization: Bearer ${d.curlAuth}" \\
  -F "model=${d.model}" \\
  -F "file=@audio.mp3"
`,

  python: (d) => `
${d.pyImportOS ? "import os\n\n" : ""}import httpx

API_KEY = ${d.pyAuth}

resp = httpx.post(
    "${d.endpoint}",
    headers={"Authorization": f"Bearer {API_KEY}"},
    data={"model": "${d.model}"},
    files={"file": ("audio.mp3", open("audio.mp3", "rb"), "audio/mpeg")},
    timeout=180.0,
)
resp.raise_for_status()
print(resp.json())
`,

  typescript: (d) => `
import { readFile } from "node:fs/promises";

const apiKey = ${d.tsAuth};

const fileBytes = await readFile("audio.mp3");
const form = new FormData();
form.set("model", "${d.model}");
form.set("file", new Blob([fileBytes], { type: "audio/mpeg" }), "audio.mp3");

const resp = await fetch("${d.endpoint}", {
  method: "POST",
  headers: { Authorization: \`Bearer \${apiKey}\` },
  body: form,
});
if (!resp.ok) throw new Error(await resp.text());

console.log(await resp.json());
`,
};

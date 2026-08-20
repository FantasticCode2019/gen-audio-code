import type { SnippetSet } from "./types.ts";

export const ttsClone: SnippetSet = {
  curl: (d) => `
${d.curlPreamble}curl -X POST "${d.endpoint}" \\
  -H "Authorization: Bearer ${d.curlAuth}" \\
  -F "model=${d.model}" \\
  -F "file=@audio.mp3" \\
  -F "input=Hello, this is a voice cloning sample." \\
  --output clone.wav
`,

  python: (d) => `
${d.pyImportOS ? "import os\n" : ""}from pathlib import Path

import httpx

API_KEY = ${d.pyAuth}

resp = httpx.post(
    "${d.endpoint}",
    headers={"Authorization": f"Bearer {API_KEY}"},
    data={
        "model": "${d.model}",
        "input": "Hello, this is a voice cloning sample.",
    },
    files={"file": ("audio.mp3", open("audio.mp3", "rb"), "audio/mpeg")},
    timeout=180.0,
)
resp.raise_for_status()
Path("clone.wav").write_bytes(resp.content)
`,

  typescript: (d) => `
import { readFile, writeFile } from "node:fs/promises";

const apiKey = ${d.tsAuth};

const fileBytes = await readFile("audio.mp3");
const form = new FormData();
form.set("model", "${d.model}");
form.set("file", new Blob([fileBytes], { type: "audio/mpeg" }), "audio.mp3");
form.set("input", "Hello, this is a voice cloning sample.");

const resp = await fetch("${d.endpoint}", {
  method: "POST",
  headers: { Authorization: \`Bearer \${apiKey}\` },
  body: form,
});
if (!resp.ok) throw new Error(await resp.text());

await writeFile("clone.wav", Buffer.from(await resp.arrayBuffer()));
`,
};

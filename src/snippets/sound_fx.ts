import type { SnippetSet } from "./types.ts";

export const soundFX: SnippetSet = {
  curl: (d) => `
${d.curlPreamble}curl -X POST "${d.endpoint}" \\
  -H "Authorization: Bearer ${d.curlAuth}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${d.model}",
    "input": "a short click of a wooden door latch"
  }' \\
  --output sfx.wav
`,

  python: (d) => `
${d.pyImportOS ? "import os\n" : ""}from pathlib import Path

import httpx

API_KEY = ${d.pyAuth}

resp = httpx.post(
    "${d.endpoint}",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "${d.model}",
        "input": "a short click of a wooden door latch",
    },
    timeout=180.0,
)
resp.raise_for_status()
Path("sfx.wav").write_bytes(resp.content)
`,

  typescript: (d) => `
import { writeFile } from "node:fs/promises";

const apiKey = ${d.tsAuth};

const resp = await fetch("${d.endpoint}", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${apiKey}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${d.model}",
    input: "a short click of a wooden door latch",
  }),
});
if (!resp.ok) throw new Error(await resp.text());

await writeFile("sfx.wav", Buffer.from(await resp.arrayBuffer()));
`,
};

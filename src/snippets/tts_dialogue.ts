import type { SnippetSet } from "./types.ts";

export const ttsDialogue: SnippetSet = {
  curl: (d) => `
${d.curlPreamble}REF=$(base64 < audio.mp3 | tr -d '\\n')

curl -X POST "${d.endpoint}" \\
  -H "Authorization: Bearer ${d.curlAuth}" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"model\\": \\"${d.model}\\",
    \\"speakers\\": [
      {\\"ref_audio\\": \\"data:audio/mpeg;base64,$REF\\", \\"ref_text\\": \\"Hello everyone, welcome to today's show.\\"},
      {\\"ref_audio\\": \\"data:audio/mpeg;base64,$REF\\", \\"ref_text\\": \\"Thanks, today we are talking about artificial intelligence.\\"}
    ],
    \\"turns\\": [
      {\\"speaker\\": 0, \\"text\\": \\"Welcome to today's podcast.\\"},
      {\\"speaker\\": 1, \\"text\\": \\"Thanks for having me, I am glad to talk about this.\\"}
    ]
  }" \\
  --output dialogue.wav
`,

  python: (d) => `
import base64
${d.pyImportOS ? "import os\n" : ""}from pathlib import Path

import httpx

API_KEY = ${d.pyAuth}


def data_url(path: str) -> str:
    b64 = base64.b64encode(Path(path).read_bytes()).decode()
    return f"data:audio/mpeg;base64,{b64}"


resp = httpx.post(
    "${d.endpoint}",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "${d.model}",
        "speakers": [
            {"ref_audio": data_url("audio.mp3"), "ref_text": "Hello everyone, welcome to today's show."},
            {"ref_audio": data_url("audio.mp3"), "ref_text": "Thanks, today we are talking about artificial intelligence."},
        ],
        "turns": [
            {"speaker": 0, "text": "Welcome to today's podcast."},
            {"speaker": 1, "text": "Thanks for having me, I am glad to talk about this."},
        ],
    },
    timeout=300.0,
)
resp.raise_for_status()
Path("dialogue.wav").write_bytes(resp.content)
`,

  typescript: (d) => `
import { readFile, writeFile } from "node:fs/promises";

const apiKey = ${d.tsAuth};

function dataUrl(buf: Buffer): string {
  return \`data:audio/mpeg;base64,\${buf.toString("base64")}\`;
}

const audio = await readFile("audio.mp3");

const resp = await fetch("${d.endpoint}", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${apiKey}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${d.model}",
    speakers: [
      { ref_audio: dataUrl(audio), ref_text: "Hello everyone, welcome to today's show." },
      { ref_audio: dataUrl(audio), ref_text: "Thanks, today we are talking about artificial intelligence." },
    ],
    turns: [
      { speaker: 0, text: "Welcome to today's podcast." },
      { speaker: 1, text: "Thanks for having me, I am glad to talk about this." },
    ],
  }),
});
if (!resp.ok) throw new Error(await resp.text());

await writeFile("dialogue.wav", Buffer.from(await resp.arrayBuffer()));
`,
};

import type { SnippetSet } from "./types.ts";

export const stt: SnippetSet = {
  curl: (d) => `
${d.curlPreamble}curl -X POST "${d.endpoint}" \\
  -H "Authorization: Bearer ${d.curlAuth}" \\
  -F "model=${d.model}" \\
  -F "file=@audio.mp3"
`,

  python: (d) => `
${d.pyImportOS ? "import os\n\n" : ""}from openai import OpenAI

API_KEY = ${d.pyAuth}

client = OpenAI(
    base_url="${d.baseURL}",
    api_key=API_KEY,
)

with open("audio.mp3", "rb") as audio:
    response = client.audio.transcriptions.create(
        model="${d.model}",
        file=audio,
    )

print(response.text)
`,

  typescript: (d) => `
import { createReadStream } from "node:fs";
import OpenAI from "openai";

const apiKey = ${d.tsAuth};

const client = new OpenAI({
  baseURL: "${d.baseURL}",
  apiKey,
});

const response = await client.audio.transcriptions.create({
  model: "${d.model}",
  file: createReadStream("audio.mp3"),
});

console.log(response.text);
`,
};

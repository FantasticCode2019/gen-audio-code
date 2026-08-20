import type { SnippetSet } from "./types.ts";

export const tts: SnippetSet = {
  curl: (d) => `
${d.curlPreamble}curl -X POST "${d.endpoint}" \\
  -H "Authorization: Bearer ${d.curlAuth}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${d.model}",
    "input": "Hello, this is a speech synthesis sample.",
    "voice": "serena"
  }' \\
  --output speech.wav
`,

  python: (d) => `
${d.pyImportOS ? "import os\n\n" : ""}from openai import OpenAI

API_KEY = ${d.pyAuth}

client = OpenAI(
    base_url="${d.baseURL}",
    api_key=API_KEY,
)

with client.audio.speech.with_streaming_response.create(
    model="${d.model}",
    input="Hello, this is a speech synthesis sample.",
    voice="serena",
) as response:
    response.stream_to_file("speech.wav")
`,

  typescript: (d) => `
import { writeFile } from "node:fs/promises";
import OpenAI from "openai";

const apiKey = ${d.tsAuth};

const client = new OpenAI({
  baseURL: "${d.baseURL}",
  apiKey,
});

const response = await client.audio.speech.create({
  model: "${d.model}",
  input: "Hello, this is a speech synthesis sample.",
  voice: "serena",
});

await writeFile("speech.wav", Buffer.from(await response.arrayBuffer()));
`,
};

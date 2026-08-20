import type { SnippetSet } from "./types.ts";

// See stt.ts for why the keyless variants opt out of the header explicitly.
export const tts: SnippetSet = {
  curl: (d) => `
curl -X POST "${d.endpoint}" \\
${d.curlAuthHeader}  -H "Content-Type: application/json" \\
  -d '{
    "model": "${d.model}",
    "input": "Hello, this is a speech synthesis sample.",
    "voice": "serena"
  }' \\
  --output speech.wav
`,

  python: (d) => {
    const imports = d.hasKey ? "from openai import OpenAI" : "from openai import Omit, OpenAI";
    const keyArg = d.hasKey ? "api_key=API_KEY," : 'api_key="omitted",  # never sent';
    const omitHeader = d.hasKey ? "" : '    extra_headers={"Authorization": Omit()},\n';
    return `
${imports}

${d.pyAuthAssign}client = OpenAI(
    base_url="${d.baseURL}",
    ${keyArg}
)

with client.audio.speech.with_streaming_response.create(
    model="${d.model}",
    input="Hello, this is a speech synthesis sample.",
    voice="serena",
${omitHeader}) as response:
    response.stream_to_file("speech.wav")
`;
  },

  typescript: (d) => {
    const clientAuth = d.hasKey
      ? "  apiKey,\n"
      : '  apiKey: "omitted", // never sent\n  defaultHeaders: { Authorization: null },\n';
    return `
import { writeFile } from "node:fs/promises";
import OpenAI from "openai";

${d.tsAuthAssign}const client = new OpenAI({
  baseURL: "${d.baseURL}",
${clientAuth}});

const response = await client.audio.speech.create({
  model: "${d.model}",
  input: "Hello, this is a speech synthesis sample.",
  voice: "serena",
});

await writeFile("speech.wav", Buffer.from(await response.arrayBuffer()));
`;
  },
};

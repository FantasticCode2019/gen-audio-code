import type { SnippetSet } from "./types.ts";

// The OpenAI clients refuse to be built without a key and add an Authorization
// header of their own, so dropping the header takes an explicit opt-out rather
// than an empty value.
export const stt: SnippetSet = {
  curl: (d) => `
curl -X POST "${d.endpoint}" \\
${d.curlAuthHeader}  -F "model=${d.model}" \\
  -F "file=@audio.mp3"
`,

  python: (d) => {
    const imports = d.hasKey ? "from openai import OpenAI" : "from openai import Omit, OpenAI";
    const keyArg = d.hasKey ? "api_key=API_KEY," : 'api_key="omitted",  # never sent';
    const omitHeader = d.hasKey ? "" : '        extra_headers={"Authorization": Omit()},\n';
    return `
${imports}

${d.pyAuthAssign}client = OpenAI(
    base_url="${d.baseURL}",
    ${keyArg}
)

with open("audio.mp3", "rb") as audio:
    response = client.audio.transcriptions.create(
        model="${d.model}",
        file=audio,
${omitHeader}    )

print(response.text)
`;
  },

  typescript: (d) => {
    const clientAuth = d.hasKey
      ? "  apiKey,\n"
      : '  apiKey: "omitted", // never sent\n  defaultHeaders: { Authorization: null },\n';
    return `
import { createReadStream } from "node:fs";
import OpenAI from "openai";

${d.tsAuthAssign}const client = new OpenAI({
  baseURL: "${d.baseURL}",
${clientAuth}});

const response = await client.audio.transcriptions.create({
  model: "${d.model}",
  file: createReadStream("audio.mp3"),
});

console.log(response.text);
`;
  },
};

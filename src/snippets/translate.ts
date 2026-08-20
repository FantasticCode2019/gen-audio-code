import type { SnippetSet } from "./types.ts";

// "to" and "text" are required; "from" may be dropped to let the server detect
// the source language.
export const translate: SnippetSet = {
  curl: (d) => `
curl -X POST "${d.endpoint}" \\
${d.curlAuthHeader}  -H "Content-Type: application/json" \\
  -d '{
    "model": "${d.model}",
    "from": "en",
    "to": "zh-Hans",
    "text": "Hello World!"
  }'
`,

  python: (d) => `
import httpx

${d.pyAuthAssign}resp = httpx.post(
    "${d.endpoint}",
${d.pyAuthHeader}    json={
        "model": "${d.model}",
        "from": "en",
        "to": "zh-Hans",
        "text": "Hello World!",
    },
    timeout=180.0,
)
resp.raise_for_status()
print(resp.json()["result"])
`,

  typescript: (d) => `
${d.tsAuthAssign}const resp = await fetch("${d.endpoint}", {
  method: "POST",
  headers: {
${d.tsAuthHeaderEntry}    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${d.model}",
    from: "en",
    to: "zh-Hans",
    text: "Hello World!",
  }),
});
if (!resp.ok) throw new Error(await resp.text());

const { result } = await resp.json();
console.log(result);
`,
};

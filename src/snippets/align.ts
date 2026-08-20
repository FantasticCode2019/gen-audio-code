import type { SnippetSet } from "./types.ts";

export const align: SnippetSet = {
  curl: (d) => `
curl -X POST "${d.endpoint}" \\
${d.curlAuthHeader}  -F "model=${d.model}" \\
  -F "file=@audio.mp3" \\
  -F "text=The transcript to align with the audio."
`,

  python: (d) => `
import httpx

${d.pyAuthAssign}resp = httpx.post(
    "${d.endpoint}",
${d.pyAuthHeader}    data={
        "model": "${d.model}",
        "text": "The transcript to align with the audio.",
    },
    files={"file": ("audio.mp3", open("audio.mp3", "rb"), "audio/mpeg")},
    timeout=180.0,
)
resp.raise_for_status()
print(resp.json())
`,

  typescript: (d) => `
import { readFile } from "node:fs/promises";

${d.tsAuthAssign}const fileBytes = await readFile("audio.mp3");
const form = new FormData();
form.set("model", "${d.model}");
form.set("file", new Blob([fileBytes], { type: "audio/mpeg" }), "audio.mp3");
form.set("text", "The transcript to align with the audio.");

const resp = await fetch("${d.endpoint}", {
  method: "POST",
${d.tsAuthHeaders}  body: form,
});
if (!resp.ok) throw new Error(await resp.text());

console.log(await resp.json());
`,
};

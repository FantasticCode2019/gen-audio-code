import type { SnippetSet } from "./types.ts";

// Only "file" is required. The optional fields (format, pages, pdf_strategy)
// are left out so the snippet shows the smallest request that works.
export const ocr: SnippetSet = {
  curl: (d) => `
curl -X POST "${d.endpoint}" \\
${d.curlAuthHeader}  -F "model=${d.model}" \\
  -F "file=@document.png"
`,

  python: (d) => `
import httpx

${d.pyAuthAssign}resp = httpx.post(
    "${d.endpoint}",
${d.pyAuthHeader}    data={"model": "${d.model}"},
    files={"file": ("document.png", open("document.png", "rb"), "image/png")},
    timeout=180.0,
)
resp.raise_for_status()
# OCR is always asynchronous, so the body is a task handle rather than the text.
print(resp.json())
`,

  typescript: (d) => `
import { readFile } from "node:fs/promises";

${d.tsAuthAssign}const fileBytes = await readFile("document.png");
const form = new FormData();
form.set("model", "${d.model}");
form.set("file", new Blob([fileBytes], { type: "image/png" }), "document.png");

const resp = await fetch("${d.endpoint}", {
  method: "POST",
${d.tsAuthHeaders}  body: form,
});
if (!resp.ok) throw new Error(await resp.text());

// OCR is always asynchronous, so the body is a task handle rather than the text.
console.log(await resp.json());
`,
};

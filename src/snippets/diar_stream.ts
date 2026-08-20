import type { SnippetSet } from "./types.ts";

export const diarStream: SnippetSet = {
  curl: (d) => `
${d.curlPreamble}# Send 16 kHz s16le mono PCM frames over the socket, then {"type": "stop"}.
websocat -H="Authorization: Bearer ${d.curlAuth}" \\
  "${d.endpoint}?model=${d.model}"
`,

  python: (d) => `
import asyncio
import json
${d.pyImportOS ? "import os\n" : ""}
import websockets

API_KEY = ${d.pyAuth}
URL = "${d.endpoint}?model=${d.model}"


async def main() -> None:
    headers = {"Authorization": f"Bearer {API_KEY}"}
    async with websockets.connect(URL, additional_headers=headers) as ws:
        print(await ws.recv())  # {"type": "ready"}
        await ws.send(json.dumps({"type": "start", "sample_rate": 16000}))
        with open("speech.pcm", "rb") as f:
            while chunk := f.read(3200):  # 100 ms @ 16 kHz s16le mono
                await ws.send(chunk)
        await ws.send(json.dumps({"type": "stop"}))
        async for message in ws:
            print(message)


asyncio.run(main())
`,

  typescript: (d) => `
import { readFile } from "node:fs/promises";
import WebSocket from "ws";

const apiKey = ${d.tsAuth};

const ws = new WebSocket("${d.endpoint}?model=${d.model}", {
  headers: { Authorization: \`Bearer \${apiKey}\` },
});

ws.on("open", async () => {
  ws.send(JSON.stringify({ type: "start", sample_rate: 16000 }));
  const pcm = await readFile("speech.pcm");
  const frame = 3200; // 100 ms @ 16 kHz s16le mono
  for (let i = 0; i < pcm.length; i += frame) {
    ws.send(pcm.subarray(i, i + frame));
  }
  ws.send(JSON.stringify({ type: "stop" }));
});

ws.on("message", (data) => console.log(String(data)));
ws.on("error", (err) => console.error(err));
`,
};

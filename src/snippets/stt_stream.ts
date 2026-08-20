import type { SnippetSet } from "./types.ts";

export const sttStream: SnippetSet = {
  curl: (d) => `
# Protocol:
#   1. The server greets with {"type": "ready"}.
#   2. Send the start message: {"type": "start"}
#   3. Stream PCM binary frames: 16-bit little-endian, mono, 16 kHz.
#   4. Finish with {"type": "stop"} (done / finish are accepted too).
# The server replies with ready / error / closed events plus transcript messages.
websocat ${d.websocatAuthArg}"${d.endpoint}?model=${d.model}"
`,

  python: (d) => {
    const headersAssign = d.hasKey ? `    headers = {"Authorization": f"Bearer {API_KEY}"}\n` : "";
    const connectArgs = d.hasKey ? "URL, additional_headers=headers" : "URL";
    return `
import asyncio
import json

import websockets

${d.pyAuthAssign}URL = "${d.endpoint}?model=${d.model}"

SAMPLE_RATE = 16000  # the rate the server assumes when start omits it
# 16-bit little-endian mono is 2 bytes per sample, so this is a 100 ms frame.
FRAME_BYTES = SAMPLE_RATE * 2 // 10


async def main() -> None:
${headersAssign}    async with websockets.connect(${connectArgs}) as ws:
        ready = json.loads(await ws.recv())
        if ready.get("type") != "ready":
            raise RuntimeError(f"expected ready, got {ready}")

        await ws.send(json.dumps({"type": "start"}))

        with open("speech.pcm", "rb") as f:
            while chunk := f.read(FRAME_BYTES):
                await ws.send(chunk)

        await ws.send(json.dumps({"type": "stop"}))

        async for message in ws:
            event = json.loads(message)
            if event.get("type") == "error":
                raise RuntimeError(event)
            print(event)
            if event.get("type") == "closed":
                break


asyncio.run(main())
`;
  },

  typescript: (d) => {
    const options = d.hasKey ? `, {\n${d.tsAuthHeaders}}` : "";
    return `
import { readFile } from "node:fs/promises";
import WebSocket from "ws";

${d.tsAuthAssign}const SAMPLE_RATE = 16000; // the rate the server assumes when start omits it
// 16-bit little-endian mono is 2 bytes per sample, so this is a 100 ms frame.
const FRAME_BYTES = (SAMPLE_RATE * 2) / 10;

const ws = new WebSocket("${d.endpoint}?model=${d.model}"${options});

async function stream(): Promise<void> {
  ws.send(JSON.stringify({ type: "start" }));

  const pcm = await readFile("speech.pcm");
  for (let i = 0; i < pcm.length; i += FRAME_BYTES) {
    ws.send(pcm.subarray(i, i + FRAME_BYTES));
  }

  ws.send(JSON.stringify({ type: "stop" }));
}

ws.on("message", (data) => {
  const event = JSON.parse(String(data));
  if (event.type === "ready") {
    void stream();
    return;
  }
  if (event.type === "error") {
    console.error(event);
    ws.close();
    return;
  }
  console.log(event);
  if (event.type === "closed") ws.close();
});

ws.on("error", (err) => console.error(err));
`;
  },
};

# audiogen

Generates ready-to-run client snippets (**curl**, **Python**, **TypeScript**) for every
audio capability exposed by the Olares router, driven by a registry of models
transcribed from `audio.csv`.

## Layout

```
audiogen/                 library
  audiogen.go             types, URL/auth handling, per-capability generators
  registry.go             model -> capability catalogue
  templates.go            embedded template loading
  templates/*.tmpl        one file per capability, 3 languages each
  audiogen_test.go        unit tests
cmd/audiogen/main.go      CLI test harness
scripts/validate.sh       renders everything and syntax-checks it
```

## The API

Every capability has its own generator function. They all take the same
`Request` and return the snippet as a string:

```go
type Request struct {
    URL    string   // router base URL; a trailing "/v1" is added when missing
    Model  string   // e.g. "Olares/openai/whisper-large-v3"
    APIKey string   // optional
    Lang   Language // LangCurl | LangPython | LangTypeScript
}

func GenerateSTT(req Request) (string, error)
func GenerateSTTStream(req Request) (string, error)
func GenerateTTS(req Request) (string, error)
func GenerateTTSClone(req Request) (string, error)
func GenerateTTSDialogue(req Request) (string, error)
func GenerateAlign(req Request) (string, error)
func GenerateVAD(req Request) (string, error)
func GenerateDiar(req Request) (string, error)
func GenerateDiarStream(req Request) (string, error)
func GenerateSpeakerEmbed(req Request) (string, error)
func GenerateSoundFX(req Request) (string, error)
func GenerateEnhance(req Request) (string, error)
```

Plus three helpers that work off the registry:

```go
Generate(cap Capability, req Request) (string, error)   // dispatch by capability
GenerateAll(cap Capability, req Request)                // all three languages
GenerateForModel(name string, req Request)              // every capability a model supports
```

Example:

```go
code, err := audiogen.GenerateTTS(audiogen.Request{
    URL:   "https://router.yaotest004.olares.com",
    Model: "Olares/openbmb/VoxCPM2",
    Lang:  audiogen.LangPython,
})
```

### API key handling

`APIKey` is optional. When you supply one it is inlined into the snippet. When
you leave it empty the snippet reads `OLARES_API_KEY` from the environment
instead, so nothing secret ends up in generated files:

| | with `APIKey` | without `APIKey` |
|---|---|---|
| curl | `-H "Authorization: Bearer sk-..."` | `export OLARES_API_KEY=...` + `Bearer $OLARES_API_KEY` |
| Python | `API_KEY = "sk-..."` | `import os` + `API_KEY = os.environ["OLARES_API_KEY"]` |
| TypeScript | `const apiKey = "sk-...";` | `const apiKey = process.env.OLARES_API_KEY!;` |

### Capabilities and endpoints

| Capability | Endpoint | Transport |
|---|---|---|
| `stt` | `/v1/audio/transcriptions` | HTTP multipart |
| `stt_stream` | `/v1/audio/stream` | WebSocket |
| `tts` | `/v1/audio/speech` | HTTP JSON |
| `tts_clone` | `/v1/audio/speech/clone` | HTTP multipart |
| `tts_dialogue` | `/v1/audio/speech` | HTTP JSON |
| `align` | `/v1/audio/align` | HTTP multipart |
| `vad` | `/v1/audio/vad` | HTTP multipart |
| `diar` | `/v1/audio/diarization` | HTTP multipart |
| `diar_stream` | `/v1/audio/diarize/stream` | WebSocket |
| `speaker_embed` | `/v1/audio/embeddings` | HTTP multipart |
| `sound_fx` | `/v1/audio/speech` | HTTP JSON |
| `enhance` | `/v1/audio/enhance` | HTTP multipart |

## CLI

```bash
go run ./cmd/audiogen -h
```

| Flag | Meaning |
|---|---|
| `-url` | router base URL (default `https://router.yaotest004.olares.com`) |
| `-model` | model name |
| `-capability` | one capability; defaults to every capability the model supports |
| `-lang` | `curl`, `python`, `typescript`, or `all` (default `curl`) |
| `-api-key` | optional key to inline |
| `-out` | write snippets to a directory instead of stdout |
| `-list-models` | print the registry |
| `-list-capabilities` | print capabilities and their endpoints |
| `-all-models` | render everything (smoke test) |

## Manual test walkthrough

Run these in order and eyeball the output.

**1. See what exists.**

```bash
go run ./cmd/audiogen -list-capabilities
go run ./cmd/audiogen -list-models
```

Expect 12 capabilities and 26 models.

**2. Generate a single snippet.**

```bash
go run ./cmd/audiogen -model Olares/openai/whisper-large-v3 -lang curl
```

Check: the URL ends in `/v1/audio/transcriptions`, the model name matches, and
because no key was passed the snippet exports `OLARES_API_KEY` first.

**3. All three languages for one model.**

```bash
go run ./cmd/audiogen -model Olares/openbmb/VoxCPM2 -lang all
```

Check: VoxCPM2 declares `tts` and `tts_clone`, so you get 6 blocks. `tts` uses
the OpenAI SDK against `/audio/speech`; `tts_clone` posts multipart to
`/audio/speech/clone`.

**4. Inline a real key.**

```bash
go run ./cmd/audiogen -model openai/tts-1 -lang python -api-key sk-test-123
```

Check: `API_KEY = "sk-test-123"` and there is no `import os`.

**5. Point at a different router.**

```bash
go run ./cmd/audiogen -url http://localhost:8080 -model Olares/onnx-community/silero-vad -lang typescript
```

Check: the endpoint becomes `http://localhost:8080/v1/audio/vad`. Passing
`-url http://localhost:8080/v1` gives the same result.

**6. Streaming capabilities switch to WebSocket.**

```bash
go run ./cmd/audiogen -model Olares/nvidia/diar_streaming_sortformer_4spk-v2.1 -lang all
```

Check: the URL is `wss://...` (or `ws://` for an http router), not `https://`.

**7. Guard rails.**

```bash
go run ./cmd/audiogen -capability tts -model openai/whisper-1 -lang curl   # warns on stderr
go run ./cmd/audiogen -model nope/not-real                                  # errors
go run ./cmd/audiogen -model openai/tts-1 -lang rust                        # errors
```

**8. Dump everything to disk.**

```bash
go run ./cmd/audiogen -all-models -lang all -out ./generated
```

Produces 102 files under `generated/<model>/<capability>.<ext>`.

**9. Automated checks.**

```bash
go test ./...
./scripts/validate.sh
```

`validate.sh` renders all 102 snippets and syntax-checks them for real:
`py_compile` for Python, `bash -n` for shell, and `tsc --strict` against the
actual `openai` and `ws` packages for TypeScript. The TypeScript step is skipped
if `npx` is unavailable.

## Notes on the source data

A few things were normalised while transcribing `audio.csv`:

- **Auth header.** The three STT rows used `Authorization: <key>` without the
  `Bearer` prefix while every other row used `Bearer`. All snippets now use
  `Bearer`.
- **Sample text.** The CSV samples used Chinese strings; all generated content is
  English. A unit test enforces that no CJK characters appear in any snippet.
- **Missing import.** The CSV TypeScript STT sample called `createReadStream`
  without importing it. The generated version imports it from `node:fs`.
- **S2S dropped.** The CSV listed six OpenAI speech-to-speech models in a
  trailing S2S section. The router does not serve that capability, so neither the
  models nor an `s2s` generator are included here.

## The `stt_stream` protocol

`stt_stream` had no sample in the CSV and follows its own documented handshake,
so the generated snippets implement it explicitly:

1. Connect to `GET /v1/audio/stream`. The server greets with `{"type": "ready"}`.
2. Send `{"type": "start"}`. The snippets send nothing else, because every other
   start field is optional: `language`, `sample_rate` (defaults to `16000`) and
   `step_ms` (the inference step).
3. Stream PCM binary frames: 16-bit little-endian, mono, at the sample rate from
   step 2, so 16 kHz by default. The snippets send 100 ms frames.
4. Finish with `{"type": "stop"}`; `done` and `finish` are accepted too.

The server emits `ready`, `error` and `closed` events alongside the transcript
messages. The Python and TypeScript snippets wait for `ready` before sending
`start`, raise or log on `error`, and stop reading on `closed`.

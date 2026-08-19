# audiogen

Generates ready-to-run client snippets (**curl**, **Python**, **TypeScript**) for every
audio capability exposed by the Olares router, driven by a registry of models
transcribed from `audio.csv`.

Written in TypeScript and run directly by Node.js, which strips the types, so
working on it needs no build step and the library has no runtime dependency.
Node 22.6+ is required (24+ recommended, where running `.ts` files needs no
flag).

## Layout

```
src/                             library
  audiogen.ts                    Request, URL/auth handling, per-capability generators
  capability.ts                  capabilities and their endpoints
  language.ts                    output languages and their aliases
  registry.ts                    model -> capability catalogue
  template.ts                    template loading and rendering
  index.ts                       public API
  cli.ts                         CLI test harness
templates/*.tmpl                 one file per capability, 3 languages each
test/*.test.ts                   unit tests
scripts/validate.sh              renders everything and syntax-checks it
scripts/setup-python.sh          Python environment for running the snippets
scripts/setup-typescript-env.sh  Node/TypeScript environment for the same
```

Setup:

```bash
npm install     # typescript and @types/node, then builds dist/
```

`dist/` only matters when another project depends on this one as a package,
because Node strips types from your own files but never from anything inside
`node_modules`. Working in this repo uses `src/` directly.

## The API

Every capability has its own generator function. They all take the same
`Request` and return the snippet as a string; invalid input throws:

```ts
interface Request {
  URL: string;      // router base URL; a trailing "/v1" is added when missing
  Model?: string;   // e.g. "Olares/openai/whisper-large-v3"
  APIKey?: string;  // optional
  Lang?: Language;  // "curl" | "python" | "typescript", defaults to curl
}

function generateSTT(req: Request): string
function generateSTTStream(req: Request): string
function generateTTS(req: Request): string
function generateTTSClone(req: Request): string
function generateTTSDialogue(req: Request): string
function generateAlign(req: Request): string
function generateVAD(req: Request): string
function generateDiar(req: Request): string
function generateDiarStream(req: Request): string
function generateSpeakerEmbed(req: Request): string
function generateSoundFX(req: Request): string
function generateEnhance(req: Request): string
```

Plus the helpers that work off the registry:

```ts
generate(capability: Capability, req: Request): string              // dispatch by capability
generateAll(capability: Capability, req: Request)                   // all three languages
generateForModel(name: string, req: Request)                        // every capability a model supports
endpoint(capability: Capability, req: Request): string              // the URL that would be called
generatorFor(capability: Capability)                                // the function registered for a capability
lookupModel(name), supports(model, capability), modelsWithCapability(capability)
parseLanguage(s), parseCapability(s)
```

Example:

```ts
import { generateTTS, LangPython } from "./src/index.ts";

const code = generateTTS({
  URL: "https://router.yaotest004.olares.com",
  Model: "Olares/openbmb/VoxCPM2",
  Lang: LangPython,
});
```

Capabilities and languages are plain string unions, so `"tts"` and `CapTTS` are
interchangeable — the `Cap*` and `Lang*` constants exist for autocompletion.

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

### Templates

The snippets live in `templates/*.tmpl` rather than in TypeScript string
literals: they are full of backticks and `${...}`, which a template literal
would have to escape everywhere. Each file defines one template per language
using `<<` `>>` delimiters, because the generated code already contains plenty
of braces:

```
<<define "tts.python">>          a named template, looked up as "<capability>.<language>"
<<if .PyImportOS>> ... <<end>>   emitted only when the field is truthy
<<.Model>>                       interpolate a field
```

Those three actions are all the templates use, so `src/template.ts` implements
exactly that subset instead of depending on a template engine.

## CLI

```bash
node src/cli.ts -h          # or: npm run audiogen -- -h
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
node src/cli.ts -list-capabilities
node src/cli.ts -list-models
```

Expect 12 capabilities and 26 models.

**2. Generate a single snippet.**

```bash
node src/cli.ts -model Olares/openai/whisper-large-v3 -lang curl
```

Check: the URL ends in `/v1/audio/transcriptions`, the model name matches, and
because no key was passed the snippet exports `OLARES_API_KEY` first.

**3. All three languages for one model.**

```bash
node src/cli.ts -model Olares/openbmb/VoxCPM2 -lang all
```

Check: VoxCPM2 declares `tts` and `tts_clone`, so you get 6 blocks. `tts` uses
the OpenAI SDK against `/audio/speech`; `tts_clone` posts multipart to
`/audio/speech/clone`.

**4. Inline a real key.**

```bash
node src/cli.ts -model openai/tts-1 -lang python -api-key sk-test-123
```

Check: `API_KEY = "sk-test-123"` and there is no `import os`.

**5. Point at a different router.**

```bash
node src/cli.ts -url http://localhost:8080 -model Olares/onnx-community/silero-vad -lang typescript
```

Check: the endpoint becomes `http://localhost:8080/v1/audio/vad`. Passing
`-url http://localhost:8080/v1` gives the same result.

**6. Streaming capabilities switch to WebSocket.**

```bash
node src/cli.ts -model Olares/nvidia/diar_streaming_sortformer_4spk-v2.1 -lang all
```

Check: the URL is `wss://...` (or `ws://` for an http router), not `https://`.

**7. Guard rails.**

```bash
node src/cli.ts -capability tts -model openai/whisper-1 -lang curl   # warns on stderr
node src/cli.ts -model nope/not-real                                  # errors
node src/cli.ts -model openai/tts-1 -lang rust                        # errors
```

**8. Dump everything to disk.**

```bash
node src/cli.ts -all-models -lang all -out ./generated
```

Produces 102 files under `generated/<model>/<capability>.<ext>`.

**9. Automated checks.**

```bash
npm run check     # tsc, type-check only
npm test          # unit tests
npm run validate  # scripts/validate.sh
npm run build     # emit dist/ for package consumers
```

`validate.sh` renders all 102 snippets and syntax-checks them for real:
`py_compile` for Python, `bash -n` for shell, and `tsc --strict` against the
actual `openai` and `ws` packages for TypeScript. The TypeScript step is skipped
if `npx` is unavailable.

## Environments for running the snippets

Those checks are static. Actually executing a generated snippet needs an
interpreter plus the `openai`, `websockets` and `ws` packages, so two scripts
build such an environment from nothing:

| Script | Produces |
|---|---|
| `scripts/setup-python.sh [dir]` | CPython, a `.venv`, and `openai` + `websockets` (default dir `python-playground`) |
| `scripts/setup-typescript-env.sh [dir]` | Node.js 18+ and `typescript`, `@types/node`, `ws`, `@types/ws` (default dir `ts-playground`) |

Neither file has the executable bit set, so invoke them through `bash`. Both
refuse to run as root, create the target directory when it is missing, and
finish by running a sample that imports every dependency. `py_test/` and
`ts_test/` are gitignored, which makes them convenient targets.

### Python

```bash
bash scripts/setup-python.sh py_test
```

Unless a matching interpreter is already on `PATH`, this installs the latest
stable CPython — the version comes from the python.org download page — via
Homebrew on macOS, or otherwise a source build installed with `make altinstall`
into `~/.local/cpython-<version>`, which leaves the system `python3` untouched.
It then creates `py_test/.venv`, installs the two packages into it, and writes
`requirements.bootstrap.txt` and a `main.py` that reports the resolved versions.
Only the system dependencies and a source build ask for `sudo`; packages always
go into the venv.

| Variable | Effect |
|---|---|
| `PYTHON_VERSION=3.14.7` | pin the version instead of querying python.org |
| `PYTHON_EXECUTABLE=/usr/local/bin/python3` | use an existing interpreter and skip installing CPython |
| `RECREATE_VENV=1` | delete and rebuild an existing `.venv` |
| `FORCE_SAMPLE=1` | overwrite an existing `main.py` |

Then:

```bash
cd py_test
source .venv/bin/activate
python main.py
```

### TypeScript

```bash
bash scripts/setup-typescript-env.sh ts_test
```

Node.js 18+ is required; the script installs Node and npm through the system
package manager (or Homebrew) when they are missing. It then runs `npm init`,
adds the four dev dependencies, writes a strict `tsconfig.json` and a
`src/index.ts` sample, and defines the npm scripts `check`, `build`, `start` and
`test:run`.

| Variable | Effect |
|---|---|
| `FORCE_CONFIG=1` | overwrite an existing `tsconfig.json` and `src/index.ts` |
| `FORCE_NODE_INSTALL=1` | reinstall Node.js/npm even if they are already present |
| `NPM_USE_SUDO=1` | install the local dependencies as root |

Local dependencies land in the project's own `node_modules/` and need no
elevation; `sudo npm install` only leaves root-owned files behind.
`NPM_USE_SUDO=1` exists for environments whose policy mandates it, and the
script chowns `node_modules/` and `package-lock.json` back to the current user
afterwards.

Then:

```bash
cd ts_test
npm run test:run
```

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

## Porting notes

This project was a Go library and CLI before; the TypeScript version keeps the
same behaviour and the same generated output byte for byte. Only the shapes that
have no TypeScript equivalent changed:

| Go | TypeScript |
|---|---|
| `GenerateSTT(req)` | `generateSTT(req)` — functions are camelCase, `Request` fields keep their names |
| `(string, error)` returns | the value is returned, failures throw |
| `req.Endpoint(cap)` | `endpoint(cap, req)` |
| `m.Supports(cap)` | `supports(m, cap)` |
| `LookupModel(name) (Model, bool)` | `lookupModel(name): Model \| undefined` |
| `text/template` with `<< >>` | the same templates, rendered by `src/template.ts` |

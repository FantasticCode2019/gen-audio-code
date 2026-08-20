#!/usr/bin/env node
// audiogen renders client snippets for the Olares audio capabilities. It is the
// manual test harness: pick a model, a capability and a language, and inspect
// the code it prints.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { endpoint, generate, type Request } from "./audiogen.ts";
import { Capabilities, parseCapability, type Capability } from "./capability.ts";
import { Languages, parseLanguage, type Language } from "./language.ts";
import { Models, lookupModel, supports } from "./registry.ts";

const defaultURL = "https://router.yaotest004.olares.com";

interface Options {
  url: string;
  model: string;
  capability: string;
  lang: string;
  apiKey: string;
  outDir: string;

  listModels: boolean;
  listCaps: boolean;
  allModels: boolean;
}

/** UsageError is an error the CLI answers with the usage text. */
class UsageError extends Error {}

const usage = `audiogen renders curl/python/typescript snippets for Olares audio models.

Usage:
  -all-models
    \trender every model and every capability (smoke test)
  -api-key string
    \toptional API key; when omitted snippets send no Authorization header,
    \twhich only works from inside Olares
  -capability string
    \tcapability to render; defaults to every capability the model supports
  -lang string
    \toutput language: curl, python, typescript, or all (default "curl")
  -list-capabilities
    \tlist every capability and its endpoint
  -list-models
    \tlist every model in the registry with its capabilities
  -model string
    \tmodel name, e.g. Olares/openai/whisper-large-v3
  -out string
    \toptional directory to write snippets into instead of stdout
  -url string
    \trouter base URL (a trailing /v1 is added when missing) (default "${defaultURL}")

Examples:
  audiogen -list-models
  audiogen -model Olares/openai/whisper-large-v3 -lang python
  audiogen -model Olares/openbmb/VoxCPM2 -lang all
  audiogen -capability tts -model openai/tts-1 -lang curl -api-key sk-xxx
  audiogen -all-models -lang all -out ./generated
`;

function parseBool(name: string, value: string | undefined): boolean {
  if (value === undefined || value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new UsageError(`invalid boolean value ${JSON.stringify(value)} for -${name}`);
}

/** parseArgs mirrors the Go flag package: -name value, -name=value and --name. */
function parseArgs(argv: string[]): Options | undefined {
  const o: Options = {
    url: defaultURL,
    model: "",
    capability: "",
    lang: "curl",
    apiKey: "",
    outDir: "",
    listModels: false,
    listCaps: false,
    allModels: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("-") || arg === "-") {
      throw new UsageError(`unexpected argument ${JSON.stringify(arg)}`);
    }
    let name = arg.replace(/^--?/, "");
    let inline: string | undefined;
    const eq = name.indexOf("=");
    if (eq !== -1) {
      inline = name.slice(eq + 1);
      name = name.slice(0, eq);
    }
    const value = (): string => {
      if (inline !== undefined) return inline;
      const next = argv[++i];
      if (next === undefined) throw new UsageError(`flag needs an argument: -${name}`);
      return next;
    };

    switch (name) {
      case "url": o.url = value(); break;
      case "model": o.model = value(); break;
      case "capability": o.capability = value(); break;
      case "lang": o.lang = value(); break;
      case "api-key": o.apiKey = value(); break;
      case "out": o.outDir = value(); break;
      case "list-models": o.listModels = parseBool(name, inline); break;
      case "list-capabilities": o.listCaps = parseBool(name, inline); break;
      case "all-models": o.allModels = parseBool(name, inline); break;
      case "h":
      case "help":
        process.stdout.write(usage);
        return undefined;
      default:
        throw new UsageError(`flag provided but not defined: -${name}`);
    }
  }
  return o;
}

function listCapabilities(o: Options): void {
  const req: Request = { URL: o.url, Model: "MODEL" };
  console.log(`${"CAPABILITY".padEnd(15)} ENDPOINT`);
  for (const capability of Capabilities) {
    console.log(`${capability.padEnd(15)} ${endpoint(capability, req)}`);
  }
}

function listModels(): void {
  console.log(`${"CATEGORY".padEnd(14)} ${"MODEL".padEnd(48)} CAPABILITIES`);
  for (const m of Models) {
    console.log(`${m.Category.padEnd(14)} ${m.Name.padEnd(48)} ${m.Capabilities.join(", ")}`);
  }
}

/** resolveLangs turns the -lang flag into the list of languages to render. */
function resolveLangs(s: string): Language[] {
  if (s.trim().toLowerCase() === "all") return Languages;
  return [parseLanguage(s)];
}

/** resolveCaps decides which capabilities to render for the requested model. */
function resolveCaps(o: Options): Capability[] {
  if (o.capability !== "") {
    const capability = parseCapability(o.capability);
    const m = lookupModel(o.model);
    if (m && !supports(m, capability)) {
      console.error(`warning: ${m.Name} does not declare capability ${capability}, rendering anyway`);
    }
    return [capability];
  }
  if (o.model === "") throw new Error("provide -model, -capability, or both");
  const m = lookupModel(o.model);
  if (!m) {
    throw new Error(`model ${JSON.stringify(o.model)} is not in the registry; pass -capability explicitly`);
  }
  return m.Capabilities;
}

async function renderOne(o: Options): Promise<void> {
  if (o.model === "") throw new Error("-model is required");
  await emit(o, o.model, resolveCaps(o), resolveLangs(o.lang));
}

async function renderAllModels(o: Options): Promise<void> {
  const langs = resolveLangs(o.lang);
  for (const m of Models) {
    await emit(o, m.Name, m.Capabilities, langs);
  }
}

const fileExt: Record<Language, string> = {
  curl: "sh",
  python: "py",
  typescript: "ts",
};

async function emit(o: Options, model: string, caps: Capability[], langs: Language[]): Promise<void> {
  for (const capability of caps) {
    for (const lang of langs) {
      const code = generate(capability, { URL: o.url, Model: model, APIKey: o.apiKey, Lang: lang });
      if (o.outDir === "") {
        console.log(`=== ${model} | ${capability} | ${lang} ===\n${code}`);
        continue;
      }
      const dir = join(o.outDir, sanitize(model));
      await mkdir(dir, { recursive: true });
      const path = join(dir, `${capability}.${fileExt[lang]}`);
      await writeFile(path, code);
      console.log("wrote", path);
    }
  }
}

/** sanitize turns a model name into a single safe path segment. */
function sanitize(model: string): string {
  return model.replaceAll("/", "_").replaceAll(" ", "_");
}

async function run(argv: string[]): Promise<void> {
  const o = parseArgs(argv);
  if (!o) return; // -h printed the usage text

  if (o.listCaps) return listCapabilities(o);
  if (o.listModels) return listModels();
  if (o.allModels) return renderAllModels(o);

  if (o.model === "" && o.capability === "") {
    throw new UsageError("nothing to do: provide -model and/or -capability");
  }
  return renderOne(o);
}

try {
  await run(process.argv.slice(2));
} catch (err) {
  if (err instanceof UsageError) process.stderr.write(usage);
  console.error("error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}

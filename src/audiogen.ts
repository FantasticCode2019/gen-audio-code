// Generates ready-to-run client snippets (curl, Python, TypeScript) for every
// capability exposed by the Olares router.
import { type Capability, endpointSpec } from "./capability.ts";
import { LangCurl, LangPython, LangTypeScript, Languages, type Language } from "./language.ts";
import { CapAlign, CapDiar, CapDiarStream, CapEnhance, CapOCR, CapSTT, CapSTTStream, CapSoundFX, CapSpeakerEmbed, CapTTS, CapTTSClone, CapTTSDialogue, CapTranslate, CapVAD } from "./capability.ts";
import { lookupModel } from "./registry.ts";
import { renderSnippet } from "./snippets/index.ts";
import type { SnippetData } from "./snippets/types.ts";

/**
 * Request is the input to every generator: where to call, which model to use,
 * an optional API key, and which language to emit.
 */
export interface Request {
  /** URL is the router base URL, with or without a trailing "/v1". */
  URL: string;
  /** Model is the fully qualified model name, e.g. "Olares/openai/whisper-large-v3". */
  Model?: string;
  /**
   * APIKey is optional. When empty the snippet sends no Authorization header
   * at all, which is how callers inside Olares reach the router: the gateway
   * identifies the app with x-caller-appid instead. Such a snippet is rejected
   * from outside the cluster.
   */
  APIKey?: string;
  /** Lang selects the output language, and defaults to curl. */
  Lang?: Language;
}

/** CapabilitySnippet pairs a rendered snippet with the capability it exercises. */
export interface CapabilitySnippet {
  Capability: Capability;
  Language: Language;
  Code: string;
}

function normalizeBaseURL(raw: string): string {
  let s = raw.trim();
  if (s === "") throw new Error("url is required");
  if (!s.includes("://")) s = "https://" + s;

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`invalid url ${JSON.stringify(raw)}`);
  }
  switch (u.protocol) {
    case "http:":
    case "https:":
      break;
    case "ws:":
      u.protocol = "http:";
      break;
    case "wss:":
      u.protocol = "https:";
      break;
    default:
      throw new Error(`unsupported url scheme ${JSON.stringify(u.protocol.replace(/:$/, ""))}`);
  }
  if (u.host === "") throw new Error(`invalid url ${JSON.stringify(raw)}: missing host`);
  u.search = "";
  u.hash = "";

  const path = u.pathname.replace(/\/+$/, "");
  u.pathname = path.endsWith("/v1") ? path : path + "/v1";
  return u.href;
}

function toWebSocket(httpURL: string): string {
  if (httpURL.startsWith("https://")) return "wss://" + httpURL.slice("https://".length);
  return "ws://" + httpURL.slice("http://".length);
}

/** AuthFragments is the auth half of SnippetData: whole lines, or nothing. */
type AuthFragments = Pick<
  SnippetData,
  | "hasKey"
  | "curlAuthHeader"
  | "websocatAuthArg"
  | "pyAuthAssign"
  | "pyAuthHeader"
  | "tsAuthAssign"
  | "tsAuthHeaders"
  | "tsAuthHeaderEntry"
>;

const noAuth: AuthFragments = {
  hasKey: false,
  curlAuthHeader: "",
  websocatAuthArg: "",
  pyAuthAssign: "",
  pyAuthHeader: "",
  tsAuthAssign: "",
  tsAuthHeaders: "",
  tsAuthHeaderEntry: "",
};

function authFragments(key: string): AuthFragments {
  if (key === "") return noAuth;
  return {
    hasKey: true,
    curlAuthHeader: `  -H "Authorization: Bearer ${key}" \\\n`,
    websocatAuthArg: `-H="Authorization: Bearer ${key}" \\\n  `,
    pyAuthAssign: `API_KEY = ${pyQuote(key)}\n\n`,
    pyAuthHeader: `    headers={"Authorization": f"Bearer {API_KEY}"},\n`,
    tsAuthAssign: `const apiKey = ${tsQuote(key)};\n\n`,
    tsAuthHeaders: "  headers: { Authorization: `Bearer ${apiKey}` },\n",
    tsAuthHeaderEntry: "    Authorization: `Bearer ${apiKey}`,\n",
  };
}

function buildSnippetData(capability: Capability, req: Request): SnippetData {
  const spec = endpointSpec(capability);
  if (!spec) throw new Error(`no endpoint registered for capability ${JSON.stringify(capability)}`);
  const base = normalizeBaseURL(req.URL);
  const model = (req.Model ?? "").trim();
  if (model === "") throw new Error("model is required");

  const full = spec.webSocket ? toWebSocket(base + spec.path) : base + spec.path;

  return {
    model,
    baseURL: base,
    endpoint: full,
    ...authFragments((req.APIKey ?? "").trim()),
  };
}

/**
 * endpoint returns the absolute URL a request would call for the given
 * capability, which is useful for tests and for showing the target in a UI.
 */
export function endpoint(capability: Capability, req: Request): string {
  return buildSnippetData(capability, req).endpoint;
}

/**
 * generate renders the snippet for one capability. The per-capability wrappers
 * below (generateSTT, generateTTS, ...) all funnel through here.
 */
export function generate(capability: Capability, req: Request): string {
  if (!endpointSpec(capability)) {
    throw new Error(`unknown capability ${JSON.stringify(capability)}`);
  }
  const lang = req.Lang ?? LangCurl;
  if (lang !== LangCurl && lang !== LangPython && lang !== LangTypeScript) {
    throw new Error(`unknown language ${JSON.stringify(req.Lang)}`);
  }
  let data: SnippetData;
  try {
    data = buildSnippetData(capability, req);
  } catch (err) {
    throw new Error(`${capability}/${lang}: ${errorMessage(err)}`);
  }
  return renderSnippet(capability, lang, data);
}

/** generateAll renders every language for one capability, keyed by language. */
export function generateAll(capability: Capability, req: Request): Record<Language, string> {
  const out = {} as Record<Language, string>;
  for (const lang of Languages) {
    out[lang] = generate(capability, { ...req, Lang: lang });
  }
  return out;
}

/**
 * generateForModel renders snippets for every capability the named model
 * declares in the registry, in registry order.
 */
export function generateForModel(name: string, req: Request): CapabilitySnippet[] {
  const model = lookupModel(name);
  if (!model) throw new Error(`model ${JSON.stringify(name)} is not in the registry`);
  const filled: Request = (req.Model ?? "").trim() === "" ? { ...req, Model: model.Name } : req;
  return model.Capabilities.map((capability) => ({
    Capability: capability,
    Language: filled.Lang ?? LangCurl,
    Code: generate(capability, filled),
  }));
}

// --- Per-capability generators -------------------------------------------
//
// One function per capability, as a stable API for callers that already know
// which ability they want to document.

/** generateSTT emits a one-shot speech-to-text transcription call. */
export function generateSTT(req: Request): string { return generate(CapSTT, req); }

/** generateSTTStream emits a streaming speech-to-text WebSocket session. */
export function generateSTTStream(req: Request): string { return generate(CapSTTStream, req); }

/** generateTTS emits a text-to-speech call that writes an audio file. */
export function generateTTS(req: Request): string { return generate(CapTTS, req); }

/** generateTTSClone emits a voice-cloning call driven by a reference sample. */
export function generateTTSClone(req: Request): string { return generate(CapTTSClone, req); }

/** generateTTSDialogue emits a multi-speaker dialogue synthesis call. */
export function generateTTSDialogue(req: Request): string { return generate(CapTTSDialogue, req); }

/** generateAlign emits a forced-alignment call between audio and a transcript. */
export function generateAlign(req: Request): string { return generate(CapAlign, req); }

/** generateVAD emits a voice-activity-detection call. */
export function generateVAD(req: Request): string { return generate(CapVAD, req); }

/** generateDiar emits a one-shot speaker-diarization call. */
export function generateDiar(req: Request): string { return generate(CapDiar, req); }

/** generateDiarStream emits a streaming speaker-diarization WebSocket session. */
export function generateDiarStream(req: Request): string { return generate(CapDiarStream, req); }

/** generateSpeakerEmbed emits a speaker-embedding extraction call. */
export function generateSpeakerEmbed(req: Request): string { return generate(CapSpeakerEmbed, req); }

/** generateSoundFX emits a sound-effect generation call. */
export function generateSoundFX(req: Request): string { return generate(CapSoundFX, req); }

/** generateEnhance emits a speech-enhancement call that writes cleaned audio. */
export function generateEnhance(req: Request): string { return generate(CapEnhance, req); }

/** generateOCR emits an OCR submission that uploads an image or a PDF. */
export function generateOCR(req: Request): string { return generate(CapOCR, req); }

/** generateTranslate emits a text translation call between two languages. */
export function generateTranslate(req: Request): string { return generate(CapTranslate, req); }

/**
 * Generators indexes the per-capability functions so callers can dispatch on a
 * capability value without a switch.
 */
export const Generators: ReadonlyMap<Capability, (req: Request) => string> = new Map<Capability, (req: Request) => string>([
  [CapSTT, generateSTT],
  [CapSTTStream, generateSTTStream],
  [CapTTS, generateTTS],
  [CapTTSClone, generateTTSClone],
  [CapTTSDialogue, generateTTSDialogue],
  [CapAlign, generateAlign],
  [CapVAD, generateVAD],
  [CapDiar, generateDiar],
  [CapDiarStream, generateDiarStream],
  [CapSpeakerEmbed, generateSpeakerEmbed],
  [CapSoundFX, generateSoundFX],
  [CapEnhance, generateEnhance],
  [CapOCR, generateOCR],
  [CapTranslate, generateTranslate],
]);

/** generatorFor returns the generator function registered for a capability. */
export function generatorFor(capability: Capability): ((req: Request) => string) | undefined {
  return Generators.get(capability);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function pyQuote(s: string): string {
  return `"${s.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function tsQuote(s: string): string {
  return pyQuote(s);
}

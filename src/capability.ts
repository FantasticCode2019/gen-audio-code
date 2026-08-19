// Capabilities and the endpoints that serve them.

/** Capability is a single audio ability a model can serve. */
export type Capability =
  | "stt"
  | "stt_stream"
  | "tts"
  | "tts_clone"
  | "tts_dialogue"
  | "align"
  | "vad"
  | "diar"
  | "diar_stream"
  | "speaker_embed"
  | "sound_fx"
  | "enhance";

export const CapSTT = "stt" as const;
export const CapSTTStream = "stt_stream" as const;
export const CapTTS = "tts" as const;
export const CapTTSClone = "tts_clone" as const;
export const CapTTSDialogue = "tts_dialogue" as const;
export const CapAlign = "align" as const;
export const CapVAD = "vad" as const;
export const CapDiar = "diar" as const;
export const CapDiarStream = "diar_stream" as const;
export const CapSpeakerEmbed = "speaker_embed" as const;
export const CapSoundFX = "sound_fx" as const;
export const CapEnhance = "enhance" as const;

/** Capabilities lists every capability a generator exists for, in a stable order. */
export const Capabilities: Capability[] = [
  CapSTT, CapSTTStream,
  CapTTS, CapTTSClone, CapTTSDialogue,
  CapAlign, CapVAD,
  CapDiar, CapDiarStream,
  CapSpeakerEmbed, CapSoundFX, CapEnhance,
];

/** parseCapability resolves a user-supplied capability name. */
export function parseCapability(s: string): Capability {
  const wanted = s.trim().toLowerCase();
  const found = Capabilities.find((c) => c === wanted);
  if (!found) throw new Error(`unknown capability ${JSON.stringify(s)} (see -list-capabilities)`);
  return found;
}

/**
 * EndpointSpec is a capability's path below the API base, plus whether the
 * capability talks over WebSocket instead of HTTP.
 */
export interface EndpointSpec {
  path: string;
  webSocket: boolean;
}

const endpoints = new Map<Capability, EndpointSpec>([
  [CapSTT, { path: "/audio/transcriptions", webSocket: false }],
  [CapSTTStream, { path: "/audio/stream", webSocket: true }],
  [CapTTS, { path: "/audio/speech", webSocket: false }],
  [CapTTSClone, { path: "/audio/speech/clone", webSocket: false }],
  [CapTTSDialogue, { path: "/audio/speech", webSocket: false }],
  [CapAlign, { path: "/audio/align", webSocket: false }],
  [CapVAD, { path: "/audio/vad", webSocket: false }],
  [CapDiar, { path: "/audio/diarization", webSocket: false }],
  [CapDiarStream, { path: "/audio/diarize/stream", webSocket: true }],
  [CapSpeakerEmbed, { path: "/audio/embeddings", webSocket: false }],
  [CapSoundFX, { path: "/audio/speech", webSocket: false }],
  [CapEnhance, { path: "/audio/enhance", webSocket: false }],
]);

/** endpointSpec returns the endpoint registered for a capability, if any. */
export function endpointSpec(capability: Capability): EndpointSpec | undefined {
  return endpoints.get(capability);
}

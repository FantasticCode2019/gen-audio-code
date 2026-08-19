// The model catalogue, transcribed from audio.csv.
import type { Capability } from "./capability.ts";
import { CapAlign, CapDiar, CapDiarStream, CapEnhance, CapSTT, CapSTTStream, CapSoundFX, CapSpeakerEmbed, CapTTS, CapTTSClone, CapTTSDialogue, CapVAD } from "./capability.ts";

/** Provider distinguishes models served by Olares from upstream OpenAI models. */
export type Provider = "olares" | "openai";

export const ProviderOlares: Provider = "olares";
export const ProviderOpenAI: Provider = "openai";

/** Model is a registry entry describing which capabilities a model can serve. */
export interface Model {
  Name: string;
  Category: string;
  Provider: Provider;
  /** Capabilities are the abilities this model exposes, in canonical order. */
  Capabilities: Capability[];
}

/** Models is the catalogue transcribed from audio.csv. */
export const Models: Model[] = [
  // --- Olares models ---
  { Name: "Olares/Qwen/Qwen3-ASR-1.7B", Category: "STT", Provider: ProviderOlares,
    Capabilities: [CapSTT, CapSTTStream] },
  { Name: "Olares/openai/whisper-large-v3", Category: "STT", Provider: ProviderOlares,
    Capabilities: [CapSTT] },
  { Name: "Olares/Systran/faster-whisper-large-v3", Category: "STT", Provider: ProviderOlares,
    Capabilities: [CapSTT] },
  { Name: "Olares/mistralai/Voxtral-Mini-4B-Realtime-2602", Category: "STT", Provider: ProviderOlares,
    Capabilities: [CapSTT, CapSTTStream] },
  { Name: "Olares/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", Category: "TTS", Provider: ProviderOlares,
    Capabilities: [CapTTS] },
  { Name: "Olares/Qwen/Qwen3-TTS-12Hz-1.7B-Base", Category: "TTS", Provider: ProviderOlares,
    Capabilities: [CapTTSClone] },
  { Name: "Olares/Soul-AILab/SoulX-Podcast-1.7B", Category: "TTS", Provider: ProviderOlares,
    Capabilities: [CapTTSDialogue] },
  { Name: "Olares/openbmb/VoxCPM2", Category: "TTS", Provider: ProviderOlares,
    Capabilities: [CapTTS, CapTTSClone] },
  { Name: "Olares/OpenMOSS-Team/MOSS-TTS-Nano", Category: "TTS", Provider: ProviderOlares,
    Capabilities: [CapTTS, CapTTSClone] },
  { Name: "Olares/Qwen/Qwen3-ForcedAligner-0.6B", Category: "ALIGN", Provider: ProviderOlares,
    Capabilities: [CapAlign] },
  { Name: "Olares/onnx-community/silero-vad", Category: "VAD", Provider: ProviderOlares,
    Capabilities: [CapVAD] },
  { Name: "Olares/pyannote/speaker-diarization-community-1", Category: "DIAR", Provider: ProviderOlares,
    Capabilities: [CapDiar] },
  { Name: "Olares/nvidia/diar_streaming_sortformer_4spk-v2.1", Category: "DIAR", Provider: ProviderOlares,
    Capabilities: [CapDiarStream] },
  { Name: "Olares/pyannote/embedding", Category: "SPEAKER EMBED", Provider: ProviderOlares,
    Capabilities: [CapSpeakerEmbed] },
  { Name: "Olares/mispeech/Dasheng-AudioGen", Category: "SOUND FX", Provider: ProviderOlares,
    Capabilities: [CapSoundFX] },
  { Name: "Olares/speechbrain/mtl-mimic-voicebank", Category: "ENHANCE", Provider: ProviderOlares,
    Capabilities: [CapEnhance] },

  // --- OpenAI models ---
  { Name: "openai/gpt-4o-mini-transcribe", Category: "STT", Provider: ProviderOpenAI,
    Capabilities: [CapSTT, CapSTTStream] },
  { Name: "openai/gpt-live-transcribe", Category: "STT", Provider: ProviderOpenAI,
    Capabilities: [CapSTTStream] },
  { Name: "openai/gpt-realtime-whisper", Category: "STT", Provider: ProviderOpenAI,
    Capabilities: [CapSTTStream] },
  { Name: "openai/gpt-transcribe", Category: "STT", Provider: ProviderOpenAI,
    Capabilities: [CapSTT, CapSTTStream] },
  { Name: "openai/gpt-4o-transcribe", Category: "STT", Provider: ProviderOpenAI,
    Capabilities: [CapSTT, CapSTTStream] },
  { Name: "openai/whisper-1", Category: "STT", Provider: ProviderOpenAI,
    Capabilities: [CapSTT] },
  { Name: "openai/gpt-4o-mini-tts", Category: "TTS", Provider: ProviderOpenAI,
    Capabilities: [CapTTS] },
  { Name: "openai/tts-1", Category: "TTS", Provider: ProviderOpenAI,
    Capabilities: [CapTTS] },
  { Name: "openai/tts-1-hd", Category: "TTS", Provider: ProviderOpenAI,
    Capabilities: [CapTTS] },
  { Name: "openai/gpt-4o-transcribe-diarize", Category: "DIAR", Provider: ProviderOpenAI,
    Capabilities: [CapSTT, CapDiar] },
];

/**
 * lookupModel finds a registry entry by exact name, then by case-insensitive
 * match, so the CLI is forgiving about capitalisation.
 */
export function lookupModel(name: string): Model | undefined {
  const wanted = name.trim();
  return (
    Models.find((m) => m.Name === wanted) ??
    Models.find((m) => m.Name.toLowerCase() === wanted.toLowerCase())
  );
}

/** supports reports whether the model declares the given capability. */
export function supports(model: Model, capability: Capability): boolean {
  return model.Capabilities.includes(capability);
}

/** modelsWithCapability returns every model that declares the capability. */
export function modelsWithCapability(capability: Capability): Model[] {
  return Models.filter((m) => supports(m, capability));
}

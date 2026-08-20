// One snippet set per capability. The Record below is exhaustive by type, so a
// new capability cannot be added without also adding its three snippets.
import type { Capability } from "../capability.ts";
import type { Language } from "../language.ts";
import type { SnippetData, SnippetSet } from "./types.ts";
import { align } from "./align.ts";
import { diar } from "./diar.ts";
import { diarStream } from "./diar_stream.ts";
import { enhance } from "./enhance.ts";
import { soundFX } from "./sound_fx.ts";
import { speakerEmbed } from "./speaker_embed.ts";
import { stt } from "./stt.ts";
import { sttStream } from "./stt_stream.ts";
import { tts } from "./tts.ts";
import { ttsClone } from "./tts_clone.ts";
import { ttsDialogue } from "./tts_dialogue.ts";
import { vad } from "./vad.ts";

export const snippets: Record<Capability, SnippetSet> = {
  stt,
  stt_stream: sttStream,
  tts,
  tts_clone: ttsClone,
  tts_dialogue: ttsDialogue,
  align,
  vad,
  diar,
  diar_stream: diarStream,
  speaker_embed: speakerEmbed,
  sound_fx: soundFX,
  enhance,
};

/**
 * renderSnippet renders one capability in one language. Snippet bodies start on
 * the line after their opening backtick, so the result is trimmed down to
 * exactly one trailing newline and no leading blank line.
 */
export function renderSnippet(capability: Capability, lang: Language, data: SnippetData): string {
  const set = snippets[capability];
  if (!set) throw new Error(`no snippets for capability ${JSON.stringify(capability)}`);
  const renderer = set[lang];
  if (!renderer) throw new Error(`no ${lang} snippet for capability ${JSON.stringify(capability)}`);
  return renderer(data).replace(/^\n+/, "").replace(/\n+$/, "") + "\n";
}

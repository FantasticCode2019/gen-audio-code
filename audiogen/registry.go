package audiogen

import "strings"

// Provider distinguishes models served by Olares from upstream OpenAI models.
type Provider string

const (
	ProviderOlares Provider = "olares"
	ProviderOpenAI Provider = "openai"
)

// Model is a registry entry describing which capabilities a model can serve.
type Model struct {
	Name     string
	Category string
	Provider Provider
	// Capabilities are the abilities this model exposes, in canonical order.
	Capabilities []Capability
}

// Models is the catalogue transcribed from audio.csv.
var Models = []Model{
	// --- Olares models ---
	{Name: "Olares/Qwen/Qwen3-ASR-1.7B", Category: "STT", Provider: ProviderOlares,
		Capabilities: []Capability{CapSTT, CapSTTStream}},
	{Name: "Olares/openai/whisper-large-v3", Category: "STT", Provider: ProviderOlares,
		Capabilities: []Capability{CapSTT}},
	{Name: "Olares/Systran/faster-whisper-large-v3", Category: "STT", Provider: ProviderOlares,
		Capabilities: []Capability{CapSTT}},
	{Name: "Olares/mistralai/Voxtral-Mini-4B-Realtime-2602", Category: "STT", Provider: ProviderOlares,
		Capabilities: []Capability{CapSTT, CapSTTStream}},
	{Name: "Olares/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", Category: "TTS", Provider: ProviderOlares,
		Capabilities: []Capability{CapTTS}},
	{Name: "Olares/Qwen/Qwen3-TTS-12Hz-1.7B-Base", Category: "TTS", Provider: ProviderOlares,
		Capabilities: []Capability{CapTTSClone}},
	{Name: "Olares/Soul-AILab/SoulX-Podcast-1.7B", Category: "TTS", Provider: ProviderOlares,
		Capabilities: []Capability{CapTTSDialogue}},
	{Name: "Olares/openbmb/VoxCPM2", Category: "TTS", Provider: ProviderOlares,
		Capabilities: []Capability{CapTTS, CapTTSClone}},
	{Name: "Olares/OpenMOSS-Team/MOSS-TTS-Nano", Category: "TTS", Provider: ProviderOlares,
		Capabilities: []Capability{CapTTS, CapTTSClone}},
	{Name: "Olares/Qwen/Qwen3-ForcedAligner-0.6B", Category: "ALIGN", Provider: ProviderOlares,
		Capabilities: []Capability{CapAlign}},
	{Name: "Olares/onnx-community/silero-vad", Category: "VAD", Provider: ProviderOlares,
		Capabilities: []Capability{CapVAD}},
	{Name: "Olares/pyannote/speaker-diarization-community-1", Category: "DIAR", Provider: ProviderOlares,
		Capabilities: []Capability{CapDiar}},
	{Name: "Olares/nvidia/diar_streaming_sortformer_4spk-v2.1", Category: "DIAR", Provider: ProviderOlares,
		Capabilities: []Capability{CapDiarStream}},
	{Name: "Olares/pyannote/embedding", Category: "SPEAKER EMBED", Provider: ProviderOlares,
		Capabilities: []Capability{CapSpeakerEmbed}},
	{Name: "Olares/mispeech/Dasheng-AudioGen", Category: "SOUND FX", Provider: ProviderOlares,
		Capabilities: []Capability{CapSoundFX}},
	{Name: "Olares/speechbrain/mtl-mimic-voicebank", Category: "ENHANCE", Provider: ProviderOlares,
		Capabilities: []Capability{CapEnhance}},

	// --- OpenAI models ---
	{Name: "openai/gpt-4o-mini-transcribe", Category: "STT", Provider: ProviderOpenAI,
		Capabilities: []Capability{CapSTT, CapSTTStream}},
	{Name: "openai/gpt-live-transcribe", Category: "STT", Provider: ProviderOpenAI,
		Capabilities: []Capability{CapSTTStream}},
	{Name: "openai/gpt-realtime-whisper", Category: "STT", Provider: ProviderOpenAI,
		Capabilities: []Capability{CapSTTStream}},
	{Name: "openai/gpt-transcribe", Category: "STT", Provider: ProviderOpenAI,
		Capabilities: []Capability{CapSTT, CapSTTStream}},
	{Name: "openai/gpt-4o-transcribe", Category: "STT", Provider: ProviderOpenAI,
		Capabilities: []Capability{CapSTT, CapSTTStream}},
	{Name: "openai/whisper-1", Category: "STT", Provider: ProviderOpenAI,
		Capabilities: []Capability{CapSTT}},
	{Name: "openai/gpt-4o-mini-tts", Category: "TTS", Provider: ProviderOpenAI,
		Capabilities: []Capability{CapTTS}},
	{Name: "openai/tts-1", Category: "TTS", Provider: ProviderOpenAI,
		Capabilities: []Capability{CapTTS}},
	{Name: "openai/tts-1-hd", Category: "TTS", Provider: ProviderOpenAI,
		Capabilities: []Capability{CapTTS}},
	{Name: "openai/gpt-4o-transcribe-diarize", Category: "DIAR", Provider: ProviderOpenAI,
		Capabilities: []Capability{CapSTT, CapDiar}},
}

// LookupModel finds a registry entry by exact name, then by case-insensitive
// match, so the CLI is forgiving about capitalisation.
func LookupModel(name string) (Model, bool) {
	name = strings.TrimSpace(name)
	for _, m := range Models {
		if m.Name == name {
			return m, true
		}
	}
	for _, m := range Models {
		if strings.EqualFold(m.Name, name) {
			return m, true
		}
	}
	return Model{}, false
}

// Supports reports whether the model declares the given capability.
func (m Model) Supports(cap Capability) bool {
	for _, c := range m.Capabilities {
		if c == cap {
			return true
		}
	}
	return false
}

// ModelsWithCapability returns every model that declares the capability.
func ModelsWithCapability(cap Capability) []Model {
	var out []Model
	for _, m := range Models {
		if m.Supports(cap) {
			out = append(out, m)
		}
	}
	return out
}

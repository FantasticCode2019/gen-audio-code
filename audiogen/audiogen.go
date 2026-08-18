// Package audiogen generates ready-to-run client snippets (curl, Python,
// TypeScript) for every audio capability exposed by the Olares router.
package audiogen

import (
	"fmt"
	"net/url"
	"strings"
)

// Language is the target language of a generated snippet.
type Language string

const (
	LangCurl       Language = "curl"
	LangPython     Language = "python"
	LangTypeScript Language = "typescript"
)

// Languages lists every supported output language in display order.
var Languages = []Language{LangCurl, LangPython, LangTypeScript}

// ParseLanguage resolves a user-supplied language name, accepting the common
// aliases people type on the command line.
func ParseLanguage(s string) (Language, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "curl", "sh", "bash", "shell":
		return LangCurl, nil
	case "python", "py":
		return LangPython, nil
	case "typescript", "ts", "javascript", "js", "node":
		return LangTypeScript, nil
	}
	return "", fmt.Errorf("unknown language %q (want curl, python or typescript)", s)
}

// Capability is a single audio ability a model can serve.
type Capability string

const (
	CapSTT          Capability = "stt"
	CapSTTStream    Capability = "stt_stream"
	CapTTS          Capability = "tts"
	CapTTSClone     Capability = "tts_clone"
	CapTTSDialogue  Capability = "tts_dialogue"
	CapAlign        Capability = "align"
	CapVAD          Capability = "vad"
	CapDiar         Capability = "diar"
	CapDiarStream   Capability = "diar_stream"
	CapSpeakerEmbed Capability = "speaker_embed"
	CapSoundFX      Capability = "sound_fx"
	CapEnhance      Capability = "enhance"
)

// Capabilities lists every capability a generator exists for, in a stable order.
var Capabilities = []Capability{
	CapSTT, CapSTTStream,
	CapTTS, CapTTSClone, CapTTSDialogue,
	CapAlign, CapVAD,
	CapDiar, CapDiarStream,
	CapSpeakerEmbed, CapSoundFX, CapEnhance,
}

// ParseCapability resolves a user-supplied capability name.
func ParseCapability(s string) (Capability, error) {
	c := Capability(strings.ToLower(strings.TrimSpace(s)))
	for _, known := range Capabilities {
		if c == known {
			return c, nil
		}
	}
	return "", fmt.Errorf("unknown capability %q (see -list-capabilities)", s)
}

// endpoints maps a capability to its path below the API base, and records
// whether the capability talks over WebSocket instead of HTTP.
var endpoints = map[Capability]struct {
	Path      string
	WebSocket bool
}{
	CapSTT:          {Path: "/audio/transcriptions"},
	CapSTTStream:    {Path: "/audio/stream", WebSocket: true},
	CapTTS:          {Path: "/audio/speech"},
	CapTTSClone:     {Path: "/audio/speech/clone"},
	CapTTSDialogue:  {Path: "/audio/speech"},
	CapAlign:        {Path: "/audio/align"},
	CapVAD:          {Path: "/audio/vad"},
	CapDiar:         {Path: "/audio/diarization"},
	CapDiarStream:   {Path: "/audio/diarize/stream", WebSocket: true},
	CapSpeakerEmbed: {Path: "/audio/embeddings"},
	CapSoundFX:      {Path: "/audio/speech"},
	CapEnhance:      {Path: "/audio/enhance"},
}

// APIKeyEnvVar is the environment variable the generated snippets read from
// when the caller does not supply a literal key.
const APIKeyEnvVar = "OLARES_API_KEY"

// Request is the input to every generator: where to call, which model to use,
// an optional API key, and which language to emit.
type Request struct {
	// URL is the router base URL, with or without a trailing "/v1".
	URL string
	// Model is the fully qualified model name, e.g. "Olares/openai/whisper-large-v3".
	Model string
	// APIKey is optional. When empty the snippet reads OLARES_API_KEY from the
	// environment instead of hard-coding a secret.
	APIKey string
	// Lang selects the output language.
	Lang Language
}

// Endpoint returns the absolute URL this request would call for the given
// capability, which is useful for tests and for showing the target in a UI.
func (r Request) Endpoint(cap Capability) (string, error) {
	d, err := r.templateData(cap)
	if err != nil {
		return "", err
	}
	return d.Endpoint, nil
}

// templateData is the flattened view handed to the snippet templates.
type templateData struct {
	Model string

	// BaseURL is the normalised HTTP base, e.g. "https://host/v1".
	BaseURL string
	// Endpoint is the absolute URL for the capability. For WebSocket
	// capabilities this already uses the ws:// or wss:// scheme.
	Endpoint string

	// CurlAuth renders inside a curl header: either the literal key or a
	// shell variable reference.
	CurlAuth string
	// PyAuth and TSAuth are complete expressions assigned to a variable.
	PyAuth string
	TSAuth string
	// PyImportOS tells Python templates to pull in "os", which they place in
	// their own stdlib import group so the result stays PEP 8 clean.
	PyImportOS bool
	// CurlPreamble exports the key variable so the snippet runs as-is.
	CurlPreamble string
}

func normalizeBaseURL(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", fmt.Errorf("url is required")
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return "", fmt.Errorf("invalid url %q: %w", raw, err)
	}
	switch u.Scheme {
	case "http", "https":
	case "ws":
		u.Scheme = "http"
	case "wss":
		u.Scheme = "https"
	default:
		return "", fmt.Errorf("unsupported url scheme %q", u.Scheme)
	}
	if u.Host == "" {
		return "", fmt.Errorf("invalid url %q: missing host", raw)
	}
	u.RawQuery, u.Fragment = "", ""

	path := strings.TrimRight(u.Path, "/")
	if !strings.HasSuffix(path, "/v1") {
		path += "/v1"
	}
	u.Path = path
	return u.String(), nil
}

func toWebSocket(httpURL string) string {
	if strings.HasPrefix(httpURL, "https://") {
		return "wss://" + strings.TrimPrefix(httpURL, "https://")
	}
	return "ws://" + strings.TrimPrefix(httpURL, "http://")
}

func (r Request) templateData(cap Capability) (templateData, error) {
	ep, ok := endpoints[cap]
	if !ok {
		return templateData{}, fmt.Errorf("no endpoint registered for capability %q", cap)
	}
	base, err := normalizeBaseURL(r.URL)
	if err != nil {
		return templateData{}, err
	}
	model := strings.TrimSpace(r.Model)
	if model == "" {
		return templateData{}, fmt.Errorf("model is required")
	}

	full := base + ep.Path
	if ep.WebSocket {
		full = toWebSocket(full)
	}

	d := templateData{
		Model:    model,
		BaseURL:  base,
		Endpoint: full,
	}

	if key := strings.TrimSpace(r.APIKey); key != "" {
		d.CurlAuth = key
		d.PyAuth = pyQuote(key)
		d.TSAuth = tsQuote(key)
	} else {
		d.CurlAuth = "$" + APIKeyEnvVar
		d.CurlPreamble = "export " + APIKeyEnvVar + "=\"sk-your-api-key\"\n\n"
		d.PyAuth = fmt.Sprintf("os.environ[%s]", pyQuote(APIKeyEnvVar))
		d.PyImportOS = true
		d.TSAuth = fmt.Sprintf("process.env.%s!", APIKeyEnvVar)
	}
	return d, nil
}

// Generate renders the snippet for one capability. The per-capability wrappers
// below (GenerateSTT, GenerateTTS, ...) all funnel through here.
func Generate(cap Capability, req Request) (string, error) {
	if _, ok := endpoints[cap]; !ok {
		return "", fmt.Errorf("unknown capability %q", cap)
	}
	lang := req.Lang
	if lang == "" {
		lang = LangCurl
	}
	if lang != LangCurl && lang != LangPython && lang != LangTypeScript {
		return "", fmt.Errorf("unknown language %q", req.Lang)
	}
	data, err := req.templateData(cap)
	if err != nil {
		return "", fmt.Errorf("%s/%s: %w", cap, lang, err)
	}
	return render(string(cap)+"."+string(lang), data)
}

// GenerateAll renders every language for one capability, keyed by language.
func GenerateAll(cap Capability, req Request) (map[Language]string, error) {
	out := make(map[Language]string, len(Languages))
	for _, lang := range Languages {
		r := req
		r.Lang = lang
		code, err := r.generate(cap)
		if err != nil {
			return nil, err
		}
		out[lang] = code
	}
	return out, nil
}

func (r Request) generate(cap Capability) (string, error) { return Generate(cap, r) }

// GenerateForModel renders snippets for every capability the named model
// declares in the registry. Returns capabilities in registry order.
func GenerateForModel(name string, req Request) ([]CapabilitySnippet, error) {
	m, ok := LookupModel(name)
	if !ok {
		return nil, fmt.Errorf("model %q is not in the registry", name)
	}
	if strings.TrimSpace(req.Model) == "" {
		req.Model = m.Name
	}
	out := make([]CapabilitySnippet, 0, len(m.Capabilities))
	for _, cap := range m.Capabilities {
		code, err := Generate(cap, req)
		if err != nil {
			return nil, err
		}
		out = append(out, CapabilitySnippet{Capability: cap, Language: req.Lang, Code: code})
	}
	return out, nil
}

// CapabilitySnippet pairs a rendered snippet with the capability it exercises.
type CapabilitySnippet struct {
	Capability Capability
	Language   Language
	Code       string
}

// --- Per-capability generators -------------------------------------------
//
// One function per capability, as a stable API for callers that already know
// which ability they want to document.

// GenerateSTT emits a one-shot speech-to-text transcription call.
func GenerateSTT(req Request) (string, error) { return Generate(CapSTT, req) }

// GenerateSTTStream emits a streaming speech-to-text WebSocket session.
func GenerateSTTStream(req Request) (string, error) { return Generate(CapSTTStream, req) }

// GenerateTTS emits a text-to-speech call that writes an audio file.
func GenerateTTS(req Request) (string, error) { return Generate(CapTTS, req) }

// GenerateTTSClone emits a voice-cloning call driven by a reference sample.
func GenerateTTSClone(req Request) (string, error) { return Generate(CapTTSClone, req) }

// GenerateTTSDialogue emits a multi-speaker dialogue synthesis call.
func GenerateTTSDialogue(req Request) (string, error) { return Generate(CapTTSDialogue, req) }

// GenerateAlign emits a forced-alignment call between audio and a transcript.
func GenerateAlign(req Request) (string, error) { return Generate(CapAlign, req) }

// GenerateVAD emits a voice-activity-detection call.
func GenerateVAD(req Request) (string, error) { return Generate(CapVAD, req) }

// GenerateDiar emits a one-shot speaker-diarization call.
func GenerateDiar(req Request) (string, error) { return Generate(CapDiar, req) }

// GenerateDiarStream emits a streaming speaker-diarization WebSocket session.
func GenerateDiarStream(req Request) (string, error) { return Generate(CapDiarStream, req) }

// GenerateSpeakerEmbed emits a speaker-embedding extraction call.
func GenerateSpeakerEmbed(req Request) (string, error) { return Generate(CapSpeakerEmbed, req) }

// GenerateSoundFX emits a sound-effect generation call.
func GenerateSoundFX(req Request) (string, error) { return Generate(CapSoundFX, req) }

// GenerateEnhance emits a speech-enhancement call that writes cleaned audio.
func GenerateEnhance(req Request) (string, error) { return Generate(CapEnhance, req) }

// generators indexes the per-capability functions so callers can dispatch on a
// capability value without a switch.
var generators = map[Capability]func(Request) (string, error){
	CapSTT:          GenerateSTT,
	CapSTTStream:    GenerateSTTStream,
	CapTTS:          GenerateTTS,
	CapTTSClone:     GenerateTTSClone,
	CapTTSDialogue:  GenerateTTSDialogue,
	CapAlign:        GenerateAlign,
	CapVAD:          GenerateVAD,
	CapDiar:         GenerateDiar,
	CapDiarStream:   GenerateDiarStream,
	CapSpeakerEmbed: GenerateSpeakerEmbed,
	CapSoundFX:      GenerateSoundFX,
	CapEnhance:      GenerateEnhance,
}

// GeneratorFor returns the generator function registered for a capability.
func GeneratorFor(cap Capability) (func(Request) (string, error), bool) {
	fn, ok := generators[cap]
	return fn, ok
}

func pyQuote(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`)
	return `"` + r.Replace(s) + `"`
}

func tsQuote(s string) string { return pyQuote(s) }

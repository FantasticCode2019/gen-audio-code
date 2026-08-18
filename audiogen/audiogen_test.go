package audiogen

import (
	"strings"
	"testing"
	"unicode"
)

const testURL = "https://router.example.com"

func TestNormalizeBaseURL(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"https://router.example.com", "https://router.example.com/v1"},
		{"https://router.example.com/", "https://router.example.com/v1"},
		{"https://router.example.com/v1", "https://router.example.com/v1"},
		{"https://router.example.com/v1/", "https://router.example.com/v1"},
		{"router.example.com", "https://router.example.com/v1"},
		{"http://localhost:8080", "http://localhost:8080/v1"},
		{"wss://router.example.com/v1", "https://router.example.com/v1"},
		{"https://router.example.com/api", "https://router.example.com/api/v1"},
		{"  https://router.example.com  ", "https://router.example.com/v1"},
	}
	for _, c := range cases {
		got, err := normalizeBaseURL(c.in)
		if err != nil {
			t.Errorf("normalizeBaseURL(%q) returned error: %v", c.in, err)
			continue
		}
		if got != c.want {
			t.Errorf("normalizeBaseURL(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestNormalizeBaseURLErrors(t *testing.T) {
	for _, in := range []string{"", "   ", "ftp://router.example.com"} {
		if _, err := normalizeBaseURL(in); err == nil {
			t.Errorf("normalizeBaseURL(%q) should have failed", in)
		}
	}
}

func TestStreamingCapabilitiesUseWebSocketScheme(t *testing.T) {
	req := Request{URL: testURL, Model: "m"}
	streaming := map[Capability]bool{CapSTTStream: true, CapDiarStream: true}
	for _, cap := range Capabilities {
		ep, err := req.Endpoint(cap)
		if err != nil {
			t.Fatalf("Endpoint(%s): %v", cap, err)
		}
		isWS := strings.HasPrefix(ep, "wss://")
		if isWS != streaming[cap] {
			t.Errorf("Endpoint(%s) = %q, websocket=%v want %v", cap, ep, isWS, streaming[cap])
		}
	}
}

// TestGenerateAllCombinations is the broad safety net: every capability must
// render in every language, mention its model and endpoint, and never leak an
// unrendered template delimiter.
func TestGenerateAllCombinations(t *testing.T) {
	const model = "Olares/vendor/some-model"
	for _, cap := range Capabilities {
		for _, lang := range Languages {
			req := Request{URL: testURL, Model: model, Lang: lang}
			code, err := Generate(cap, req)
			if err != nil {
				t.Fatalf("Generate(%s, %s): %v", cap, lang, err)
			}
			if strings.TrimSpace(code) == "" {
				t.Fatalf("Generate(%s, %s) produced empty output", cap, lang)
			}
			if !strings.Contains(code, model) {
				t.Errorf("Generate(%s, %s) does not mention the model", cap, lang)
			}
			ep, _ := req.Endpoint(cap)
			if !strings.Contains(code, ep) && !strings.Contains(code, "router.example.com") {
				t.Errorf("Generate(%s, %s) does not mention the endpoint %q", cap, lang, ep)
			}
			for _, bad := range []string{"<<", ">>", "<no value>"} {
				if strings.Contains(code, bad) {
					t.Errorf("Generate(%s, %s) contains %q", cap, lang, bad)
				}
			}
			if !strings.HasSuffix(code, "\n") {
				t.Errorf("Generate(%s, %s) should end with a newline", cap, lang)
			}
			if strings.HasPrefix(code, "\n") {
				t.Errorf("Generate(%s, %s) should not start with a blank line", cap, lang)
			}
		}
	}
}

// TestSnippetsAreEnglishOnly guards the requirement that generated samples
// carry no Chinese (or other CJK) text.
func TestSnippetsAreEnglishOnly(t *testing.T) {
	for _, cap := range Capabilities {
		for _, lang := range Languages {
			code, err := Generate(cap, Request{URL: testURL, Model: "m", Lang: lang})
			if err != nil {
				t.Fatalf("Generate(%s, %s): %v", cap, lang, err)
			}
			for _, r := range code {
				if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Katakana, r) {
					t.Errorf("Generate(%s, %s) contains non-English rune %q", cap, lang, r)
					break
				}
			}
		}
	}
}

func TestAPIKeyIsInlinedWhenProvided(t *testing.T) {
	const key = "sk-secret-value"
	for _, lang := range Languages {
		code, err := Generate(CapSTT, Request{URL: testURL, Model: "m", APIKey: key, Lang: lang})
		if err != nil {
			t.Fatalf("Generate(%s): %v", lang, err)
		}
		if !strings.Contains(code, key) {
			t.Errorf("%s snippet should inline the provided key", lang)
		}
		if strings.Contains(code, APIKeyEnvVar) {
			t.Errorf("%s snippet should not reference %s when a key is given", lang, APIKeyEnvVar)
		}
	}
}

func TestAPIKeyFallsBackToEnvironment(t *testing.T) {
	for _, lang := range Languages {
		code, err := Generate(CapSTT, Request{URL: testURL, Model: "m", Lang: lang})
		if err != nil {
			t.Fatalf("Generate(%s): %v", lang, err)
		}
		if !strings.Contains(code, APIKeyEnvVar) {
			t.Errorf("%s snippet should read %s when no key is given", lang, APIKeyEnvVar)
		}
	}
	// The Python snippet only imports os when it actually reads the environment.
	withEnv, _ := Generate(CapSTT, Request{URL: testURL, Model: "m", Lang: LangPython})
	if !strings.Contains(withEnv, "import os") {
		t.Error("python snippet should import os when reading the environment")
	}
	withKey, _ := Generate(CapSTT, Request{URL: testURL, Model: "m", APIKey: "sk-x", Lang: LangPython})
	if strings.Contains(withKey, "import os") {
		t.Error("python snippet should not import os when the key is inlined")
	}
}

func TestQuotingEscapesSpecialCharacters(t *testing.T) {
	code, err := Generate(CapSTT, Request{URL: testURL, Model: "m", APIKey: `sk-"quote\slash`, Lang: LangPython})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if !strings.Contains(code, `sk-\"quote\\slash`) {
		t.Errorf("python snippet did not escape the key:\n%s", code)
	}
}

func TestGenerateRejectsBadInput(t *testing.T) {
	if _, err := Generate(CapSTT, Request{URL: "", Model: "m", Lang: LangCurl}); err == nil {
		t.Error("missing url should fail")
	}
	if _, err := Generate(CapSTT, Request{URL: testURL, Model: "", Lang: LangCurl}); err == nil {
		t.Error("missing model should fail")
	}
	if _, err := Generate(CapSTT, Request{URL: testURL, Model: "m", Lang: "cobol"}); err == nil {
		t.Error("unknown language should fail")
	}
	if _, err := Generate(Capability("teleport"), Request{URL: testURL, Model: "m", Lang: LangCurl}); err == nil {
		t.Error("unknown capability should fail")
	}
}

func TestDefaultLanguageIsCurl(t *testing.T) {
	got, err := Generate(CapSTT, Request{URL: testURL, Model: "m"})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	want, err := Generate(CapSTT, Request{URL: testURL, Model: "m", Lang: LangCurl})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if got != want {
		t.Error("an empty language should default to curl")
	}
}

func TestGenerateAll(t *testing.T) {
	out, err := GenerateAll(CapTTS, Request{URL: testURL, Model: "m"})
	if err != nil {
		t.Fatalf("GenerateAll: %v", err)
	}
	if len(out) != len(Languages) {
		t.Fatalf("GenerateAll returned %d languages, want %d", len(out), len(Languages))
	}
	for _, lang := range Languages {
		if strings.TrimSpace(out[lang]) == "" {
			t.Errorf("GenerateAll produced no %s snippet", lang)
		}
	}
}

// TestEveryCapabilityHasAGenerator keeps the per-capability functions and the
// capability list from drifting apart.
func TestEveryCapabilityHasAGenerator(t *testing.T) {
	if len(generators) != len(Capabilities) {
		t.Errorf("generators has %d entries, Capabilities has %d", len(generators), len(Capabilities))
	}
	for _, cap := range Capabilities {
		fn, ok := GeneratorFor(cap)
		if !ok {
			t.Errorf("no generator registered for %s", cap)
			continue
		}
		if _, err := fn(Request{URL: testURL, Model: "m", Lang: LangCurl}); err != nil {
			t.Errorf("generator for %s failed: %v", cap, err)
		}
	}
}

func TestRegistryModelsRenderEveryDeclaredCapability(t *testing.T) {
	if len(Models) == 0 {
		t.Fatal("registry is empty")
	}
	seen := map[string]bool{}
	for _, m := range Models {
		if seen[m.Name] {
			t.Errorf("duplicate model %q in registry", m.Name)
		}
		seen[m.Name] = true
		if len(m.Capabilities) == 0 {
			t.Errorf("model %q declares no capabilities", m.Name)
		}
		for _, cap := range m.Capabilities {
			if _, ok := endpoints[cap]; !ok {
				t.Errorf("model %q declares unknown capability %q", m.Name, cap)
			}
		}
	}
}

func TestGenerateForModel(t *testing.T) {
	snippets, err := GenerateForModel("Olares/openbmb/VoxCPM2", Request{URL: testURL, Lang: LangCurl})
	if err != nil {
		t.Fatalf("GenerateForModel: %v", err)
	}
	if len(snippets) != 2 {
		t.Fatalf("expected 2 capabilities for VoxCPM2, got %d", len(snippets))
	}
	for _, s := range snippets {
		if !strings.Contains(s.Code, "Olares/openbmb/VoxCPM2") {
			t.Errorf("%s snippet does not name the model", s.Capability)
		}
	}
	if _, err := GenerateForModel("nope/not-a-model", Request{URL: testURL}); err == nil {
		t.Error("unknown model should fail")
	}
}

func TestLookupModelIsCaseInsensitive(t *testing.T) {
	if _, ok := LookupModel("olares/openbmb/voxcpm2"); !ok {
		t.Error("lookup should fall back to a case-insensitive match")
	}
	if _, ok := LookupModel("  Olares/pyannote/embedding  "); !ok {
		t.Error("lookup should tolerate surrounding whitespace")
	}
}

func TestModelsWithCapability(t *testing.T) {
	tts := ModelsWithCapability(CapTTS)
	if len(tts) == 0 {
		t.Fatal("expected at least one tts model")
	}
	for _, m := range tts {
		if !m.Supports(CapTTS) {
			t.Errorf("%s was returned but does not support tts", m.Name)
		}
	}
}

func TestParseLanguage(t *testing.T) {
	cases := map[string]Language{
		"curl": LangCurl, "CURL": LangCurl, "bash": LangCurl,
		"py": LangPython, "Python": LangPython,
		"ts": LangTypeScript, "typescript": LangTypeScript, "node": LangTypeScript,
	}
	for in, want := range cases {
		got, err := ParseLanguage(in)
		if err != nil || got != want {
			t.Errorf("ParseLanguage(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	if _, err := ParseLanguage("rust"); err == nil {
		t.Error("ParseLanguage should reject unknown languages")
	}
}

func TestParseCapability(t *testing.T) {
	if got, err := ParseCapability("  TTS_Clone "); err != nil || got != CapTTSClone {
		t.Errorf("ParseCapability = %q, %v", got, err)
	}
	if _, err := ParseCapability("dance"); err == nil {
		t.Error("ParseCapability should reject unknown capabilities")
	}
}

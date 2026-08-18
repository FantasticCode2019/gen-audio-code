// Command audiogen renders client snippets for the Olares audio capabilities.
// It is the manual test harness: pick a model, a capability and a language,
// and inspect the code it prints.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"olares.com/audiogen/audiogen"
)

const defaultURL = "https://router.yaotest004.olares.com"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

type options struct {
	url        string
	model      string
	capability string
	lang       string
	apiKey     string
	outDir     string

	listModels bool
	listCaps   bool
	allModels  bool
}

func run() error {
	var o options
	fs := flag.NewFlagSet("audiogen", flag.ContinueOnError)
	fs.StringVar(&o.url, "url", defaultURL, "router base URL (a trailing /v1 is added when missing)")
	fs.StringVar(&o.model, "model", "", "model name, e.g. Olares/openai/whisper-large-v3")
	fs.StringVar(&o.capability, "capability", "", "capability to render; defaults to every capability the model supports")
	fs.StringVar(&o.lang, "lang", "curl", "output language: curl, python, typescript, or all")
	fs.StringVar(&o.apiKey, "api-key", "", "optional API key; when omitted snippets read $"+audiogen.APIKeyEnvVar)
	fs.StringVar(&o.outDir, "out", "", "optional directory to write snippets into instead of stdout")
	fs.BoolVar(&o.listModels, "list-models", false, "list every model in the registry with its capabilities")
	fs.BoolVar(&o.listCaps, "list-capabilities", false, "list every capability and its endpoint")
	fs.BoolVar(&o.allModels, "all-models", false, "render every model and every capability (smoke test)")

	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "audiogen renders curl/python/typescript snippets for Olares audio models.\n\nUsage:\n")
		fs.PrintDefaults()
		fmt.Fprintf(fs.Output(), "\nExamples:\n"+
			"  audiogen -list-models\n"+
			"  audiogen -model Olares/openai/whisper-large-v3 -lang python\n"+
			"  audiogen -model Olares/openbmb/VoxCPM2 -lang all\n"+
			"  audiogen -capability tts -model openai/tts-1 -lang curl -api-key sk-xxx\n"+
			"  audiogen -all-models -lang all -out ./generated\n")
	}

	if err := fs.Parse(os.Args[1:]); err != nil {
		return err
	}

	switch {
	case o.listCaps:
		return listCapabilities(o)
	case o.listModels:
		return listModels()
	case o.allModels:
		return renderAllModels(o)
	}

	if o.model == "" && o.capability == "" {
		fs.Usage()
		return fmt.Errorf("nothing to do: provide -model and/or -capability")
	}
	return renderOne(o)
}

func listCapabilities(o options) error {
	req := audiogen.Request{URL: o.url, Model: "MODEL"}
	fmt.Printf("%-15s %s\n", "CAPABILITY", "ENDPOINT")
	for _, cap := range audiogen.Capabilities {
		ep, err := req.Endpoint(cap)
		if err != nil {
			return err
		}
		fmt.Printf("%-15s %s\n", cap, ep)
	}
	return nil
}

func listModels() error {
	fmt.Printf("%-14s %-48s %s\n", "CATEGORY", "MODEL", "CAPABILITIES")
	for _, m := range audiogen.Models {
		caps := make([]string, 0, len(m.Capabilities))
		for _, c := range m.Capabilities {
			caps = append(caps, string(c))
		}
		fmt.Printf("%-14s %-48s %s\n", m.Category, m.Name, strings.Join(caps, ", "))
	}
	return nil
}

// resolveLangs turns the -lang flag into the list of languages to render.
func resolveLangs(s string) ([]audiogen.Language, error) {
	if strings.EqualFold(strings.TrimSpace(s), "all") {
		return audiogen.Languages, nil
	}
	lang, err := audiogen.ParseLanguage(s)
	if err != nil {
		return nil, err
	}
	return []audiogen.Language{lang}, nil
}

// resolveCaps decides which capabilities to render for the requested model.
func resolveCaps(o options) ([]audiogen.Capability, error) {
	if o.capability != "" {
		cap, err := audiogen.ParseCapability(o.capability)
		if err != nil {
			return nil, err
		}
		if m, ok := audiogen.LookupModel(o.model); ok && !m.Supports(cap) {
			fmt.Fprintf(os.Stderr, "warning: %s does not declare capability %s, rendering anyway\n", m.Name, cap)
		}
		return []audiogen.Capability{cap}, nil
	}
	if o.model == "" {
		return nil, fmt.Errorf("provide -model, -capability, or both")
	}
	m, ok := audiogen.LookupModel(o.model)
	if !ok {
		return nil, fmt.Errorf("model %q is not in the registry; pass -capability explicitly", o.model)
	}
	return m.Capabilities, nil
}

func renderOne(o options) error {
	if o.model == "" {
		return fmt.Errorf("-model is required")
	}
	langs, err := resolveLangs(o.lang)
	if err != nil {
		return err
	}
	caps, err := resolveCaps(o)
	if err != nil {
		return err
	}
	return emit(o, o.model, caps, langs)
}

func renderAllModels(o options) error {
	langs, err := resolveLangs(o.lang)
	if err != nil {
		return err
	}
	for _, m := range audiogen.Models {
		if err := emit(o, m.Name, m.Capabilities, langs); err != nil {
			return err
		}
	}
	return nil
}

var fileExt = map[audiogen.Language]string{
	audiogen.LangCurl:       "sh",
	audiogen.LangPython:     "py",
	audiogen.LangTypeScript: "ts",
}

func emit(o options, model string, caps []audiogen.Capability, langs []audiogen.Language) error {
	for _, cap := range caps {
		for _, lang := range langs {
			req := audiogen.Request{URL: o.url, Model: model, APIKey: o.apiKey, Lang: lang}
			code, err := audiogen.Generate(cap, req)
			if err != nil {
				return err
			}
			if o.outDir == "" {
				fmt.Printf("=== %s | %s | %s ===\n%s\n", model, cap, lang, code)
				continue
			}
			dir := filepath.Join(o.outDir, sanitize(model))
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return err
			}
			path := filepath.Join(dir, fmt.Sprintf("%s.%s", cap, fileExt[lang]))
			if err := os.WriteFile(path, []byte(code), 0o644); err != nil {
				return err
			}
			fmt.Println("wrote", path)
		}
	}
	return nil
}

// sanitize turns a model name into a single safe path segment.
func sanitize(model string) string {
	return strings.NewReplacer("/", "_", " ", "_").Replace(model)
}

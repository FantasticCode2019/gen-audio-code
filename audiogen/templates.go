package audiogen

import (
	"embed"
	"fmt"
	"strings"
	"text/template"
)

//go:embed templates/*.tmpl
var templateFS embed.FS

// Snippet templates use << >> delimiters: the generated code is full of JSON,
// JavaScript object literals and f-strings, so the default {{ }} would clash.
var tmpl = template.Must(
	template.New("audiogen").
		Delims("<<", ">>").
		ParseFS(templateFS, "templates/*.tmpl"),
)

func render(name string, data templateData) (string, error) {
	t := tmpl.Lookup(name)
	if t == nil {
		return "", fmt.Errorf("no template named %q", name)
	}
	var sb strings.Builder
	if err := t.Execute(&sb, data); err != nil {
		return "", fmt.Errorf("render %s: %w", name, err)
	}
	return strings.Trim(sb.String(), "\n") + "\n", nil
}

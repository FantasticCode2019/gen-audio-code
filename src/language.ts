// The target languages a snippet can be rendered in.

/** Language is the target language of a generated snippet. */
export type Language = "curl" | "python" | "typescript";

export const LangCurl = "curl" as const;
export const LangPython = "python" as const;
export const LangTypeScript = "typescript" as const;

/** Languages lists every supported output language in display order. */
export const Languages: Language[] = [LangCurl, LangPython, LangTypeScript];

/**
 * parseLanguage resolves a user-supplied language name, accepting the common
 * aliases people type on the command line.
 */
export function parseLanguage(s: string): Language {
  switch (s.trim().toLowerCase()) {
    case "curl":
    case "sh":
    case "bash":
    case "shell":
      return LangCurl;
    case "python":
    case "py":
      return LangPython;
    case "typescript":
    case "ts":
    case "javascript":
    case "js":
    case "node":
      return LangTypeScript;
    default:
      throw new Error(`unknown language ${JSON.stringify(s)} (want curl, python or typescript)`);
  }
}

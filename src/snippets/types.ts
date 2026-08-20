import type { Language } from "../language.ts";

/**
 * SnippetData is the resolved view of a Request that the snippets interpolate:
 * every URL is already normalised and every auth expression already quoted, so
 * a snippet only has to place the values.
 */
export interface SnippetData {
  model: string;

  /** baseURL is the normalised HTTP base, e.g. "https://host/v1". */
  baseURL: string;
  /**
   * endpoint is the absolute URL for the capability. For WebSocket
   * capabilities this already uses the ws:// or wss:// scheme.
   */
  endpoint: string;

  /**
   * curlAuth renders inside a curl header: either the literal key or a shell
   * variable reference.
   */
  curlAuth: string;
  /** pyAuth and tsAuth are complete expressions assigned to a variable. */
  pyAuth: string;
  tsAuth: string;
  /**
   * pyImportOS tells Python snippets to pull in "os", which they place in
   * their own stdlib import group so the result stays PEP 8 clean.
   */
  pyImportOS: boolean;
  /** curlPreamble exports the key variable so the snippet runs as-is. */
  curlPreamble: string;
}

/** SnippetSet is one renderer per output language. */
export type SnippetSet = Record<Language, (data: SnippetData) => string>;

import type { Language } from "../language.ts";

/**
 * SnippetData is the resolved view of a Request that the snippets interpolate:
 * every URL is already normalised and every auth line already rendered, so a
 * snippet only has to place the values.
 *
 * The auth fields are whole lines rather than bare values, and every one of
 * them is empty when the caller supplied no API key. Placing them is therefore
 * all a snippet has to do to drop the Authorization header entirely, which is
 * what the router expects from callers inside Olares: there the gateway
 * identifies the app with x-caller-appid instead of a bearer token.
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
   * hasKey reports whether an API key was supplied. Snippets whose shape
   * changes without one — the OpenAI SDK and WebSocket clients, which pass
   * auth through a client option rather than a header line — branch on it.
   */
  hasKey: boolean;

  /** curlAuthHeader is a curl -H line, ending in a line continuation. */
  curlAuthHeader: string;
  /** websocatAuthArg is a websocat -H= argument, ending in a line continuation. */
  websocatAuthArg: string;
  /** pyAuthAssign is the API_KEY assignment, followed by a blank line. */
  pyAuthAssign: string;
  /** pyAuthHeader is the headers= argument of an httpx call. */
  pyAuthHeader: string;
  /** tsAuthAssign is the apiKey declaration, followed by a blank line. */
  tsAuthAssign: string;
  /** tsAuthHeaders is a whole headers property for a fetch or WebSocket call. */
  tsAuthHeaders: string;
  /**
   * tsAuthHeaderEntry is the Authorization entry alone, for the snippets whose
   * headers object also carries a Content-Type.
   */
  tsAuthHeaderEntry: string;
}

/** SnippetSet is one renderer per output language. */
export type SnippetSet = Record<Language, (data: SnippetData) => string>;

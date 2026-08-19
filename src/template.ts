// Renderer for the snippet templates in ../templates.
//
// The templates use "<<" ">>" delimiters instead of "{{" "}}": the generated
// code is full of JSON, JavaScript object literals and f-strings, so the usual
// braces would clash. Only three actions appear in them, so instead of pulling
// in a template engine this file implements exactly that subset:
//
//   <<define "name">> ... <<end>>   a named template, one per capability/language
//   <<if .Field>> ... <<end>>       emitted only when Field is truthy
//   <<.Field>>                      interpolate Field
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** Values a template may interpolate or branch on. */
export type TemplateValues = Record<string, string | boolean>;

type Node =
  | { kind: "text"; text: string }
  | { kind: "field"; field: string }
  | { kind: "if"; field: string; body: Node[] };

type Token = { kind: "text"; text: string } | { kind: "action"; text: string };

const DEFINE = /^define\s+"([^"]+)"$/;
const IF = /^if\s+\.([A-Za-z_]\w*)$/;
const FIELD = /^\.([A-Za-z_]\w*)$/;

function tokenize(src: string, file: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("<<", i);
    if (open === -1) {
      tokens.push({ kind: "text", text: src.slice(i) });
      break;
    }
    if (open > i) tokens.push({ kind: "text", text: src.slice(i, open) });
    const close = src.indexOf(">>", open + 2);
    if (close === -1) throw new Error(`${file}: unclosed "<<" action`);
    tokens.push({ kind: "action", text: src.slice(open + 2, close).trim() });
    i = close + 2;
  }
  return tokens;
}

/** parseNodes consumes tokens up to the "end" that closes the current block. */
function parseNodes(tokens: Token[], start: number, file: string): { nodes: Node[]; next: number } {
  const nodes: Node[] = [];
  let i = start;
  while (i < tokens.length) {
    const token = tokens[i]!;
    i++;
    if (token.kind === "text") {
      nodes.push({ kind: "text", text: token.text });
      continue;
    }
    if (token.text === "end") return { nodes, next: i };

    const conditional = IF.exec(token.text);
    if (conditional) {
      const inner = parseNodes(tokens, i, file);
      nodes.push({ kind: "if", field: conditional[1]!, body: inner.nodes });
      i = inner.next;
      continue;
    }
    const field = FIELD.exec(token.text);
    if (field) {
      nodes.push({ kind: "field", field: field[1]! });
      continue;
    }
    throw new Error(`${file}: unsupported action "<<${token.text}>>"`);
  }
  throw new Error(`${file}: missing "<<end>>"`);
}

function parseFile(src: string, file: string): Map<string, Node[]> {
  const tokens = tokenize(src, file);
  const out = new Map<string, Node[]>();
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    i++;
    if (token.kind === "text") {
      // Only the blank lines between two define blocks may live at this level.
      if (token.text.trim() !== "") throw new Error(`${file}: text outside a define block`);
      continue;
    }
    const define = DEFINE.exec(token.text);
    if (!define) throw new Error(`${file}: expected a define action, got "<<${token.text}>>"`);
    const name = define[1]!;
    if (out.has(name)) throw new Error(`${file}: template ${name} is defined twice`);
    const body = parseNodes(tokens, i, file);
    out.set(name, body.nodes);
    i = body.next;
  }
  return out;
}

const templateDir = fileURLToPath(new URL("../templates/", import.meta.url));

function loadTemplates(): Map<string, Node[]> {
  const all = new Map<string, Node[]>();
  for (const entry of readdirSync(templateDir).sort()) {
    if (!entry.endsWith(".tmpl")) continue;
    for (const [name, nodes] of parseFile(readFileSync(join(templateDir, entry), "utf8"), entry)) {
      if (all.has(name)) throw new Error(`${entry}: template ${name} is already defined in another file`);
      all.set(name, nodes);
    }
  }
  return all;
}

// Parsed once, so a broken template fails on import rather than on first use.
const templates = loadTemplates();

function lookup(values: TemplateValues, field: string, name: string): string | boolean {
  if (!(field in values)) throw new Error(`render ${name}: no field named ${field}`);
  return values[field]!;
}

function renderNodes(nodes: Node[], values: TemplateValues, name: string): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out += node.text;
        break;
      case "field": {
        const value = lookup(values, node.field, name);
        if (typeof value !== "string") {
          throw new Error(`render ${name}: field ${node.field} is not a string`);
        }
        out += value;
        break;
      }
      case "if": {
        const value = lookup(values, node.field, name);
        if (typeof value === "string" ? value !== "" : value) {
          out += renderNodes(node.body, values, name);
        }
        break;
      }
    }
  }
  return out;
}

/** trimBlankEdges drops leading and trailing newlines and adds exactly one back. */
function trimBlankEdges(s: string): string {
  return s.replace(/^\n+/, "").replace(/\n+$/, "") + "\n";
}

/** render executes the named template, e.g. "tts.python". */
export function render(name: string, values: TemplateValues): string {
  const nodes = templates.get(name);
  if (!nodes) throw new Error(`no template named ${name}`);
  return trimBlankEdges(renderNodes(nodes, values, name));
}

/** templateNames lists every defined template, which the tests use as a census. */
export function templateNames(): string[] {
  return [...templates.keys()].sort();
}

// Läs/skriv ett fält i en sektions content via en KONKRET resolved-path som
// OverflowFlag.fieldPath producerar (verify-budgets.ts): namn-segment + [index],
// t.ex. "phases[0].objective", "phases[1].activities[3]", "rows[2].requirement",
// "checkpoints[0]". Rena funktioner, inga beroenden — delas mellan editor och test.

type Token = string | number;

/** Tokeniserar "phases[1].activities[3]" → ["phases", 1, "activities", 3]. */
function tokenize(path: string): Token[] {
  const tokens: Token[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    tokens.push(m[2] !== undefined ? Number(m[2]) : m[1]);
  }
  return tokens;
}

function isIndexable(node: unknown): node is Record<string | number, unknown> {
  return typeof node === "object" && node !== null;
}

/** Värdet vid path, eller undefined om någon del av vägen saknas. */
export function getFieldValue(content: unknown, path: string): unknown {
  let node: unknown = content;
  for (const token of tokenize(path)) {
    if (!isIndexable(node)) return undefined;
    node = node[token];
  }
  return node;
}

/**
 * Returnerar en ny struktur med `value` satt vid path; klonar bara noderna längs
 * vägen (React-immutabilitet), övrigt delas. Saknad väg → returnerar content oförändrat.
 */
export function setFieldValue(content: unknown, path: string, value: unknown): unknown {
  const tokens = tokenize(path);
  if (tokens.length === 0) return content;

  function recurse(node: unknown, depth: number): unknown {
    const token = tokens[depth];
    if (!isIndexable(node) || !(token in node)) return node; // saknad väg → no-op
    const clone = (
      Array.isArray(node) ? [...(node as unknown[])] : { ...node }
    ) as Record<string | number, unknown>;
    clone[token] = depth === tokens.length - 1 ? value : recurse(node[token], depth + 1);
    return clone;
  }

  return recurse(content, 0);
}

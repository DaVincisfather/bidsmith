import type { FieldBudgets, OverflowFlag } from "./budget-types";

/**
 * Field metadata: maps budget-key path to slide-index + human label template.
 * Update when adding new templates or budget paths.
 *
 * Label-template uses {N} for 1-indexed phase number, {N+1} for 1-indexed array index.
 */
type FieldMetadata = { slide: number; labelTemplate: string };

// slide values are 1-indexed deck pagination (matches printed deck + Pre-export checklist UI).
const FIELD_METADATA: Record<string, FieldMetadata> = {
  "phases[*].name": { slide: 6, labelTemplate: "Fas {N} — Namn" },
  "phases[*].period": { slide: 6, labelTemplate: "Fas {N} — Period" },
  "phases[*].objective": { slide: 7, labelTemplate: "Fas {N} — Mål" },
  "phases[*].activities[*]": { slide: 7, labelTemplate: "Fas {N} — Aktivitet {N+1}" },
  "phases[*].deliverables[*]": { slide: 7, labelTemplate: "Fas {N} — Leverabel {N+1}" },
  "phases[*].decisions[*]": { slide: 7, labelTemplate: "Fas {N} — Beslut {N+1}" },
  "checkpoints[*]": { slide: 11, labelTemplate: "Avstämningspunkt {N+1}" },
  "certs[*].description": { slide: 18, labelTemplate: "Cert {N+1} — Beskrivning" },
};

type ResolvedLeaf = { resolvedPath: string; value: unknown; indices: number[] };

/**
 * Resolves a budget-key path against data, returning all leaf values.
 *
 * Path syntax:
 * - "field"           → obj.field
 * - "field[*]"        → obj.field[i] for all i
 * - "a[*].b"          → obj.a[i].b for all i
 * - "a[*].b[*]"       → obj.a[i].b[j] for all i, j
 */
function resolveLeaves(obj: unknown, path: string): ResolvedLeaf[] {
  const segments = path.split(".");
  type Pending = { node: unknown; resolvedPath: string; indices: number[] };
  let pending: Pending[] = [{ node: obj, resolvedPath: "", indices: [] }];

  for (const segment of segments) {
    const next: Pending[] = [];
    const wildcardSplit = segment.match(/^([^[]+)(\[\*\])?$/);
    if (!wildcardSplit) return [];
    const fieldName = wildcardSplit[1];
    const isWildcard = wildcardSplit[2] === "[*]";

    for (const p of pending) {
      if (typeof p.node !== "object" || p.node === null) continue;
      const child = (p.node as Record<string, unknown>)[fieldName];
      if (child === undefined) continue;

      const fieldPath = p.resolvedPath === "" ? fieldName : `${p.resolvedPath}.${fieldName}`;

      if (isWildcard) {
        if (!Array.isArray(child)) continue;
        child.forEach((item, idx) => {
          next.push({
            node: item,
            resolvedPath: `${fieldPath}[${idx}]`,
            indices: [...p.indices, idx],
          });
        });
      } else {
        next.push({ node: child, resolvedPath: fieldPath, indices: p.indices });
      }
    }
    pending = next;
  }

  return pending.map((p) => ({ resolvedPath: p.resolvedPath, value: p.node, indices: p.indices }));
}

function buildLabel(template: string, indices: number[]): string {
  let result = template;
  if (indices.length === 1) {
    result = result.replace(/\{N\+1\}/g, String(indices[0] + 1));
    result = result.replace(/\{N\}/g, String(indices[0] + 1));
  } else if (indices.length >= 2) {
    result = result.replace(/\{N\}/g, String(indices[0] + 1));
    result = result.replace(/\{N\+1\}/g, String(indices[1] + 1));
  }
  return result;
}

export function verifyFieldBudgets(
  data: unknown,
  budgets: FieldBudgets,
): { pass: boolean; overflows: OverflowFlag[] } {
  const overflows: OverflowFlag[] = [];

  for (const [path, budget] of Object.entries(budgets)) {
    const meta = FIELD_METADATA[path];
    if (!meta) {
      // Catches config drift: a budget key was added to template_configs without
      // a matching FIELD_METADATA entry. Without the warning the field would be
      // silently un-verified.
      console.warn(
        `[verify-budgets] budget key '${path}' has no FIELD_METADATA entry — skipping. Add to FIELD_METADATA or remove from template_configs.`,
      );
      continue;
    }

    const leaves = resolveLeaves(data, path);
    for (const leaf of leaves) {
      if (typeof leaf.value !== "string") continue;
      if (leaf.value.length > budget) {
        overflows.push({
          slide: meta.slide,
          fieldPath: leaf.resolvedPath,
          fieldLabel: buildLabel(meta.labelTemplate, leaf.indices),
          length: leaf.value.length,
          budget,
        });
      }
    }
  }

  return { pass: overflows.length === 0, overflows };
}

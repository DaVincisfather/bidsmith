import type { BudgetPlan, OverflowFlag } from "./budget-types";

/**
 * Field labels: maps budget-key path to a human label template. Labels are
 * field-model semantics (template-independent), so they stay in code — the
 * manifest only carries which slide a field lands on (BudgetPlan.fieldSlides).
 *
 * Label-template uses {N} for 1-indexed phase number, {N+1} for 1-indexed array index.
 */
const FIELD_LABELS: Record<string, string> = {
  "phases[*].name": "Fas {N} — Namn",
  "phases[*].period": "Fas {N} — Period",
  "phases[*].objective": "Fas {N} — Mål",
  "phases[*].activities[*]": "Fas {N} — Aktivitet {N+1}",
  "phases[*].deliverables[*]": "Fas {N} — Leverabel {N+1}",
  "phases[*].decisions[*]": "Fas {N} — Beslut {N+1}",
  "checkpoints[*]": "Avstämningspunkt {N+1}",
  "certs[*].description": "Cert {N+1} — Beskrivning",
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
  plan: BudgetPlan,
): { pass: boolean; overflows: OverflowFlag[] } {
  const overflows: OverflowFlag[] = [];

  for (const [path, budget] of Object.entries(plan.budgets)) {
    // 1-indexed deck slide comes from the manifest now. A budget without a
    // fieldSlides entry is still verified (manifests must always be verified) —
    // it falls back to slide 0 with a drift-warning naming the path, mirroring
    // the old FIELD_METADATA-drift philosophy.
    const slide = plan.fieldSlides[path];
    if (slide === undefined) {
      console.warn(
        `[verify-budgets] budget key '${path}' har ingen fieldSlides-post i manifestet — verifierar med slide 0. Lägg till fieldSlides[${path}] i manifestet.`,
      );
    }
    const resolvedSlide = slide ?? 0;

    // Unknown field (budget from a manifest without a label entry) is still
    // verified, with the raw path as label.
    const labelTemplate = FIELD_LABELS[path] ?? path;

    const leaves = resolveLeaves(data, path);
    for (const leaf of leaves) {
      if (typeof leaf.value !== "string") continue;
      if (leaf.value.length > budget) {
        overflows.push({
          slide: resolvedSlide,
          fieldPath: leaf.resolvedPath,
          fieldLabel: buildLabel(labelTemplate, leaf.indices),
          length: leaf.value.length,
          budget,
        });
      }
    }
  }

  return { pass: overflows.length === 0, overflows };
}

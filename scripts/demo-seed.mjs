// Seeds a running Bidsmith instance with the bundled synthetic demo data and runs
// the full pipeline once: CV upload → RFP analysis → matching → go/no-go → bid
// generation → PPTX export. The result is a browsable, pre-computed workspace —
// used to build the public demo instance, and handy as an end-to-end smoke test.
//
// NOTE: the analysis/matching/go-no-go/bid steps call the Anthropic API through the
// app and cost real money (single-digit dollars). Point .env.local at the instance
// you intend to seed before running.
//
// Usage (dev server must be running):
//   node scripts/demo-seed.mjs [--base http://localhost:3000] [--rfp rfp-1.md] [--team 3]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mintSessionCookies } from "./dev-session-cookies.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : fallback;
}
const BASE = arg("--base", "http://localhost:3000");
const RFP = arg("--rfp", "rfp-1.md");
const TEAM_SIZE = Number(arg("--team", "3"));
const CV_DIR = path.join("data", "synthetic", "konsult cv");
const RFP_DIR = path.join("data", "synthetic", "rfps");

const cookie = await mintSessionCookies("demo@bidsmith.local");

async function call(route, init = {}, expectJson = true) {
  const res = await fetch(`${BASE}${route}`, {
    ...init,
    headers: { Cookie: cookie, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init.method ?? "GET"} ${route} → ${res.status}: ${body.slice(0, 400)}`);
  }
  return expectJson ? res.json() : res;
}

function mdFile(dir, name) {
  return new Blob([readFileSync(path.join(dir, name))], { type: "text/markdown" });
}

// 1. Upload every synthetic CV (extraction runs per file inside the route).
const cvNames = readdirSync(CV_DIR).filter((f) => f.endsWith(".md")).sort();
console.log(`1/6 Uploading ${cvNames.length} consultant CVs …`);
const fd = new FormData();
for (const name of cvNames) fd.append("files", mdFile(CV_DIR, name), name);
const uploaded = await call("/api/consultants/upload", { method: "POST", body: fd });
const results = uploaded.results ?? uploaded;
const failed = results.filter((r) => r.error);
if (failed.length) throw new Error(`CV upload failures: ${JSON.stringify(failed)}`);
console.log(`    ${results.length} consultants created`);

// 2. Analyze the demo RFP.
console.log(`2/6 Analyzing ${RFP} …`);
const rfpFd = new FormData();
rfpFd.append("file", mdFile(RFP_DIR, RFP), RFP);
const analysis = await call("/api/analyze", { method: "POST", body: rfpFd });
console.log(`    analysis ${analysis.id}`);

// 3. Run consultant matching for the analysis.
console.log("3/6 Matching consultants …");
const match = await call(`/api/matches/${analysis.id}`, { method: "POST" });
const team = [...match.scoredConsultants]
  .sort((a, b) => b.score - a.score)
  .slice(0, TEAM_SIZE);
console.log(team.map((c) => `    ${c.score}  ${c.consultantName} (${c.level})`).join("\n"));
const teamConsultantIds = team.map((c) => c.consultantId);

// 4. Go/no-go assessment for the top team, then record the "go" decision.
console.log("4/6 Go/no-go assessment …");
const assessment = await call("/api/go-no-go", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ analysisId: analysis.id, teamConsultantIds }),
});
await call(`/api/go-no-go/${assessment.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ decision: "go" }),
});
console.log(`    assessment ${assessment.id} → go`);

// 5. Generate the bid (async server-side) and poll until it leaves "generating".
//    Individual sections can fail on transient model hiccups (the export route
//    refuses partial bids), so a failed attempt is deleted and retried once.
console.log("5/6 Generating bid …");
async function generateBid() {
  const bid = await call("/api/bids", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId: analysis.id, assessmentId: assessment.id, teamConsultantIds }),
  });
  let info = bid;
  const t0 = Date.now();
  while (info.status === "generating") {
    if (Date.now() - t0 > 10 * 60 * 1000) throw new Error("bid generation timed out after 10 min");
    await new Promise((r) => setTimeout(r, 5000));
    info = await call(`/api/bids/${bid.id}`);
    process.stdout.write(".");
  }
  return { ...info, id: bid.id };
}
const bidOk = (b) => b.status === "draft" && (b.failedBundles ?? []).length === 0;
let bid = await generateBid();
if (!bidOk(bid)) {
  console.log(`\n    attempt incomplete (status ${bid.status}, failed: ${JSON.stringify(bid.failedBundles ?? [])}) — retrying once`);
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await service.from("bids").delete().eq("id", bid.id);
  bid = await generateBid();
  if (!bidOk(bid)) throw new Error(`bid generation incomplete after retry (status ${bid.status}, failed: ${JSON.stringify(bid.failedBundles ?? [])})`);
}
console.log(`\n    bid ${bid.id} → ${bid.status}`);

// 6. Export the PPTX to verify the full chain end-to-end.
console.log("6/6 Exporting PPTX …");
const exportRes = await call(`/api/bids/${bid.id}/export`, {}, false);
const out = arg("--out", "tmp/demo-bid.pptx");
writeFileSync(out, Buffer.from(await exportRes.arrayBuffer()));
console.log(`    saved ${out}`);
console.log("Done. Workspace is seeded and fully pre-computed.");

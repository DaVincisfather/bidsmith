# Bid Planner — Manual Prompt Eval Journal

Purpose: track planner output quality against real RFPs as prompts evolve.

## How to run

```
# From repo root, with a real RfpAnalysis + team loaded in the DB:
npm run dev
# Trigger bid generation via the app UI, inspect console logs for:
# - [bid-planner] raw plan
# - [bid-plan-validator] repair actions
# - [bid-generator] unmapped requirements
```

Or unit-style:

```
# In a scratch script that constructs a BidContext and calls planBid directly
```

## Eval criteria

For each real RFP tested, score the planner's output on:

1. **Structural fit** — does the section list match what a good consultant would propose for this RFP? (1-5)
2. **Format variation** — does the plan use three-column/bullets/phases where appropriate, or does it fall back to prose? (1-5)
3. **Required sections** — are all 7 required `semanticKey` values present? (pass/fail — validator should always repair, but the raw plan should ideally already have them)
4. **Unmapped requirements** — were there real RFP requirements that didn't fit any format? How many? Is the `unmappedRequirements` list accurate?
5. **Rationale quality** — is the `rationale` field meaningful or generic?

## RFP eval log

### RFP #1 — [TBD during manual eval]

- **File:** tmp/rfp-1.pdf
- **Domain:** 
- **Date tested:** 
- **Scores:** structural _, variation _, required _/7, unmapped _, rationale _
- **Notes:** 
- **Prompt changes suggested:** 

### RFP #2 — [TBD]

...

## Prompt change log

| Date | File | Change | Reason |
|---|---|---|---|
| 2026-04-11 | bid-planner.ts | Initial system prompt | MVP baseline |

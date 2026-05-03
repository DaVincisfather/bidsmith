-- Migration 018: bids.overflow_flags column for PPTX corrector pipeline
-- Spec: docs/superpowers/specs/2026-05-03-pptx-corrector-design.md
-- Plan: docs/superpowers/plans/2026-05-03-pptx-corrector.md (Task 2)
--
-- Persisterar OverflowFlag[] (slide, fieldPath, fieldLabel, length, budget)
-- per bid. Populeras av bid-generator efter retry-cap. Editeras av bid-editor
-- live när konsulten korrigerar fält. Ärver befintlig RLS på bids.

alter table bids
  add column overflow_flags jsonb not null default '[]'::jsonb;

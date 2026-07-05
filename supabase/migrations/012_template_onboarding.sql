-- 012_template_onboarding.sql — onboarding-wizard för kundmallar (slice 5-UI).
-- Appliceras manuellt via Supabase SQL Editor.

-- Främmande mallar kan inte producera ett manifest förrän de onboardats —
-- foreign-raden bär manifest = null tills vidare (profilen är dess sanning).
alter table templates alter column manifest drop not null;

-- none = token-bärande mall (dagens väg, default för alla befintliga rader);
-- needs_onboarding → classifying → draft → onboarded är kundmall-vägen.
alter table templates add column onboarding_status text not null default 'none'
  check (onboarding_status in ('none','needs_onboarding','classifying','draft','onboarded'));

-- Klassificeringsförslaget + användarens slot-beslut (OnboardingDraftSchema i
-- src/lib/pptx-template/onboarding/draft.ts). Även fel-/precount-payloads
-- ({ error } resp. { precount }) bor här — se draft.ts.
alter table templates add column onboarding_draft jsonb;

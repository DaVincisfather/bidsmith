-- Migration 019: auto-update template_configs.updated_at on row UPDATE
-- Soft flag #4 från PR #44 routine-review: utan trigger måste Stefan manuellt
-- sätta updated_at = now() vid budget-justeringar via SQL Editor. Trivial fix.

create or replace function trigger_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger template_configs_updated_at
  before update on template_configs
  for each row
  execute function trigger_set_updated_at();

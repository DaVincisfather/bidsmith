-- Optional demo data. Not auto-applied. Run manually in Supabase SQL Editor if you want sample radar competencies.
-- Sourced from migration 005 (Ekan/Nordia-style Swedish public sector competency areas).
-- organization_id column has been removed — single-workspace model.

insert into organization_competencies (name, description, keywords, cpv_codes) values
  ('Ekonomiska informationsmodeller',
   'Strukturer som möjliggör dynamisk styrning. Vi hjälper kunder att skapa en tydlig, enhetlig och hållbar ekonomisk informationsmodell som blir navet för styrning, rapportering och analys. Vår roll blir som brobyggare mellan ekonomi/finans, verksamhet och IT genom att kombinera kompetens inom ekonomiprocesser och komplex informationshantering med förändringsledning.',
   ARRAY['ekonomistyrning', 'informationsmodell', 'beslutsstöd', 'rapportering', 'styrmodell', 'datastruktur'],
   ARRAY['79412000']),

  ('Ekonomi & beslutsstödssystem',
   'Vi hjälper organisationer att definiera behov, kravställa och upphandla ekonomi- och beslutsstödssystem som stödjer strategin och verksamhetens arbetssätt. Vi agerar som oberoende partner genom hela processen – från behovsanalys och marknadsdialog till leverantörsval, kontrakt och införande.',
   ARRAY['ekonomisystem', 'beslutsstöd', 'kravställning', 'upphandling', 'systemimplementation', 'ERP'],
   ARRAY['79412000', '72000000']),

  ('Dynamiska ekonomiprocesser',
   'Vi hjälper organisationer att införa dynamiska ekonomiprocesser som bygger på Beyond Budgeting-principer – där resurser, prognoser och mål uppdateras kontinuerligt. Genom adaptiva styrmodeller, decentraliserat ledarskap och rullande prognoser skapar vi en ekonomi som är flexibel, transparent och strategiskt anpassningsbar.',
   ARRAY['beyond budgeting', 'rullande prognoser', 'dynamisk styrning', 'budgetprocess', 'ekonomiprocess'],
   ARRAY['79411000', '79412000']),

  ('Strategisk processorientering',
   'Ekan Management stöttar organisationer att etablera en relevant processarkitektur, utveckla roller och styrmodeller samt bygga den förmåga som krävs för att leda och förbättra processbaserad organisation över tid. Resultatet är ökad samverkan, tydligare prioriteringar och en målinriktad organisation.',
   ARRAY['processorientering', 'processarkitektur', 'verksamhetsutveckling', 'lean', 'förbättringsarbete'],
   ARRAY['79411000', '79420000']);

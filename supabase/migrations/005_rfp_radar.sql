-- Organization competency areas (for matching against procurement notices)
CREATE TABLE organization_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  cpv_codes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_competencies_org ON organization_competencies(organization_id);

-- RFP opportunities fetched from TED
CREATE TABLE rfp_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) NOT NULL,
  ted_notice_id text NOT NULL,
  title text NOT NULL,
  buyer text,
  country text NOT NULL DEFAULT 'SWE',
  cpv_codes text[] NOT NULL DEFAULT '{}',
  deadline timestamptz,
  estimated_value numeric,
  summary text,
  ted_url text,
  raw_xml text,
  relevance_score integer,
  relevance_reasoning text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'scored', 'dismissed', 'analyzing', 'analyzed')),
  analysis_id uuid REFERENCES analyses(id),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  scored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, ted_notice_id)
);

CREATE INDEX idx_opportunities_org_status ON rfp_opportunities(organization_id, status);
CREATE INDEX idx_opportunities_score ON rfp_opportunities(relevance_score DESC NULLS LAST);

-- Seed competency data for dev organization (Nordia Management AB / Ekan-style)
INSERT INTO organization_competencies (organization_id, name, description, keywords, cpv_codes) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'Ekonomiska informationsmodeller',
   'Strukturer som möjliggör dynamisk styrning. Vi hjälper kunder att skapa en tydlig, enhetlig och hållbar ekonomisk informationsmodell som blir navet för styrning, rapportering och analys. Vår roll blir som brobyggare mellan ekonomi/finans, verksamhet och IT genom att kombinera kompetens inom ekonomiprocesser och komplex informationshantering med förändringsledning.',
   ARRAY['ekonomistyrning', 'informationsmodell', 'beslutsstöd', 'rapportering', 'styrmodell', 'datastruktur'],
   ARRAY['79412000']),

  ('00000000-0000-0000-0000-000000000001',
   'Ekonomi & beslutsstödssystem',
   'Vi hjälper organisationer att definiera behov, kravställa och upphandla ekonomi- och beslutsstödssystem som stödjer strategin och verksamhetens arbetssätt. Vi agerar som oberoende partner genom hela processen – från behovsanalys och marknadsdialog till leverantörsval, kontrakt och införande.',
   ARRAY['ekonomisystem', 'beslutsstöd', 'kravställning', 'upphandling', 'systemimplementation', 'ERP'],
   ARRAY['79412000', '72000000']),

  ('00000000-0000-0000-0000-000000000001',
   'Dynamiska ekonomiprocesser',
   'Vi hjälper organisationer att införa dynamiska ekonomiprocesser som bygger på Beyond Budgeting-principer – där resurser, prognoser och mål uppdateras kontinuerligt. Genom adaptiva styrmodeller, decentraliserat ledarskap och rullande prognoser skapar vi en ekonomi som är flexibel, transparent och strategiskt anpassningsbar.',
   ARRAY['beyond budgeting', 'rullande prognoser', 'dynamisk styrning', 'budgetprocess', 'ekonomiprocess'],
   ARRAY['79411000', '79412000']),

  ('00000000-0000-0000-0000-000000000001',
   'Strategisk processorientering',
   'Ekan Management stöttar organisationer att etablera en relevant processarkitektur, utveckla roller och styrmodeller samt bygga den förmåga som krävs för att leda och förbättra processbaserad organisation över tid. Resultatet är ökad samverkan, tydligare prioriteringar och en målinriktad organisation.',
   ARRAY['processorientering', 'processarkitektur', 'verksamhetsutveckling', 'lean', 'förbättringsarbete'],
   ARRAY['79411000', '79420000']);

-- SOW-to-Invoice Planner migration
-- Run this in the Supabase SQL editor

-- ─── sow_documents ────────────────────────────────────────────────────────────
CREATE TABLE sow_documents (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_revenue_item_id UUID NOT NULL REFERENCES manual_revenue_items(id) ON DELETE CASCADE,
  document_type          TEXT NOT NULL DEFAULT 'original'
                         CHECK (document_type IN ('original','amendment','change_request')),
  version_number         INTEGER NOT NULL DEFAULT 1,
  file_name              TEXT NOT NULL,
  file_type              TEXT NOT NULL CHECK (file_type IN (
                           'application/pdf',
                           'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  storage_path           TEXT NOT NULL,
  file_size_bytes        INTEGER,
  parsed_client_name     TEXT,
  parsed_total_value_sek NUMERIC,
  parsed_start_date      DATE,
  parsed_end_date        DATE,
  parsed_payment_terms   TEXT,
  parsed_deliverables    JSONB,
  parsed_raw             JSONB,
  parse_status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK (parse_status IN ('pending','parsing','done','error')),
  parse_error            TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sow_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access on sow_documents"
  ON sow_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE invoices (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_revenue_item_id UUID NOT NULL REFERENCES manual_revenue_items(id) ON DELETE CASCADE,
  sow_document_id        UUID REFERENCES sow_documents(id) ON DELETE SET NULL,
  invoice_number         TEXT NOT NULL,
  issue_date             DATE NOT NULL,
  due_date               DATE NOT NULL,
  amount_sek             NUMERIC NOT NULL,
  payment_trigger        TEXT NOT NULL DEFAULT 'date'
                         CHECK (payment_trigger IN ('date','milestone')),
  milestone_label        TEXT,
  status                 TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','sent','paid','overdue')),
  paid_date              DATE,
  notes                  TEXT,
  sort                   INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access on invoices"
  ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Storage bucket ───────────────────────────────────────────────────────────
-- Run this separately or via the Supabase dashboard:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('sow-documents', 'sow-documents', false);
-- CREATE POLICY "authenticated access on sow-documents" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'sow-documents') WITH CHECK (bucket_id = 'sow-documents');

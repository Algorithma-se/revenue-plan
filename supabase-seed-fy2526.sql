-- =============================================================================
-- Revenue Plan Data Seed — FY 25/26
-- =============================================================================
-- Input fields only (no calculated totals, no #FTE rows).
-- Amounts: SEK (kSEK × 1000). Months: first of month DATE.
--
-- Safe to re-run: uses ON CONFLICT DO UPDATE for plan_targets.
-- For revenue/cost items: run once on empty tables, or clear first:
--   DELETE FROM plan_revenue_cells;
--   DELETE FROM manual_revenue_items;
--   DELETE FROM plan_cost_cells;
--   DELETE FROM cost_items;
-- =============================================================================

DO $$
DECLARE
  v_pod_a   UUID;
  v_pod_b   UUID;
  v_pod_c   UUID;
  v_algo    UUID;
  v_nopod   UUID;
  v_item    UUID;
BEGIN
  SELECT id INTO v_pod_a  FROM pods WHERE name = 'Pod A';
  SELECT id INTO v_pod_b  FROM pods WHERE name = 'Pod B';
  SELECT id INTO v_pod_c  FROM pods WHERE name = 'Pod C';
  SELECT id INTO v_algo   FROM pods WHERE name = 'Algorithma Technologies';
  SELECT id INTO v_nopod  FROM pods WHERE name = 'Other NoPod';

  -- ── POD A — REVENUE ──────────────────────────────────────────────────────────

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'Remotion/Nestit', 10) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01', 183000,'A'),(v_item,'2025-09-01', 368500,'A'),(v_item,'2025-10-01', 201300,'A'),
    (v_item,'2025-11-01',  17600,'A'),(v_item,'2025-12-01',  23100,'A'),(v_item,'2026-01-01', 145200,'A'),
    (v_item,'2026-02-01', 132000,'A'),(v_item,'2026-03-01',  75900,'A'),(v_item,'2026-04-01', 206800,'A'),
    (v_item,'2026-05-01', 125000,'B'),(v_item,'2026-06-01', 120000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'Kinnevik (recurring)', 20) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01',8000,'A'),(v_item,'2025-09-01',8000,'A'),(v_item,'2025-10-01',8000,'B'),
    (v_item,'2025-11-01',8000,'B'),(v_item,'2025-12-01',8000,'B'),(v_item,'2026-01-01',8000,'B'),
    (v_item,'2026-02-01',8000,'B'),(v_item,'2026-03-01',8000,'B'),(v_item,'2026-04-01',8000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'ByggMax', 30) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01',  93000,'A'),(v_item,'2025-09-01', 167200,'A'),(v_item,'2025-10-01', 170200,'A'),
    (v_item,'2025-11-01', 190000,'A'),(v_item,'2025-12-01', 343600,'A'),(v_item,'2026-01-01', 348100,'A'),
    (v_item,'2026-02-01', 423500,'A'),(v_item,'2026-03-01', 178000,'A'),(v_item,'2026-04-01', 150600,'A');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'Byggmax recurring', 40) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-11-01', 110800,'A'),(v_item,'2026-04-01', 90000,'A'),(v_item,'2026-05-01', 102500,'A');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'Byggmax Platform & management', 50) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-05-01',50000,'B'),(v_item,'2026-06-01',50000,'B'),(v_item,'2026-07-01',50000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'Byggmax customer service development', 60) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-05-01',105000,'B'),(v_item,'2026-06-01',105000,'B'),(v_item,'2026-07-01',40000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'Byggmax Total & Direkt', 70) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-05-01',190000,'B'),(v_item,'2026-06-01',224000,'B'),(v_item,'2026-07-01',50000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'Enkl', 80) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01',96000,'A'),(v_item,'2025-09-01',45500,'A');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'WeSports', 90) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-09-01',20000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'SSE VOC', 100) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-05-01',300000,'B'),(v_item,'2026-06-01',300000,'B'),(v_item,'2026-07-01',100000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'CDON / Fyndiq', 110) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-10-01',149500,'A'),(v_item,'2025-11-01',158300,'A'),(v_item,'2025-12-01',100000,'A'),
    (v_item,'2026-01-01', 49000,'A'),(v_item,'2026-02-01', 55700,'A'),(v_item,'2026-03-01', 82000,'A'),
    (v_item,'2026-04-01', 57000,'A'),(v_item,'2026-05-01', 25000,'B'),(v_item,'2026-06-01', 25000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'CDON recurring', 120) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-09-01',40000,'A'),(v_item,'2025-10-01',70000,'A'),(v_item,'2025-11-01',60000,'A'),
    (v_item,'2025-12-01',45000,'A'),(v_item,'2026-01-01',45000,'A'),(v_item,'2026-02-01',45000,'A'),
    (v_item,'2026-03-01',45000,'A'),(v_item,'2026-04-01',45000,'A'),(v_item,'2026-05-01',45000,'B'),
    (v_item,'2026-06-01',45000,'B'),(v_item,'2026-07-01',45000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_a, 'Musti Group', 130) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-05-01',156000,'B'),(v_item,'2026-06-01',312000,'B'),(v_item,'2026-07-01',78000,'B');

  -- ── POD A — COSTS ─────────────────────────────────────────────────────────────

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_pod_a, 'Salary', 10) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-04-01',373000,'A'),(v_item,'2026-05-01',375000,'B'),
    (v_item,'2026-06-01',362000,'B'),(v_item,'2026-07-01',192000,'B');

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_pod_a, 'GCP', 20) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-04-01',20000,'A');

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_pod_a, 'OpenAI', 30) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-04-01',36000,'A');

  -- ── POD B — REVENUE ──────────────────────────────────────────────────────────

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_b, 'Movestic', 10) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01',200000,'A'),(v_item,'2025-09-01',160000,'A'),(v_item,'2025-10-01',20350,'A'),
    (v_item,'2025-12-01',  8850,'A'),(v_item,'2026-02-01',  1850,'A'),
    (v_item,'2026-06-01', 25000,'B'),(v_item,'2026-07-01', 25000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_b, 'Alecta Fastigheter', 20) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-01-01', 12000,'A'),(v_item,'2026-02-01', 65000,'A'),
    (v_item,'2026-03-01', 65000,'A'),(v_item,'2026-04-01',207000,'A');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_b, 'Alecta Fastigheter FC', 30) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-05-01',200000,'B'),(v_item,'2026-06-01',200000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_b, 'Coor', 40) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01', 125000,'A'),(v_item,'2025-09-01', 613000,'A'),(v_item,'2025-10-01',1000000,'A'),
    (v_item,'2025-11-01',1000500,'A'),(v_item,'2025-12-01', 376200,'A'),(v_item,'2026-01-01', 236000,'A'),
    (v_item,'2026-02-01', 236000,'A'),(v_item,'2026-03-01', 236000,'A'),(v_item,'2026-04-01', 236000,'A'),
    (v_item,'2026-05-01', 236000,'B'),(v_item,'2026-06-01', 236000,'B'),(v_item,'2026-07-01', 118000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_b, 'Coor extra agent (bid agent)', 50) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-04-01',68300,'A'),(v_item,'2026-05-01',120000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_b, 'Coor extra capacity', 60) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-04-01',50000,'A'),(v_item,'2026-05-01',50000,'F'),
    (v_item,'2026-06-01',50000,'F'),(v_item,'2026-07-01',50000,'F');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_b, 'Coor Advisory', 70) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-03-01',25900,'A'),(v_item,'2026-04-01',14800,'A'),(v_item,'2026-05-01',37000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_b, 'SUSA Capacity', 80) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01',234000,'A'),(v_item,'2025-09-01',150000,'A'),(v_item,'2025-10-01',300000,'A'),
    (v_item,'2025-12-01',212000,'A'),(v_item,'2026-01-01',177000,'A'),(v_item,'2026-02-01',255000,'A'),
    (v_item,'2026-03-01',130000,'A'),(v_item,'2026-04-01',417000,'A'),(v_item,'2026-05-01',315600,'B'),
    (v_item,'2026-06-01',422000,'F'),(v_item,'2026-07-01',211000,'F');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_b, 'Aspia', 90) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-11-01', 45000,'A'),(v_item,'2025-12-01', 70000,'A'),(v_item,'2026-01-01', 35000,'A'),
    (v_item,'2026-04-01',120000,'A'),(v_item,'2026-05-01',280000,'B'),(v_item,'2026-06-01', 25000,'F');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_b, 'Aspia IT service desk (recurring)', 100) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-04-01',30000,'A'),(v_item,'2026-05-01',30000,'A'),
    (v_item,'2026-06-01',30000,'B'),(v_item,'2026-07-01',30000,'B');

  -- ── POD B — COSTS ─────────────────────────────────────────────────────────────

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_pod_b, 'Salary', 10) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-04-01',327000,'A'),(v_item,'2026-05-01',328000,'B'),
    (v_item,'2026-06-01',317000,'B'),(v_item,'2026-07-01',168000,'B');

  -- ── POD C — REVENUE ──────────────────────────────────────────────────────────

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_c, 'Boeing Rave Speedboat', 10) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01',364000,'A'),(v_item,'2025-09-01',364000,'A'),(v_item,'2025-10-01',364000,'A'),
    (v_item,'2025-11-01',364000,'A'),(v_item,'2025-12-01',364000,'A'),
    (v_item,'2026-01-01',230000,'A'),(v_item,'2026-02-01',230000,'A');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_c, 'Boeing Rave Sustainment', 20) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01',105000,'A'),(v_item,'2025-09-01',105000,'A'),(v_item,'2025-10-01',105000,'A'),
    (v_item,'2025-11-01',105000,'A'),(v_item,'2025-12-01',105000,'A');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_c, 'Bohlins Maskiner', 30) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-09-01',30000,'A'),(v_item,'2025-10-01',20000,'A'),(v_item,'2025-11-01',50000,'A');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_c, 'Stena Group', 40) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-04-01',300000,'A'),(v_item,'2026-05-01',350000,'B'),(v_item,'2026-06-01',100000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_c, 'Autoliv', 50) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-09-01',203000,'A'),(v_item,'2025-10-01',272000,'A'),(v_item,'2025-11-01',55000,'A'),
    (v_item,'2025-12-01', 50000,'A'),(v_item,'2026-01-01',     0,'A'),  -- 0 A: month confirmed, no revenue
    (v_item,'2026-02-01',180000,'A'),(v_item,'2026-04-01', 73300,'A'),
    (v_item,'2026-06-01', 73300,'F'),(v_item,'2026-07-01', 73300,'F');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_c, 'Autoliv SCRM recurring', 60) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-01-01',    0,'A'),  -- 0 A: month confirmed, no revenue
    (v_item,'2026-02-01',16500,'A'),(v_item,'2026-03-01',16500,'A'),(v_item,'2026-04-01',16500,'A'),
    (v_item,'2026-06-01',21000,'F'),(v_item,'2026-07-01',21000,'F');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_c, 'BHG Group', 70) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-12-01',285600,'A'),(v_item,'2026-01-01',441250,'A'),(v_item,'2026-02-01',340700,'A'),
    (v_item,'2026-03-01',398000,'A'),(v_item,'2026-04-01',540000,'B'),
    (v_item,'2026-05-01',540000,'B'),(v_item,'2026-06-01',  3000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_pod_c, 'BHG on top', 80) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-05-01',130000,'B'),(v_item,'2026-06-01',280000,'B');

  -- ── POD C — COSTS ─────────────────────────────────────────────────────────────

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_pod_c, 'Salary', 10) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-04-01',653000,'A'),(v_item,'2026-05-01',657000,'B'),
    (v_item,'2026-06-01',633000,'B'),(v_item,'2026-07-01',337000,'B');

  -- ── ALGORITHMA TECHNOLOGIES — REVENUE ────────────────────────────────────────

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_algo, 'Utveckling hej.chat', 10) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-11-01',118000,'A'),(v_item,'2025-12-01',168000,'A'),(v_item,'2026-01-01',196000,'A');

  -- ── OTHER NOPOD — REVENUE ─────────────────────────────────────────────────────

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_nopod, 'Jönköping', 10) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01',60000,'A'),(v_item,'2025-09-01',60000,'A'),(v_item,'2025-10-01',60000,'A'),
    (v_item,'2025-11-01',60000,'A'),(v_item,'2025-12-01',60000,'A');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_nopod, 'Ortoma', 20) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-08-01', 76000,'A'),(v_item,'2025-09-01',167200,'A'),(v_item,'2025-10-01',100000,'A');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_nopod, 'Caverion', 30) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-11-01',15000,'B');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_nopod, 'Afa Försäkring', 40) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2026-04-01',277000,'A'),(v_item,'2026-05-01',403000,'B'),(v_item,'2026-06-01',310000,'F');

  INSERT INTO manual_revenue_items (pod_id, client_name, sort) VALUES (v_nopod, 'Tornum Group (WS)', 50) RETURNING id INTO v_item;
  INSERT INTO plan_revenue_cells (manual_revenue_item_id, month, amount, status) VALUES
    (v_item,'2025-11-01',20000,'A');

  -- ── OTHER NOPOD — OVERHEAD COSTS (Feb–Jul, company-wide) ─────────────────────
  -- These cover Feb–Jul based on the 6-month detailed breakdown in the summary.
  -- Aug–Jan aggregate costs (~1700–2400 kSEK/month) are not broken down per
  -- category in the source — enter those manually or via a bulk cost item.

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_nopod, 'Office costs', 10) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-02-01', 90000,'A'),(v_item,'2026-03-01', 90000,'A'),(v_item,'2026-04-01',100000,'A'),
    (v_item,'2026-05-01',100000,'B'),(v_item,'2026-06-01',100000,'B'),(v_item,'2026-07-01',130000,'B');

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_nopod, 'IT and licenses', 20) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-02-01',175000,'A'),(v_item,'2026-03-01', 76000,'A'),(v_item,'2026-04-01',140000,'A'),
    (v_item,'2026-05-01',140000,'B'),(v_item,'2026-06-01',140000,'B'),(v_item,'2026-07-01',120000,'B');

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_nopod, 'Telecommunications', 30) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-02-01',20000,'A'),(v_item,'2026-03-01',20000,'A'),(v_item,'2026-04-01',20000,'A'),
    (v_item,'2026-05-01',20000,'B'),(v_item,'2026-06-01',20000,'B'),(v_item,'2026-07-01',20000,'B');

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_nopod, 'Travel and internal entertainment', 40) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-02-01',25000,'A'),(v_item,'2026-03-01',20000,'A'),(v_item,'2026-04-01',20000,'A'),
    (v_item,'2026-05-01',35000,'B'),(v_item,'2026-06-01',20000,'B'),(v_item,'2026-07-01',10000,'B');

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_nopod, 'External events and Sales', 50) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-02-01', 2000,'A'),(v_item,'2026-03-01',20000,'A'),(v_item,'2026-04-01', 2000,'A'),
    (v_item,'2026-05-01',22000,'B'),(v_item,'2026-06-01', 2000,'B'),(v_item,'2026-07-01', 2000,'B');

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_nopod, 'Audit, Insurance, and Admin', 60) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-02-01',25000,'A'),(v_item,'2026-03-01', 3000,'A'),(v_item,'2026-04-01', 3000,'A'),
    (v_item,'2026-05-01', 3000,'B'),(v_item,'2026-06-01', 3000,'B'),(v_item,'2026-07-01',25000,'B');

  INSERT INTO cost_items (pod_id, category, sort) VALUES (v_nopod, 'Other costs', 70) RETURNING id INTO v_item;
  INSERT INTO plan_cost_cells (cost_item_id, month, amount, status) VALUES
    (v_item,'2026-02-01',125000,'A'),(v_item,'2026-03-01',135000,'A'),
    -- Apr=0, skipped
    (v_item,'2026-05-01',27000,'B'),
    -- Jun=0, skipped
    (v_item,'2026-07-01',60000,'B');

END $$;

-- ── REVENUE PLAN TARGETS ──────────────────────────────────────────────────────
INSERT INTO plan_targets (month, revenue_target, margin_target) VALUES
  ('2025-08-01', 1500000, 7),
  ('2025-09-01', 2500000, 7),
  ('2025-10-01', 3500000, 7),
  ('2025-11-01', 3500000, 7),
  ('2025-12-01', 3000000, 7),
  ('2026-01-01', 3000000, 7),
  ('2026-02-01', 3500000, 7),
  ('2026-03-01', 4250000, 7),
  ('2026-04-01', 4250000, 7),
  ('2026-05-01', 4250000, 7),
  ('2026-06-01', 4000000, 7),
  ('2026-07-01', 1500000, 7)
ON CONFLICT (month) DO UPDATE SET revenue_target = EXCLUDED.revenue_target;

-- =============================================================================
-- NOTE: Aggregate costs for Aug–Jan (~1700–2400 kSEK/month per the Total Cost
-- summary row) are not included — the source has no per-category breakdown for
-- those months. Add them manually as cost items in the relevant pods or under
-- Other NoPod once you have the breakdown.
-- =============================================================================

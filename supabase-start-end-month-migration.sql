ALTER TABLE revenue_items
  ADD COLUMN IF NOT EXISTS start_month DATE,
  ADD COLUMN IF NOT EXISTS end_month   DATE;

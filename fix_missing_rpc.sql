-- This function is required for the POS system to correctly update stock levels after a sale.
-- Run this in your Supabase SQL Editor.

CREATE OR REPLACE FUNCTION decrement_stock(i_id UUID, amt INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE items
  SET stock_qty = stock_qty - amt
  WHERE id = i_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

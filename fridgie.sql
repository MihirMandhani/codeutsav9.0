-- create DB (run as postgres superuser)
CREATE DATABASE fridgie_db;

-- connect to the DB then run:
\c fridgie_db;

-- Enable uuid-ossp extension (for UUIDs) (optional)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Items table (generic for leftovers, packaged, veggies, fruits)
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('leftover','packaged','veggie','fruit')),
  name TEXT NOT NULL,
  qty TEXT,
  -- days: number of days fresh (nullable for packaged if expiry used)
  days INTEGER,
  expiry_date DATE,
  barcode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_items_updated_at
BEFORE UPDATE ON items
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- Indexes for faster lookups
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_type ON items(type);
CREATE INDEX idx_items_barcode ON items(barcode);
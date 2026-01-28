-- Add brand_color column to businesses table
ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT NULL;

-- Migration: Add unique constraint on categories to prevent duplicates
-- A user cannot have two categories with the same name

-- First, ensure no duplicates exist (consolidate if needed)
WITH min_cats AS (
    SELECT user_id, name, MIN(id) as keep_id 
    FROM categories 
    GROUP BY user_id, name 
    HAVING COUNT(*) > 1
)
UPDATE transactions t
SET category_id = m.keep_id
FROM categories c, min_cats m
WHERE t.category_id = c.id 
  AND c.user_id = m.user_id
  AND c.name = m.name 
  AND c.id != m.keep_id;

-- Delete duplicate categories (keep the one with lowest id)
DELETE FROM categories 
WHERE id NOT IN (
    SELECT MIN(id) FROM categories GROUP BY user_id, name
);

-- Add unique constraint
ALTER TABLE categories 
ADD CONSTRAINT categories_user_name_unique UNIQUE (user_id, name);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_categories_user_name ON categories(user_id, name);

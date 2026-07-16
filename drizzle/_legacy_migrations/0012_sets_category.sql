-- Add "Sets" to the product category enum (necklace + earring sets)
ALTER TABLE products
  MODIFY COLUMN category ENUM(
    'Necklaces', 'Earrings', 'Sets', 'Rings', 'Bracelets',
    'Bangles', 'Anklets', 'Brooches', 'Hair Accessories', 'Other'
  ) NOT NULL;

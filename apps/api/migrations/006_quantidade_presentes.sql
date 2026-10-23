-- Quantas vezes cada presente pode ser dado:
--   1    → presente único (padrão)
--   N    → quantidade definida
--   NULL → ilimitado (cotas, ex.: "Cota lua de mel")
ALTER TABLE presentes
  ADD COLUMN quantidade_maxima integer DEFAULT 1 CHECK (quantidade_maxima IS NULL OR quantidade_maxima > 0);

UPDATE presentes SET quantidade_maxima = NULL WHERE nome ILIKE 'cota%';

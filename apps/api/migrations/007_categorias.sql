-- Categorias da lista de presentes, criadas pelos noivos no painel.
-- Substitui o grupo fixo ('chabar' | 'lar') dos presentes.
CREATE TABLE categorias (
  id         serial PRIMARY KEY,
  nome       text NOT NULL,
  icone      text NOT NULL DEFAULT 'gift',
  ordem      integer NOT NULL DEFAULT 0,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categorias_nome_unico ON categorias (lower(nome));

INSERT INTO categorias (nome, icone, ordem) VALUES
  ('Chá-Bar', 'cocktail', 1),
  ('Para o nosso lar', 'home', 2);

-- Uma categoria com presentes não pode ser apagada sem antes movê-los.
ALTER TABLE presentes ADD COLUMN categoria_id integer REFERENCES categorias (id) ON DELETE RESTRICT;
UPDATE presentes p
   SET categoria_id = c.id
  FROM categorias c
 WHERE c.nome = CASE p.grupo WHEN 'chabar' THEN 'Chá-Bar' ELSE 'Para o nosso lar' END;
ALTER TABLE presentes ALTER COLUMN categoria_id SET NOT NULL;
ALTER TABLE presentes DROP COLUMN grupo;
CREATE INDEX presentes_categoria ON presentes (categoria_id);

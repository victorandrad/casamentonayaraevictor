-- Fotos da galeria do site, enviadas pelos noivos no painel (aba Galeria).
CREATE TABLE galeria_fotos (
  id         serial PRIMARY KEY,
  url        text NOT NULL,
  legenda    text NOT NULL DEFAULT '',
  momento    text NOT NULL DEFAULT 'nos',
  ordem      integer NOT NULL DEFAULT 0,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX galeria_fotos_ordem ON galeria_fotos (ordem, id);

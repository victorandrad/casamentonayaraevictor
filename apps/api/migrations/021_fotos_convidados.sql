-- Fotos e vídeos que os convidados enviam pelo celular (página /fotos). Aparecem no site assim que
-- ficam prontos; os noivos podem ocultar ou excluir no painel. Vídeos chegam como 'processando' e
-- são convertidos em segundo plano (MP4 que toca em qualquer aparelho, sem localização).
CREATE TABLE fotos_convidados (
  id          serial PRIMARY KEY,
  uid         uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tipo        text NOT NULL CHECK (tipo IN ('foto', 'video')),
  estado      text NOT NULL DEFAULT 'pronto' CHECK (estado IN ('processando', 'pronto', 'falhou')),
  -- nome do arquivo na pasta de uploads (convidados/<hex>.jpg|.mp4) e a miniatura (WebP)
  arquivo     text,
  miniatura   text,
  -- vídeo como chegou, esperando a conversão (pasta oculta, nunca servida)
  original    text,
  largura     integer,
  altura      integer,
  duracao     real,
  bytes       bigint NOT NULL DEFAULT 0,
  nome        text NOT NULL DEFAULT '',
  -- hash do token guardado no aparelho de quem enviou: só ele pode excluir pelo site
  autor_hash  text NOT NULL,
  visivel     boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fotos_convidados_site ON fotos_convidados (id DESC) WHERE visivel AND estado = 'pronto';
CREATE INDEX fotos_convidados_fila ON fotos_convidados (id) WHERE estado = 'processando';

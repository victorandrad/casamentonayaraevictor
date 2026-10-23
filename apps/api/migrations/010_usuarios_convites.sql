-- Usuários convidados pelo dono do painel: ficam sem senha até abrirem o link do convite.
ALTER TABLE usuarios ALTER COLUMN senha_hash DROP NOT NULL;

-- Links de convite (guardamos só o hash do token; uso único, com validade).
CREATE TABLE convites_usuario (
  token_hash  text PRIMARY KEY,
  usuario_id  integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em   timestamptz NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX convites_usuario_usuario_idx ON convites_usuario (usuario_id);

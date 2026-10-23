-- Contas dos noivos que acessam o painel
CREATE TABLE usuarios (
  id          serial PRIMARY KEY,
  email       text NOT NULL UNIQUE,
  nome        text NOT NULL,
  senha_hash  text NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- Sessões de login (guardamos só o hash do token do cookie)
CREATE TABLE sessoes (
  token_hash  text PRIMARY KEY,
  usuario_id  integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em   timestamptz NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessoes_expira_em_idx ON sessoes (expira_em);

-- Convites: cada um tem um código único usado no link e no QR Code
CREATE TABLE convidados (
  id                    serial PRIMARY KEY,
  codigo                text NOT NULL UNIQUE,
  nome                  text NOT NULL,
  limite_acompanhantes  smallint NOT NULL DEFAULT 0 CHECK (limite_acompanhantes BETWEEN 0 AND 10),
  criado_em             timestamptz NOT NULL DEFAULT now()
);

-- Resposta do RSVP (no máximo uma por convite)
CREATE TABLE respostas (
  convidado_id   integer PRIMARY KEY REFERENCES convidados(id) ON DELETE CASCADE,
  status         text NOT NULL CHECK (status IN ('sim', 'nao')),
  acompanhantes  smallint NOT NULL DEFAULT 0 CHECK (acompanhantes BETWEEN 0 AND 10),
  mensagem       text NOT NULL DEFAULT '',
  respondido_em  timestamptz NOT NULL DEFAULT now()
);

-- Mural de recados (os noivos podem ocultar)
CREATE TABLE recados (
  id         serial PRIMARY KEY,
  nome       text NOT NULL,
  mensagem   text NOT NULL,
  visivel    boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

-- Lista de presentes
CREATE TABLE presentes (
  id              serial PRIMARY KEY,
  grupo           text NOT NULL CHECK (grupo IN ('chabar', 'lar')),
  nome            text NOT NULL,
  valor_centavos  integer NOT NULL CHECK (valor_centavos >= 0),
  foto_url        text,
  ordem           integer NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

-- Configurações simples chave/valor (ex.: chave Pix)
CREATE TABLE configuracoes (
  chave  text PRIMARY KEY,
  valor  text NOT NULL
);

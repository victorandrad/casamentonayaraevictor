-- Os presentes passam a ser pagos pelo Mercado Pago (Checkout Pro), na conta que os noivos
-- conectam no painel com "Conectar ao Mercado Pago" (OAuth). Os pedidos feitos pelo Stripe
-- continuam no histórico, marcados com gateway = 'stripe'.
ALTER TABLE pedidos ADD COLUMN gateway text NOT NULL DEFAULT 'stripe' CHECK (gateway IN ('stripe', 'mercadopago'));
ALTER TABLE pedidos ALTER COLUMN gateway SET DEFAULT 'mercadopago';
ALTER TABLE pedidos ADD COLUMN mp_preferencia_id text, ADD COLUMN mp_pagamento_id text;
-- Um pagamento estornado ou contestado deixa o pedido "estornado" e libera os presentes.
ALTER TABLE pedidos DROP CONSTRAINT pedidos_status_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('pendente', 'aguardando', 'pago', 'falhou', 'expirado', 'estornado'));

-- A aplicação do Mercado Pago (o "site" que a conta autoriza), cadastrada uma vez no painel.
-- Segredos e tokens ficam cifrados (AES-256-GCM, chave derivada da senha do banco, que não está
-- no banco): um dump ou backup sozinho não dá acesso à conta.
CREATE TABLE mercadopago_aplicacao (
  id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  client_id      text NOT NULL,
  client_secret  text NOT NULL,
  salva_em       timestamptz NOT NULL DEFAULT now(),
  salva_por      integer REFERENCES usuarios(id) ON DELETE SET NULL
);

-- A conta do Mercado Pago conectada (uma só), que recebe os presentes.
CREATE TABLE mercadopago_conta (
  id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  usuario_mp     bigint NOT NULL,
  apelido        text,
  email          text,
  access_token   text NOT NULL,
  refresh_token  text NOT NULL,
  producao       boolean NOT NULL,
  expira_em      timestamptz NOT NULL,
  conectada_em   timestamptz NOT NULL DEFAULT now(),
  conectada_por  integer REFERENCES usuarios(id) ON DELETE SET NULL,
  renovada_em    timestamptz
);

-- Pedidos de conexão em andamento: o "state" e o verificador PKCE de cada ida ao Mercado Pago,
-- presos a quem clicou. Valem 10 minutos (o mesmo prazo do código de autorização).
CREATE TABLE mercadopago_oauth (
  estado       text PRIMARY KEY,
  verificador  text NOT NULL,
  usuario_id   integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

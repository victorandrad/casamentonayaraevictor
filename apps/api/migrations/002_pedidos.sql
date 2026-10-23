-- Pedidos de presentes pagos pelo Stripe Checkout
CREATE TABLE pedidos (
  id                     serial PRIMARY KEY,
  status                 text NOT NULL DEFAULT 'pendente'
                         CHECK (status IN ('pendente', 'aguardando', 'pago', 'falhou', 'expirado')),
  nome                   text NOT NULL,
  email                  text NOT NULL,
  mensagem               text NOT NULL DEFAULT '',
  total_centavos         integer NOT NULL CHECK (total_centavos > 0),
  stripe_session_id      text UNIQUE,
  stripe_payment_intent  text,
  criado_em              timestamptz NOT NULL DEFAULT now(),
  pago_em                timestamptz
);
CREATE INDEX pedidos_status_idx ON pedidos (status);

-- Itens com nome e valor congelados no momento da compra
CREATE TABLE pedido_itens (
  id              serial PRIMARY KEY,
  pedido_id       integer NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  presente_id     integer REFERENCES presentes(id) ON DELETE SET NULL,
  nome            text NOT NULL,
  valor_centavos  integer NOT NULL CHECK (valor_centavos > 0),
  quantidade      smallint NOT NULL CHECK (quantidade BETWEEN 1 AND 10)
);
CREATE INDEX pedido_itens_pedido_idx ON pedido_itens (pedido_id);

-- Eventos de webhook já processados (o Stripe pode reenviar o mesmo evento)
CREATE TABLE stripe_eventos (
  id           text PRIMARY KEY,
  tipo         text NOT NULL,
  recebido_em  timestamptz NOT NULL DEFAULT now()
);

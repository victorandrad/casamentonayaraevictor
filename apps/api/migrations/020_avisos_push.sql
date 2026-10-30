-- Avisos no navegador (Web Push) para quem está pagando: o convidado pede na página do pedido e
-- recebe quando o Pix está para vencer e quando o pagamento é confirmado ou não se conclui.
-- Cada inscrição vale só para um pedido e é apagada quando ele termina.
CREATE TABLE push_inscricoes (
  id serial PRIMARY KEY,
  pedido_id integer NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  lembrete_enviado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pedido_id, endpoint)
);

-- As chaves VAPID do site (identificam o site junto aos serviços de push), criadas sozinhas na
-- primeira vez. A privada fica cifrada como os segredos do Mercado Pago.
CREATE TABLE push_chaves (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  publica text NOT NULL,
  privada text NOT NULL
);

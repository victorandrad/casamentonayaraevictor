-- Um pagamento estornado ou contestado no Mercado Pago deixa o pedido "estornado" (e libera os
-- presentes); antes ele ficava como pago para sempre.
ALTER TABLE pedidos DROP CONSTRAINT pedidos_status_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('pendente', 'aguardando', 'pago', 'falhou', 'expirado', 'estornado'));

-- Os presentes voltam a ser pagos só pelo Stripe: desfaz 013 e 014. Os pedidos feitos pelo
-- Mercado Pago foram todos de teste (credenciais de teste, nenhum dinheiro real) e saem junto.
DELETE FROM pedidos WHERE gateway = 'mercadopago';
ALTER TABLE pedidos DROP COLUMN gateway, DROP COLUMN mp_preferencia_id, DROP COLUMN mp_pagamento_id;
ALTER TABLE pedidos DROP CONSTRAINT pedidos_status_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('pendente', 'aguardando', 'pago', 'falhou', 'expirado'));

-- Os presentes podem ser pagos pelo Stripe ou pelo Mercado Pago (Checkout Pro), escolhido por
-- PAGAMENTO_GATEWAY. Cada pedido guarda por qual passou e os identificadores do Mercado Pago.
ALTER TABLE pedidos ADD COLUMN gateway text NOT NULL DEFAULT 'stripe' CHECK (gateway IN ('stripe', 'mercadopago'));
ALTER TABLE pedidos ADD COLUMN mp_preferencia_id text;
ALTER TABLE pedidos ADD COLUMN mp_pagamento_id text;

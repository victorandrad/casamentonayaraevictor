-- Forma de pagamento e taxa real cobrada pelo Stripe em cada pedido pago
ALTER TABLE pedidos
  ADD COLUMN forma_pagamento   text,          -- 'card', 'pix', ...
  ADD COLUMN bandeira          text,          -- bandeira do cartão (visa, mastercard...)
  ADD COLUMN taxa_centavos     integer CHECK (taxa_centavos >= 0),
  ADD COLUMN liquido_centavos  integer;

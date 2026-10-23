-- Quando o recibo do presente foi enviado por e-mail ao convidado (envio único)
ALTER TABLE pedidos ADD COLUMN recibo_enviado_em timestamptz;

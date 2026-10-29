-- A conta do Mercado Pago também pode ser ligada colando a Public Key e o Access Token da aplicação
-- (credenciais de teste ou de produção), sem OAuth. Esse token não expira nem é renovado.
ALTER TABLE mercadopago_conta ADD COLUMN origem text NOT NULL DEFAULT 'oauth' CHECK (origem IN ('oauth', 'credenciais'));
ALTER TABLE mercadopago_conta ALTER COLUMN refresh_token DROP NOT NULL, ALTER COLUMN expira_em DROP NOT NULL;

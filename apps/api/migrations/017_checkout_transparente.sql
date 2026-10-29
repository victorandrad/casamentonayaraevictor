-- Checkout Transparente: o convidado paga dentro do site (Payment Brick do Mercado Pago), que
-- precisa da public key da conta conectada. Ela vem do OAuth; contas conectadas antes desta
-- migração não a têm e são conectadas de novo no painel.
ALTER TABLE mercadopago_conta ADD COLUMN public_key text;

-- O Pix gerado fica no pedido enquanto espera o pagamento, para o convidado ver o QR Code de novo
-- se recarregar a página. Sai do pedido quando ele é pago, vence ou falha.
ALTER TABLE pedidos ADD COLUMN pix_codigo text, ADD COLUMN pix_qr text, ADD COLUMN pix_expira_em timestamptz;

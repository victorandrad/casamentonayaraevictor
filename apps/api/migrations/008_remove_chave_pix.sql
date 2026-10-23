-- O Pix agora é cobrado pelo Stripe, junto com o cartão: a chave Pix manual não é mais usada.
DELETE FROM configuracoes WHERE chave = 'pix_key';

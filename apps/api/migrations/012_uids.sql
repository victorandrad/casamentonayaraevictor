-- Presentes e pedidos ganham um identificador público aleatório (UUID). Ele é o único que sai do
-- banco (site, painel, Stripe, recibo): o número sequencial (id) fica só para as ligações internas,
-- assim ninguém descobre quantos presentes ou pedidos existem nem tenta adivinhar o próximo.
ALTER TABLE presentes ADD COLUMN uid uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE presentes ADD CONSTRAINT presentes_uid_key UNIQUE (uid);

ALTER TABLE pedidos ADD COLUMN uid uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE pedidos ADD CONSTRAINT pedidos_uid_key UNIQUE (uid);

-- Presentes que alguém deu fora do site (entregue em mãos, transferência direta…), marcados pelos
-- noivos no painel. Contam como presenteados: um presente único marcado sai da lista do site.
ALTER TABLE presentes ADD COLUMN presenteados_fora integer NOT NULL DEFAULT 0 CHECK (presenteados_fora >= 0);

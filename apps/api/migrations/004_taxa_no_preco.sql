-- O valor do presente é o que os noivos recebem; o convidado paga esse valor
-- mais a taxa por produto (padrão 4,10%).
ALTER TABLE pedidos
  ADD COLUMN subtotal_centavos integer;  -- soma dos valores dos presentes, sem a taxa

UPDATE pedidos SET subtotal_centavos = total_centavos WHERE subtotal_centavos IS NULL;

// Gift fee. Gifts are registered with the amount the couple wants; the guest
// sees and pays that amount plus a fee per product: a percentage plus a fixed
// amount (default 5,99% + R$ 0,39, above Mercado Pago's card rate, so any
// payment method is covered).

export type Taxa = { percentual: number; fixoCentavos: number };

export const TAXA_PADRAO: Taxa = { percentual: 5.99, fixoCentavos: 39 };

// Guest price of one unit of a product. The gateway takes the percentage over the
// amount actually charged (fee included), so the price is solved backwards:
// preço − (preço × percentual + fixo) = valor  →  preço = (valor + fixo) / (1 − percentual).
// Rounded up, so the couple never nets less than the registered value.
// Shared by the site and the API so the price shown is exactly the price charged.
export function precoComTaxa(valorCentavos: number, taxa: Taxa): number {
  if (valorCentavos <= 0) return 0;
  return Math.ceil((valorCentavos + taxa.fixoCentavos) / (1 - taxa.percentual / 100));
}

export function taxaDoPreco(valorCentavos: number, taxa: Taxa): number {
  return precoComTaxa(valorCentavos, taxa) - valorCentavos;
}

const reais = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// "5,99% + R$ 0,39"
export function descreverTaxa(taxa: Taxa): string {
  const pct = `${taxa.percentual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  return taxa.fixoCentavos ? `${pct} + ${reais(taxa.fixoCentavos)}` : pct;
}

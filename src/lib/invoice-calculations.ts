export type InvoiceTaxMode = 'exclusive' | 'inclusive';

export function invoiceLineTotal(afterDiscount: number, tax: number, taxMode: InvoiceTaxMode, reverseCharge: boolean): number {
  return afterDiscount + (taxMode === 'exclusive' && !reverseCharge ? tax : 0);
}

export function invoiceExtraLineTotal(amount: number, tax: number, reverseCharge: boolean): number {
  return amount + (reverseCharge ? 0 : tax);
}

export function invoiceGrandTotal(subtotal: number, taxTotal: number, reverseCharge: boolean): number {
  const payableTax = reverseCharge ? 0 : taxTotal;
  return Math.round((subtotal + payableTax) * 100) / 100;
}

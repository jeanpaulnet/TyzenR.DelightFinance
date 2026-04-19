import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currencyCode: string = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  } catch (e) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }
}

export function getCurrencySymbol(currencyCode: string = 'USD') {
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).formatToParts(0);
    const symbolPart = parts.find(p => p.type === 'currency');
    return symbolPart ? symbolPart.value : '$';
  } catch (e) {
    return '$';
  }
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

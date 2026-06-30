import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatSoldCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k sold`;
  }
  return `${count} sold`;
}

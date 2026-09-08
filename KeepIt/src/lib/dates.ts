// Renewal dates are local calendar days. UTC conversion can move them a day.
export function localDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export const money = (value: string | number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));

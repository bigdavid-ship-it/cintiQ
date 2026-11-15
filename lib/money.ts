/** Money is stored as integer kobo (1 NGN = 100 kobo). Never use floats for currency. */
export function nairaToKobo(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const kobo = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return kobo > 0 ? kobo : null;
}

export function koboToNairaString(kobo: number): string {
  const whole = Math.floor(kobo / 100);
  const frac = kobo % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}

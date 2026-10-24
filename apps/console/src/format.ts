export function formatMoney(minor: number) {
  if (!Number.isSafeInteger(minor) || minor < 0) return "Invalid amount";
  const amount = BigInt(minor);
  return (
    "MYR " +
    (amount / 100n).toLocaleString("en-MY") +
    "." +
    (amount % 100n).toString().padStart(2, "0")
  );
}
export function parseMoney(value: string): number {
  const text = value.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(text))
    throw new Error(
      "Enter an amount such as 20.00, with at most two decimal places.",
    );
  const [whole, fraction = ""] = text.split(".");
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Enter a positive amount within the supported limit.");
  return Number(minor);
}
export function dateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat("en-MY", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kuala_Lumpur",
      }).format(date);
}
export function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}
export function json(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
export function shortId(value: string) {
  return value.length > 22 ? value.slice(0, 10) + "…" + value.slice(-6) : value;
}

// Safe money handling for the screen. Money is never turned into a
// floating-point number: it stays as text, or as BigInt paise (1 rupee = 100 paise).

const PRICE_PATTERN = /^\d{1,7}(\.\d{1,2})?$/;

// "100.5" -> 10050n.  Returns null if the text is not valid money.
export function parsePaise(text) {
  if (typeof text !== 'string') return null;
  const clean = text.trim();
  if (!PRICE_PATTERN.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

// 9990n -> "99.90"
export function formatPaise(paise) {
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

// "1234567" -> "12,34,567" (Indian digit grouping)
function groupIndian(digits) {
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${lastThree}`;
}

// "1000000.00" -> "₹10,00,000.00"
export function formatRupees(text) {
  if (text === null || text === undefined) return '—';
  const negative = String(text).startsWith('-');
  const [whole, fraction] = String(text).replace('-', '').split('.');
  return `${negative ? '-' : ''}₹${groupIndian(whole)}${fraction ? `.${fraction}` : ''}`;
}

export function formatTime(isoText) {
  if (!isoText) return '';
  return new Date(isoText).toLocaleTimeString();
}

export function formatDateTime(isoText) {
  if (!isoText) return '';
  return new Date(isoText).toLocaleString();
}
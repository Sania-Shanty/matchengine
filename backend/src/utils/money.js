// Safe money handling. We never use floating-point numbers for money.
// Money is converted to whole paise (1 rupee = 100 paise) using BigInt,
// calculated exactly, then turned back into text like "99.90".

const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

// "100.5" or 100.5 -> 10050n.  Returns null if the value is not valid money
// (negative, more than 2 decimals, letters, scientific notation...).
function parseMoneyToPaise(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    value = String(value);
  }
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!MONEY_PATTERN.test(text)) return null;

  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

// 9990n -> "99.90"
function formatPaise(paise) {
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

module.exports = { parseMoneyToPaise, formatPaise };
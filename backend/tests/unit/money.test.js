import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { parseMoneyToPaise, formatPaise } = require('../../src/utils/money');

describe('parseMoneyToPaise', () => {
  it('turns whole rupees into paise', () => {
    expect(parseMoneyToPaise('100')).toBe(10000n);
    expect(parseMoneyToPaise('100.00')).toBe(10000n);
    expect(parseMoneyToPaise('0.05')).toBe(5n);
  });

  it('handles one decimal place', () => {
    expect(parseMoneyToPaise('99.9')).toBe(9990n);
    expect(parseMoneyToPaise('0.1')).toBe(10n);
  });

  it('accepts plain numbers too', () => {
    expect(parseMoneyToPaise(100)).toBe(10000n);
    expect(parseMoneyToPaise(100.5)).toBe(10050n);
    expect(parseMoneyToPaise(0.1)).toBe(10n);
  });

  it('rejects anything that is not valid money', () => {
    const bad = ['100.123', '-5', 'abc', '', '1e3', ' ', '1,000', '10.', null, undefined, NaN, Infinity, {}];
    for (const value of bad) {
      expect(parseMoneyToPaise(value), `value: ${String(value)}`).toBeNull();
    }
  });
});

describe('formatPaise', () => {
  it('always shows two decimals', () => {
    expect(formatPaise(9990n)).toBe('99.90');
    expect(formatPaise(10000n)).toBe('100.00');
    expect(formatPaise(5n)).toBe('0.05');
    expect(formatPaise(0n)).toBe('0.00');
  });

  it('handles negative amounts', () => {
    expect(formatPaise(-250n)).toBe('-2.50');
  });

  it('round-trips: text -> paise -> text', () => {
    for (const text of ['0.01', '1.00', '99.99', '123456.78']) {
      expect(formatPaise(parseMoneyToPaise(text))).toBe(text);
    }
  });
});

describe('no floating-point errors', () => {
  it('Rs. 100.00 - Rs. 0.10 is exactly Rs. 99.90', () => {
    const result = parseMoneyToPaise('100.00') - parseMoneyToPaise('0.10');
    expect(formatPaise(result)).toBe('99.90');
  });

  it('Rs. 0.10 + Rs. 0.20 is exactly Rs. 0.30 (plain JavaScript gets this wrong)', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the problem
    const result = parseMoneyToPaise('0.10') + parseMoneyToPaise('0.20');
    expect(formatPaise(result)).toBe('0.30'); // our fix
  });
});
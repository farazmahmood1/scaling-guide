import { describe, expect, it } from 'vitest';

import { decimalNumber, deskHoursError, parseRetryMinutes, parseTags, previewTemplate, rupeesToPaisaNumber, tagsToText, templateError, unknownPlaceholders, wholeNumber } from '@/lib/settings';

describe('numbers typed into a form', () => {
  it('reads a whole number only inside its range', () => {
    expect(wholeNumber('7', 1, 90)).toBe(7);
    expect(wholeNumber(' 90 ', 1, 90)).toBe(90);
    for (const bad of ['0', '91', '7.5', '-3', '1e2', '', 'seven', '1234567890']) expect(wholeNumber(bad, 1, 90), bad).toBeNull();
  });

  it('reads a percentage to two decimals', () => {
    expect(decimalNumber('2', 0, 50)).toBe(2);
    expect(decimalNumber('2.5', 0, 50)).toBe(2.5);
    for (const bad of ['2.555', '51', '-1', 'x', '']) expect(decimalNumber(bad, 0, 50), bad).toBeNull();
  });

  it('turns typed rupees into exact whole paisa, within a limit', () => {
    expect(rupeesToPaisaNumber('100', 100_000_000)).toBe(10_000);
    expect(rupeesToPaisaNumber('1,000.50', 100_000_000)).toBe(100_050);
    expect(rupeesToPaisaNumber('1000000', 100_000_000)).toBe(100_000_000);
    for (const bad of ['1000001', '-5', '1.234', 'lots', '']) expect(rupeesToPaisaNumber(bad, 100_000_000), bad).toBeNull();
  });
});

describe('desk settings', () => {
  it('reads retry gaps as one to five values between 5 minutes and a day', () => {
    expect(parseRetryMinutes('60, 180')).toEqual([60, 180]);
    expect(parseRetryMinutes('30 120 1440')).toEqual([30, 120, 1440]);
    for (const bad of ['', '4', '1441', '60, x', '5,5,5,5,5,5', '1.5']) expect(parseRetryMinutes(bad), bad).toBeNull();
  });

  it('wants the desk to open before it closes, as HH:MM', () => {
    expect(deskHoursError('10:00', '22:00')).toBeNull();
    expect(deskHoursError('22:00', '10:00')).toBe('The desk must open before it closes');
    expect(deskHoursError('10:00', '10:00')).toBe('The desk must open before it closes');
    expect(deskHoursError('9:00', '22:00')).toBe('Give both times as HH:MM');
    expect(deskHoursError('10:00', '24:00')).toBe('Give both times as HH:MM');
  });
});

describe('Shopify tags', () => {
  it('splits on lines and commas, trims, and drops repeats', () => {
    expect(parseTags('Confirmed, confirmed\n Order Confirmed \n\nConfirmed').tags).toEqual(['Confirmed', 'confirmed', 'Order Confirmed']);
    expect(tagsToText(['a', 'b'])).toBe('a\nb');
  });

  it('refuses more than 30 tags, and one that is too long', () => {
    expect(parseTags(Array.from({ length: 31 }, (_, i) => `t${i}`).join(',')).error).toBe('At most 30 tags');
    expect(parseTags('x'.repeat(81)).error).toContain('longer than 80');
    expect(parseTags('ok').error).toBeNull();
  });
});

describe('WhatsApp templates', () => {
  const GOOD = 'Assalam o Alaikum {firstName}! Your order {orderNumber} from {store}: {items}. Total {total}, COD to {city}.';

  it('knows which placeholders it fills', () => {
    expect(unknownPlaceholders(GOOD)).toEqual([]);
    expect(unknownPlaceholders('Hi {firstname} {orderNumber} {phone} {phone}')).toEqual(['firstname', 'phone']);
  });

  it('shows the message with made-up values, leaving an unknown placeholder as typed', () => {
    expect(previewTemplate(GOOD)).toBe('Assalam o Alaikum Sample! Your order #1042 from NUR by Juggun: 2 × Sample product. Total Rs 2,750, COD to Sampletown.');
    expect(previewTemplate('Hi {nickname}, {name}')).toBe('Hi {nickname}, Sample Customer');
  });

  it('says why a template cannot be saved, the same reasons the server gives', () => {
    expect(templateError(GOOD)).toBeNull();
    expect(templateError('   ')).toBe('The message cannot be empty');
    expect(templateError('x'.repeat(1001))).toBe('At most 1000 characters');
    expect(templateError('Hi {phone} {email}')).toBe('Unknown placeholders: {phone}, {email}');
    expect(templateError('Hi {phone}')).toBe('Unknown placeholder: {phone}');
  });

  it('never puts a real customer detail in the preview', () => {
    const out = previewTemplate('{name} {firstName} {city} {total} {items} {orderNumber} {store}');
    expect(out).not.toMatch(/\+92|03\d{9}/);
    expect(out).toContain('Sample');
  });
});

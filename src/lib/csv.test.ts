import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv.ts';

describe('csv', () => {
  it('round-trips awkward values', () => {
    const rows = [['ring', 'name', 'notes'], ['ZA 3979 BORD 2026', 'Race 587 Dan/845 Gadin', 'said "good", fast\nsecond line'], ['', ' padded ', '']];
    expect(parseCsv(toCsv(rows))).toEqual(rows.filter((r) => r.some((f) => f.trim())));
  });
  it('handles BOM and CRLF', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

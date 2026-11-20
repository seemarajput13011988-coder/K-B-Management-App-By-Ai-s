import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesSearch } from './search.ts';

test('matches every search term across fields regardless of order and case', () => {
  assert.equal(matchesSearch('SMITH john', 'John Smith', 'Ahmedabad'), true);
  assert.equal(matchesSearch('john delhi', 'John Smith', 'Ahmedabad'), false);
});

test('normalizes accents and punctuation without losing meaningful terms', () => {
  assert.equal(matchesSearch('jose', 'José Alvarez'), true);
  assert.equal(matchesSearch('plan, premium', 'Premium Internet Plan'), true);
});

test('matches phone digits when formatting differs', () => {
  assert.equal(matchesSearch('987-654-3210', '+91 98765 43210'), true);
  assert.equal(matchesSearch('123456', '+91 98765 43210'), false);
});

test('does not match every record for punctuation-only queries', () => {
  assert.equal(matchesSearch('-', 'John Smith'), false);
  assert.equal(matchesSearch('---', 'Premium Internet Plan'), false);
});

test('empty or whitespace-only query matches all records', () => {
  assert.equal(matchesSearch('', 'Anything'), true);
  assert.equal(matchesSearch('   ', 'Anything'), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { searchMatches } from './search.js';

test('search matches all words regardless of order and case',()=>{
  assert.equal(searchMatches('SMITH john',['John Smith','Ahmedabad']),true);
  assert.equal(searchMatches('john delhi',['John Smith','Ahmedabad']),false);
});

test('search normalizes accents and punctuation',()=>{
  assert.equal(searchMatches('jose',['José Alvarez']),true);
  assert.equal(searchMatches('plan, premium',['Premium Internet Plan']),true);
});

test('search matches phone digits with formatting differences',()=>{
  assert.equal(searchMatches('987-654-3210',['+91 98765 43210']),true);
  assert.equal(searchMatches('876543',['+91 98765 43210']),false);
});

test('empty search matches all records',()=>{
  assert.equal(searchMatches('  ',['Anything']),true);
});

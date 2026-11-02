// TAP conhecido (node 24): # pass 3, # fail 1, # skipped 2, # todo 1; os motivos dos skips são motivo-um e motivo-dois.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('p1', () => {});
test('p2', () => {});
test('p3', () => {});
test('f1', () => { assert.fail('falha de propósito'); });
test('s1', (t) => { t.skip('motivo-um'); });
test('s2', { skip: 'motivo-dois' }, () => {});
test('t1', { todo: 'por fazer' }, () => {});
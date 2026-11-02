import { test } from 'node:test';
import { gravaEnv } from '../sonda.mjs';

test('sonda do env', () => { gravaEnv(import.meta.url); });
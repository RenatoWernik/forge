// caso mau L3: o git diff de nomes é um template com uma interpolação que não é base()
import test from 'node:test';
import { execSync } from 'node:child_process';

const ref = 'origin/main';
test('GUARDA: só scripts/ mudou', () => {
  execSync(`git diff --name-only ${ref}...HEAD`, { encoding: 'utf8' });
});
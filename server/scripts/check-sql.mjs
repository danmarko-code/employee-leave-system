#!/usr/bin/env node
// ============================================================================
// CI guard for the "one static SQL string + params" rule.
//
// Fails when a line contains an SQL keyword and also interpolates a value with
// a template literal or concatenation. Also bans stacked statements and eval.
// Run: npm run check:sql
// ============================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [path.join(root, 'src'), path.join(root, '..', 'shared', 'src')];
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

// SQL in this project is written in uppercase so prose and identifiers do not
// produce false positives. Lowercase SQL could evade this grep, which is why
// the prepared-statement helper is the real control.
const SQL_WORD = /\b(SELECT|INSERT|UPDATE|DELETE|REPLACE|FROM|WHERE|JOIN|ORDER\s+BY|GROUP\s+BY|LIMIT|OFFSET)\b/;
const INTERPOLATION = /\$\{|\+\s*['"`]|['"`]\s*\+/;
const BANNED = [
  { pattern: /multipleStatements\s*:\s*true/, message: 'multipleStatements is forbidden in application code' },
  { pattern: /\beval\s*\(/, message: 'eval() is forbidden' },
  { pattern: /new\s+Function\s*\(/, message: 'new Function() is forbidden' },
];

const problems = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(full);
      continue;
    }
    if (!extensions.has(path.extname(entry))) continue;

    const relative = path.relative(root, full);
    const lines = readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

      for (const rule of BANNED) {
        if (rule.pattern.test(line)) problems.push(`${relative}:${index + 1}  ${rule.message}`);
      }
      if (SQL_WORD.test(line) && INTERPOLATION.test(line)) {
        problems.push(
          `${relative}:${index + 1}  SQL appears to be built with interpolation or concatenation; pass a constant string plus params`
        );
      }
    });
  }
}

for (const target of targets) walk(target);

if (problems.length > 0) {
  console.error('SQL safety check failed:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log('SQL safety check passed.');

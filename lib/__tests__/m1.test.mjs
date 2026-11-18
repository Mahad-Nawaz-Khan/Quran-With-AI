import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createJiti } = require('jiti');

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..', '..');
const jiti = createJiti(path.join(rootDir, 'package.json'), {
  alias: { '@': rootDir },
});

await jiti.import(path.join(testDir, 'm1.test.ts'));

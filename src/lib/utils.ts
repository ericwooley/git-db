import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
export function getDbPath() {
  return join(process.cwd(), '.db');
}

export function hashStr(str: string) {
  return createHash('sha1').update(str).digest().toString('hex');
}
export function hashStrFileContent(file: string) {
  return hashStr(readFileSync(file, 'utf8'));
}

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
export function getDbPath() {
  return join(process.cwd(), '.db');
}

export function sha256Str(str: string) {
  return createHash('sha256').update(str).digest().toString('hex');
}
export function sha256FileContent(file: string) {
  return sha256Str(readFileSync(file, 'utf8'));
}

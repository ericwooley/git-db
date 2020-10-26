import { readFileSync, writeFileSync } from 'fs';
import { EOL } from 'os';
import { join } from 'path';

import debug from 'debug';
import { safeDump, safeLoad } from 'js-yaml';

import { getDbPath } from './utils';
const logger = debug('git-db:head');

const headPath = join(getDbPath(), '.head.yml');
const reflogPath = join(getDbPath(), '.reflog');
// tehehe
export const getHead = (dbName: string): string => {
  return getAllHeads()[dbName] || '';
};

export function getAllHeads(): { [dbName: string]: string } {
  try {
    const yamlRaw = readFileSync(headPath, 'utf8').toString();
    const head: any = safeLoad(yamlRaw);
    if (head) return head;
    return {};
  } catch (e) {
    logger('error getting all heads, ', e);
    return {};
  }
}

export function setHead(dbName: string, commitId: string) {
  const heads = getAllHeads();
  addToReflog(dbName, 'HEAD', commitId);
  return writeFileSync(headPath, safeDump({ ...heads, [dbName]: commitId }));
}

function addToReflog(dbName: string, ref: string, commitId: string) {
  writeFileSync(reflogPath, `${EOL}${dbName}:${ref}:${commitId}`, {
    flag: 'a',
  });
}

import { readFileSync, writeFileSync } from 'fs';
import { EOL } from 'os';
import { join } from 'path';

import debug from 'debug';
import { safeDump, safeLoad } from 'js-yaml';

import { getDbPath } from './utils';
const logger = debug('git-db:head');

const headPath = join(getDbPath(), '.refs.yml');
const reflogPath = join(getDbPath(), '.reflog');
// tehehe
export const getHead = (dbName: string): string => {
  return getAllHeads()[dbName]?.commitId || '';
};

export const getRef = (dbName: string) => {
  return (
    getAllHeads()[dbName] || {
      commitId: '',
      branch: '',
    }
  );
};

interface ITrackRef {
  [dbName: string]: { branch: string; commitId: string } | undefined;
}

export function getAllHeads(): ITrackRef {
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
  const dbRef = { branch: '', ...(heads[dbName] || {}), commitId };
  return writeFileSync(headPath, safeDump({ ...heads, [dbName]: dbRef }));
}
export function setBranch(dbName: string, branch: string, commitId: string) {
  const heads = getAllHeads();
  addToReflog(dbName, branch, commitId);
  const dbRef = { ...(heads[dbName] || {}), branch, commitId };
  return writeFileSync(headPath, safeDump({ ...heads, [dbName]: dbRef }));
}

function addToReflog(dbName: string, ref: string, commitId: string) {
  writeFileSync(
    reflogPath,
    `${EOL}${new Date().toISOString()} ${dbName}:${ref}:${commitId}`,
    {
      flag: 'a',
    }
  );
}

export function getTarget() {
  try {
    return readFileSync('./.db/target', 'utf8').toString().trim();
  } catch (e) {
    return '';
  }
}

export function setTarget(target: string) {
  return writeFileSync('./.db/target', target);
}

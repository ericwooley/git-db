import {
  getBranchesByCommitId,
  getCommitByCommitId,
  getJournal,
  getTagsByCommitId,
  ICommit,
  IJournal,
} from './journal';
import { getRef } from './tracking';

interface ILogOptions {
  limit?: number;
}
export function logCommits(dbName: string, options: ILogOptions = {}) {
  const journal = getJournal();
  const ref = getRef(dbName);
  let commit: ICommit | undefined;
  const commits: ICommit[] = [];
  let prev = ref.commitId;
  let logCount = 0;
  const limit = options.limit || Number.MAX_SAFE_INTEGER;
  while (
    (commit = getCommitByCommitId(journal, dbName, prev)) &&
    logCount < limit
  ) {
    prev = commit.prevId;
    commits.push(commit);
    logCount++;
  }
  commits.reverse().forEach((c) => {
    console.log(commitToString(journal, dbName, c));
  });
}

export function status(dbName: string) {
  const journal = getJournal();
  const ref = getRef(dbName);
  console.log(
    commitToString(
      journal,
      dbName,
      getCommitByCommitId(journal, dbName, ref.commitId),
      {
        formatDbName: (n) => `${n}:${ref.branch}`,
      }
    )
  );
}

function commitToString(
  journal: IJournal,
  dbName: string,
  c?: ICommit,
  options: { formatDbName?: (dbName: string) => string } = {}
) {
  if (!c) return [dbName].join(' ');
  const { formatDbName = (s: string) => s } = options;
  return [
    `[${formatDbName(dbName)}]`,
    c.id,
    buildRefString(journal, dbName, c.id),
    c.message,
  ].join(' ');
}

export function buildRefString(
  journal: IJournal,
  dbName: string,
  commitId: string
) {
  const ref = getRef(dbName);
  let result: string[] = [];
  if (commitId === ref.commitId) result.push('HEAD');
  const branchesByCommitId = getBranchesByCommitId(journal, dbName);
  if (branchesByCommitId[commitId]) {
    result = [...result, ...branchesByCommitId[commitId]];
  }
  const tagsByCommitId = getTagsByCommitId(journal, dbName);
  if (tagsByCommitId[commitId]) {
    result = [...result, ...tagsByCommitId[commitId]];
  }
  const resultAsStr = result.join(', ');
  if (!resultAsStr) return '';
  return `(${resultAsStr})`;
}

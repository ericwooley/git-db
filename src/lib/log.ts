import { getCommitByCommitId, getJournal, ICommit } from './journal';
import { getHead } from './tracking';

interface ILogOptions {
  limit?: number;
}
export function logCommits(dbName: string, options: ILogOptions = {}) {
  const journal = getJournal();
  const head = getHead(dbName);
  let commit: ICommit | undefined;
  const commits: ICommit[] = [];
  let prev = head;
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
    console.log(
      c.id,
      new Date(c.date),
      c.message,
      c.id === head ? '(HEAD)' : ''
    );
  });
}

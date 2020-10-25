import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import debug from 'debug';
import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch';
import yaml from 'js-yaml';
import { lazy, object, string } from 'yup';

import { getDbPath } from './utils';
const logger = debug('git-db:journal');
export const journalDBValidator = object({
  tags: dynamicObj(() => string().required()),
  commits: dynamicObj(() => string().required()),
  metadata: dynamicObj(() => string().required()),
}).required();
export const journalValidator = object({
  version: string().required(),
  databases: dynamicObj(() => journalDBValidator),
}).required();

function dynamicObj(type: (value: any) => any) {
  return lazy((obj: any) => {
    return object(
      Object.fromEntries(
        Object.entries(obj as any)
          .filter(([key]) => key !== '0')
          .map(([key, value]) => {
            return [key, type(value)];
          })
      )
    ).required();
  });
}
export interface IJournal {
  version: string;
  databases: {
    [key: string]: {
      metadata: {
        [key: string]: string;
      };
      tags: {
        // tag -> commit id
        [tag: string]: string;
      };
      commits: {
        // sha256 of file
        [commitId: string]: ICommit;
      };
    };
  };
}

export interface ICommit {
  metadata: { [key: string]: string };
  // date created
  date: number;
  prev: string;
  sha: string;
  file: string;
}

function isJournal(j: any): j is IJournal {
  journalValidator.validateSync(j);
  return true;
}

export function getJournalPath(): string {
  const dbPath = join(getDbPath(), 'journal.yml');
  return dbPath;
}
export function getJournal(): IJournal {
  try {
    const dbPath = getJournalPath();
    const journal = yaml.safeLoad(readFileSync(dbPath, 'utf8'));
    if (!journal) throw new Error('Journal not found');
    if (isJournal(journal)) return journal;
    else throw new Error('Invalid Journal');
  } catch (e) {
    console.warn('invalid journal', e.toString());
    return {
      version: '0.0.0',
      databases: {},
    };
  }
}

export function writeJournal(journal: IJournal) {
  writeFileSync(getJournalPath(), yaml.safeDump(journal));
}

export function addCommitToJournal(
  journal: IJournal,
  name: string,
  commit: ICommit,
  options: { databaseMetadata?: { [key: string]: string } } = {}
): IJournal {
  if (journal.databases[name]?.commits[commit.sha]) {
    throw new Error(`commit: '${commit.sha.slice(0, 8)}' already exists`);
  }
  const prev = journal.databases[name]?.tags.latest || '';
  const {
    databaseMetadata = journal.databases[name]?.metadata || {},
  } = options;
  return {
    ...journal,
    databases: {
      ...journal.databases,
      [name]: {
        metadata: {
          ...databaseMetadata,
        },
        tags: {
          latest: commit.sha,
        },
        commits: {
          ...(journal.databases[name]?.commits || {}),
          [commit.sha]: { ...commit, prev },
        },
      },
    },
  };
}

export function getCommitByTag(
  journal: IJournal,
  name: string,
  tag: string
): ICommit | undefined {
  const commitId = journal.databases[name]?.tags[tag] || '';
  return getCommitByCommitId(journal, name, commitId);
}
export function getCommitByCommitId(
  journal: IJournal,
  name: string,
  commitId: string
) {
  return journal.databases[name]?.commits[commitId];
}

function rebuildFileForCommit(
  journal: IJournal,
  name: string,
  commitId: string
) {
  const commit = getCommitByCommitId(journal, name, commitId);
  logger('checking commit', commit);
  // this is the initial commit, it should be a full file
  if (!commit.prev) {
    logger('--> commit has no prev, loading base file:', commit.file);
    return readFileSync(commit.file, 'utf8').toString();
  }
  // these should be patch files now
  const previousFile = rebuildFileForCommit(journal, name, commit.prev);
  const dmp = new DiffMatchPatch();
  const patch = dmp.patch_fromText(
    readFileSync(commit.file, 'utf8').toString()
  );
  const [output, results] = dmp.patch_apply(patch, previousFile);
  if (results.find((r) => !r))
    throw new Error(`Error applying patch for ${commitId}`);
  return output;
}

export function generatePatchForFile(
  journal: IJournal,
  name: string,
  commitId: string,
  contents: string
) {
  const previousFile = rebuildFileForCommit(journal, name, commitId);
  const dmp = new DiffMatchPatch();
  const patches = dmp.patch_make(previousFile, contents);
  return dmp.patch_toText(patches);
}

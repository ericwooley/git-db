import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import debug from 'debug';
import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch';
import yaml from 'js-yaml';
import { lazy, number, object, string } from 'yup';

import { getDbPath, sha256Str } from './utils';
const logger = debug('git-db:journal');
export const journalDBValidator = object({
  tags: dynamicObj(() => string().required()),
  commits: dynamicObj(() =>
    object({
      metadata: object().required(),
      date: number().required(),
      message: string().required(),
      prevId: string(),
      sha: string().required(),
      id: string().required(),
      file: string().required(),
    }).required()
  ),
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
      branches: {
        [key: string]: string;
      };
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
  message: string;
  prevId: string;
  sha: string;
  id: string;
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

export function createCommitId(contentSha: string, prevId: string) {
  return sha256Str(prevId + contentSha);
}
export function addCommitToJournal(
  journal: IJournal,
  name: string,
  commit: ICommit,
  options: { databaseMetadata?: { [key: string]: string } } = {}
): IJournal {
  const {
    databaseMetadata = journal.databases[name]?.metadata || {},
  } = options;

  const prevCommit = getCommitByCommitId(journal, name, commit.prevId);

  if (prevCommit && prevCommit.sha === commit.sha) {
    throw new Error(`Nothing to commit`);
  }
  return {
    ...journal,
    databases: {
      ...journal.databases,
      [name]: {
        branches: {
          ...(journal.databases[name]?.branches || {}),
        },
        metadata: {
          ...databaseMetadata,
        },
        tags: {
          ...(journal.databases[name]?.tags || {}),
          latest: commit.id,
        },
        commits: {
          ...(journal.databases[name]?.commits || {}),
          [commit.id]: commit,
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
): ICommit | undefined {
  return journal.databases[name]?.commits[commitId];
}

function rebuildFileForCommit(
  journal: IJournal,
  name: string,
  commitId: string
) {
  const commit = getCommitByCommitId(journal, name, commitId);
  if (!commit) throw new Error(`Commit missing: ${commitId}`);
  logger('checking commit', commit);
  // this is the initial commit, it should be a full file
  if (!commit.prevId) {
    logger('--> commit has no prev, loading base file:', commit.file);
    return readFileSync(commit.file, 'utf8').toString();
  }
  // these should be patch files now
  const previousFile = rebuildFileForCommit(journal, name, commit.prevId);
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

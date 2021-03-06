import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';

import debug from 'debug';
import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch';
import yaml from 'js-yaml';
import { lazy, number, object, string } from 'yup';

import { getDbPath, hashStr } from './utils';
const logger = debug('git-db:journal');
export const journalDBValidator = object({
  tags: dynamicObj(() => string().required()),
  commits: dynamicObj(() =>
    object({
      date: number().required(),
      message: string().required(),
      prevId: string(),
      sha: string().required(),
      id: string().required(),
      file: string().required(),
    }).required()
  ),
}).required();
export const journalValidator = object({
  version: string().required(),
  databases: dynamicObj(() => journalDBValidator),
}).required();

function dynamicObj(type: (value: any) => any) {
  return lazy((obj: any) => {
    return object(
      obj
        ? Object.fromEntries(
            Object.entries(obj as any)
              .filter(([key]) => key !== '0')
              .map(([key, value]) => {
                return [key, type(value)];
              })
          )
        : undefined
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
      tags: {
        // tag -> commit id
        [tag: string]: string;
      };
      commits: {
        // sha of file
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

export const getBranchesByCommitId = (journal: IJournal, dbName: string) => {
  const db = journal.databases[dbName];
  if (!db) throw new Error(`${dbName} not found`);
  const branches = db.branches;
  return invertObject(branches);
};

export const getTagsByCommitId = (journal: IJournal, dbName: string) => {
  const db = journal.databases[dbName];
  if (!db) throw new Error(`${dbName} not found`);
  const tags = db.tags;
  return invertObject(tags);
};

const invertObject = (obj: { [k: string]: string }) =>
  Object.entries(obj).reduce((t, [key, value]) => {
    if (!t[value]) {
      t[value] = [];
    }
    const arr = t[value];
    arr.push(key);
    return t;
  }, {} as { [commitId: string]: string[] });

export function getJournalPath(): string {
  const dbPath = join(getDbPath(), 'journal.yml');
  return dbPath;
}
export function getJournal(): IJournal {
  try {
    const dbPath = getJournalPath();
    const content = readFileSync(dbPath, 'utf8');
    const journal = yaml.safeLoad(content);
    if (!journal) throw new Error('Journal not found');
    if (isJournal(journal)) return journal;
    else throw new Error('Invalid Journal');
  } catch (e) {
    logger('invalid journal', inspect(e, true, 5));
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
  return hashStr(prevId + contentSha);
}
export function addCommitToJournal(
  journal: IJournal,
  name: string,
  commit: ICommit,
  options: { tags?: string[]; branches?: string[] } = {}
): IJournal {
  const prevCommit = getCommitByCommitId(journal, name, commit.prevId);
  const { tags = [], branches = [] } = options;
  if (prevCommit && prevCommit.sha === commit.sha) {
    throw new Error(`Nothing to commit`);
  }
  const updatedTags = {
    ...(journal.databases[name]?.tags || {}),
  };
  tags.forEach((t) => {
    updatedTags[t] = commit.id;
  });
  const updatedBranches = {
    ...(journal.databases[name]?.branches || {}),
  };
  branches.forEach((b) => {
    updatedBranches[b] = commit.id;
  });
  return {
    ...journal,
    databases: {
      ...journal.databases,
      [name]: {
        ...(journal.databases[name] || {}),
        branches: updatedBranches,
        tags: updatedTags,
        commits: {
          ...(journal.databases[name]?.commits || {}),
          [commit.id]: commit,
        },
      },
    },
  };
}

export function updateBranchInJournal(
  journal: IJournal,
  name: string,
  branchName: string,
  commitId: string
): IJournal {
  return {
    ...journal,
    databases: {
      ...journal.databases,
      [name]: {
        ...(journal.databases[name] || {}),
        branches: {
          ...(journal.databases[name]?.branches || {}),
          [branchName]: commitId,
        },
      },
    },
  };
}

export function getCommitByAnyId(journal: IJournal, name: string, id: string) {
  const fromBranch = getCommitByBranch(journal, name, id);
  if (fromBranch) return fromBranch;

  const fromTag = getCommitByTag(journal, name, id);
  if (fromTag) return fromTag;

  const fromId = getCommitByCommitId(journal, name, id);
  if (fromId) return fromId;
}

export function getCommitByBranch(
  journal: IJournal,
  name: string,
  tag: string
): ICommit | undefined {
  const commitId = journal.databases[name]?.branches[tag] || '';
  return getCommitByCommitId(journal, name, commitId);
}

export function getCommitByTag(
  journal: IJournal,
  name: string,
  tag: string
): ICommit | undefined {
  logger('checking tags', journal.databases[name]?.tags, 'for', tag);
  const commitId = journal.databases[name]?.tags[tag] || '';
  logger('found', commitId);
  return getCommitByCommitId(journal, name, commitId);
}
export function getCommitByCommitId(
  journal: IJournal,
  name: string,
  commitId: string
): ICommit | undefined {
  return journal.databases[name]?.commits[commitId];
}

export function rebuildFileForCommit(
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

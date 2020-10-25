import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';

import debug from 'debug';
import shelljs from 'shelljs';
import yup, { boolean, object, string } from 'yup';

import {
  addCommitToJournal,
  generatePatchForFile,
  getCommitByTag,
  getJournal,
  ICommit,
  writeJournal,
} from './journal';
import { getDbPath, sha256FileContent } from './utils';
const logger = debug('git-db:pg:commit');
const connectionValidator = object({
  containerId: string().required(),
  username: string(),
  useCompose: boolean(),
}).required();
type IPostgresConnection = yup.InferType<typeof connectionValidator>;

export function commitPostgres(name: string, config: IPostgresConnection) {
  connectionValidator.validateSync(config);
  logger(`creating backup of ${name}...`);
  const containerId = config.useCompose
    ? exec(`docker-compose ps -q ${config.containerId}`, { silent: true })
    : config.containerId;
  exec(formatBackupCommand(config, containerId, name));
  shelljs.mkdir('-p', getDbPath());

  exec(formatCopyToRepoCommand(containerId, name));
  const version = exec(formatGetPGVersionCommand(containerId));
  let journal = getJournal();
  const backupName = formatPgBackupName(name);
  const backupPath = join(getDbPath(), backupName);
  const backupSha256 = sha256FileContent(backupPath);
  logger(`backup sha: ${backupSha256.slice(0, 8)}`);
  let prevId = '';
  let file = backupPath;
  const currentLatestCommit = getCommitByTag(journal, name, 'latest');
  // if we have a previous commit, generate a patch, and use that.
  if (currentLatestCommit && currentLatestCommit.sha !== backupSha256) {
    logger(`-- found earlier commit ${currentLatestCommit.sha.slice(0, 8)} --`);
    prevId = currentLatestCommit.id;
    const fileContents = readFileSync(backupPath, 'utf8').toString();
    const patch = generatePatchForFile(journal, name, prevId, fileContents);
    file = file.replace(/\.sql.tmp$/, `_${backupSha256.slice(0, 12)}.patch`);
    writeFileSync(file, patch);
    unlinkSync(backupPath);
  } else {
    logger('previous commit not found', currentLatestCommit);
    // if we do not have a previous commit, remove the .tmp, and use that as the
    // base file
    const fileWithoutTmp = file.replace(/\.tmp$/, '');
    renameSync(file, fileWithoutTmp);
    file = fileWithoutTmp;
  }
  // we don't want to save an absolute path
  file = file.replace(process.cwd(), '.');
  const commit: Omit<ICommit, 'id'> = {
    date: Date.now(),
    prevId: prevId,
    file,
    sha: backupSha256,
    metadata: {
      version,
    },
  };

  logger('adding commit', commit);
  journal = addCommitToJournal(journal, name, commit);
  writeJournal(journal);
  console.log(inspect(journal.databases, false, 5));
}

function formatPgBackupName(name: string) {
  return `pg_${name}.sql.tmp`;
}
export function formatBackupCommand(
  config: IPostgresConnection,
  containerId: string,
  name: string
) {
  const userNameStr = config.username ? `-U ${config.username}` : '';
  const pgDumpCommand = [
    `pg_dumpall -f /${formatPgBackupName(name)}`,
    userNameStr,
  ]
    .filter((s) => s)
    .join(' ');
  return formatExecCommand(containerId, pgDumpCommand);
}

export function formatCopyToRepoCommand(
  containerId: string,
  name: string,
  { dbPath = getDbPath() }: { dbPath?: string } = {}
) {
  const dbDest = join(dbPath, formatPgBackupName(name));

  return `docker cp ${containerId}:/${formatPgBackupName(name)} ${dbDest}`;
}

export function formatGetPGVersionCommand(containerId: string) {
  return `docker exec -u 1000:1000 ${containerId} postgres --version`;
}

function formatExecCommand(containerId: string, command: string) {
  return `docker exec ${containerId} ${command}`;
}

function exec(cmd: string, options: shelljs.ExecOptions = {}) {
  logger(`Executing: ${cmd}`);
  return shelljs
    .exec(cmd, { fatal: true, ...options })
    .toString()
    .trim();
}

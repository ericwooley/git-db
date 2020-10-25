import { readFileSync, unlinkSync, writeFileSync } from 'fs';
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

const connectionValidator = object({
  containerId: string().required(),
  username: string(),
  useCompose: boolean(),
}).required();
type IPostgresConnection = yup.InferType<typeof connectionValidator>;

export function commitPostgres(
  name: string,
  config: IPostgresConnection,
  { verbose = false }: { verbose?: boolean; exec?: (cmd: string) => any } = {}
) {
  const logger = verbose ? console.log : debug('pg:commit');
  connectionValidator.validateSync(config);
  const dateAsNum = Date.now();
  const date = `${dateAsNum}`;
  logger(`creating backup of ${name}...`);
  shelljs.exec(formatBackupCommand(config, date, name), { fatal: true });
  shelljs.mkdir('-p', getDbPath());
  shelljs.exec(formatCopyToRepoCommand(config, date, name), { fatal: true });
  const version = shelljs
    .exec(formatGetPGVersionCommand(config), {
      fatal: true,
    })
    .stdout.toString()
    .trim();
  let journal = getJournal();
  const backupName = formatPgBackupName(date, name);
  const backupPath = join(getDbPath(), backupName);
  const backupSha256 = sha256FileContent(backupPath);
  let prev = '';
  let file = backupPath;
  const currentLatestCommit = getCommitByTag(journal, name, 'latest');
  if (currentLatestCommit) {
    prev = currentLatestCommit.sha;
    const fileContents = readFileSync(backupPath, 'utf8').toString();
    const patch = generatePatchForFile(journal, name, prev, fileContents);
    file = file.replace(/\.sql$/, '.patch');
    writeFileSync(file, patch);
    unlinkSync(backupPath);
  }
  const commit: ICommit = {
    date: dateAsNum,
    prev,
    file,
    sha: backupSha256,
    metadata: {
      version,
    },
  };

  journal = addCommitToJournal(journal, name, commit);
  writeJournal(journal);
  console.log(
    'backup sha contents',
    { backupSha256 },
    inspect(journal.databases, false, 5)
  );
}

function formatPgBackupName(name: string, date: string) {
  return `pg_${name}_${date}.sql`;
}
export function formatBackupCommand(
  config: IPostgresConnection,
  date: string,
  name: string
) {
  const userNameStr = config.username ? `-U ${config.username}` : '';
  const pgDumpCommand = [
    `pg_dumpall -f /${formatPgBackupName(date, name)}`,
    userNameStr,
  ]
    .filter((s) => s)
    .join(' ');
  return formatExecCommand(config, pgDumpCommand);
}

export function formatCopyToRepoCommand(
  config: IPostgresConnection,
  date: string,
  name: string,
  { dbPath = getDbPath() }: { dbPath?: string } = {}
) {
  const dbDest = join(dbPath, formatPgBackupName(date, name));
  const cmd = getDockerBin(config);
  return `${cmd} cp ${config.containerId}:/${formatPgBackupName(
    date,
    name
  )} ${dbDest}`;
}

export function formatGetPGVersionCommand(config: IPostgresConnection) {
  const cmd = getDockerBin(config);
  return `${cmd} exec -u 1000:1000 ${config.containerId} postgres --version`;
}

function formatExecCommand(config: IPostgresConnection, command: string) {
  const cmd = getDockerBin(config);
  return `${cmd} exec ${config.containerId} ${command}`;
}
function getDockerBin(config: IPostgresConnection) {
  let cmd = 'docker';
  if (config.useCompose) {
    cmd = 'docker-compose';
  }
  return cmd;
}

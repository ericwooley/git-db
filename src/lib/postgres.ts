import { join } from 'path';

import debug from 'debug';
import shelljs from 'shelljs';
import yup, { boolean, object, string } from 'yup';
const connectionValidator = object({
  containerId: string().required(),
  username: string(),
  useCompose: boolean(),
}).required();
type IPostgresConnection = yup.InferType<typeof connectionValidator>;

export function commitPostgres(
  name: string,
  config: IPostgresConnection,
  {
    exec = shelljs.exec,
    verbose = false,
  }: { verbose?: boolean; exec?: (cmd: string) => any } = {}
) {
  const logger = verbose ? console.log : debug('pg:commit');
  connectionValidator.validateSync(config);
  const date = `${Date.now()}`;
  logger(`creating backup of ${name}...`);
  exec(formatBackupCommand(config, date));
  shelljs.mkdir('-p', getDbPath());
  exec(formatCopyToRepoCommand(config, date));
}

function formatPgBackupName(date: string) {
  return `pg_backup_${date}.sql`;
}
export function formatBackupCommand(config: IPostgresConnection, date: string) {
  const userNameStr = config.username ? `-U ${config.username}` : '';
  const pgDumpCommand = [
    `pg_dumpall -f /${formatPgBackupName(date)}`,
    userNameStr,
  ]
    .filter((s) => s)
    .join(' ');
  return formatExecCommand(config, pgDumpCommand);
}

export function formatCopyToRepoCommand(
  config: IPostgresConnection,
  date: string,
  { dbPath = getDbPath() }: { dbPath?: string } = {}
) {
  const dbDest = join(dbPath, formatPgBackupName(date));
  console.log({ dbDest, dbPath });
  const cmd = getDockerBin(config);
  return `${cmd} cp ${config.containerId}:/${formatPgBackupName(
    date
  )} ${dbDest}`;
}
function getDbPath() {
  return join(process.cwd(), '.db');
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

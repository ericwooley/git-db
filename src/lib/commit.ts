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
  IJournal,
  writeJournal,
} from './journal';
import { getDbPath, sha256FileContent } from './utils';

const connectionValidator = object({
  containerId: string().required(),
  useCompose: boolean(),
}).required();

export type IConnection = yup.InferType<typeof connectionValidator>;

const logger = debug('git-db:commit');
function exec(cmd: string, options: shelljs.ExecOptions = {}) {
  logger(`Executing: ${cmd}`);
  return shelljs
    .exec(cmd, { fatal: true, ...options })
    .toString()
    .trim();
}
export abstract class Driver<T extends IConnection> {
  protected journal: IJournal = getJournal();
  protected containerId = '';
  constructor(protected config: T, protected name: string) {
    this.containerId = config.useCompose
      ? exec(`docker-compose ps -q ${config.containerId}`, { silent: true })
      : config.containerId;
  }
  protected abstract getBackupCommand(): string;
  protected abstract getVersionCommand(): string;
  public abstract getBackupName(): string;
  public exec = (command: string) => {
    return exec(`docker exec ${this.containerId} ${command}`);
  };
  public copy = (file: string, dest: string) => {
    return exec(`docker cp ${this.containerId}:/${file} ${dest}`);
  };
  public transferBackupFromDockerToHost() {
    return this.copy(
      this.getBackupName(),
      join(getDbPath(), this.getBackupName())
    );
  }
  public createBackup = () => {
    return exec(this.getBackupCommand());
  };
  public getVersion = () => {
    return exec(this.getVersionCommand());
  };
  public commit = () => {
    connectionValidator.validateSync(this.config);
    logger(`creating backup of ${this.name}...`);
    let journal = getJournal();
    // const driver = new DBDriver(config, containerId, name, journal);
    this.createBackup();
    shelljs.mkdir('-p', getDbPath());

    this.transferBackupFromDockerToHost();
    const version = this.getVersion();
    const backupName = this.getBackupName();
    const backupPath = join(getDbPath(), backupName);
    const backupSha256 = sha256FileContent(backupPath);
    logger(`backup sha: ${backupSha256.slice(0, 8)}`);
    let prevId = '';
    let file = backupPath;
    const currentLatestCommit = getCommitByTag(journal, this.name, 'latest');
    // if we have a previous commit, generate a patch, and use that.
    if (currentLatestCommit && currentLatestCommit.sha !== backupSha256) {
      logger(
        `-- found earlier commit ${currentLatestCommit.sha.slice(0, 8)} --`
      );
      prevId = currentLatestCommit.id;
      const fileContents = readFileSync(backupPath, 'utf8').toString();
      const patch = generatePatchForFile(
        journal,
        this.name,
        prevId,
        fileContents
      );
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
    journal = addCommitToJournal(journal, this.name, commit);
    writeJournal(journal);
    console.log(inspect(journal.databases, false, 5));
  };
}

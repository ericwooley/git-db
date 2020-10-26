import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';

import debug from 'debug';
import shelljs from 'shelljs';
import yup, { boolean, object, string } from 'yup';

import { init } from './initialize';
import {
  addCommitToJournal,
  createCommitId,
  generatePatchForFile,
  getCommitByCommitId,
  getJournal,
  ICommit,
  IJournal,
  writeJournal,
} from './journal';
import { getHead, setHead } from './tracking';
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
    logger('config:', config);
    this.containerId = config.useCompose
      ? exec(`docker-compose ps -q ${config.containerId}`, { silent: true })
      : config.containerId;
  }
  protected abstract validateConfig(): void;
  protected abstract getBackupCommand(): string;
  protected abstract getVersionCommand(): string;
  public abstract getBackupName(): string;
  private getDbPath() {
    return join(getDbPath(), this.name);
  }
  public dockerExec = (command: string) => {
    return exec(`docker exec ${this.containerId} ${command}`);
  };
  public copy = (file: string, dest: string) => {
    return exec(`docker cp ${this.containerId}:/${file} ${dest}`);
  };
  public transferBackupFromDockerToHost() {
    return this.copy(
      this.getBackupName(),
      join(this.getDbPath(), this.getBackupName())
    );
  }
  public createBackupInDocker = () => {
    return this.dockerExec(this.getBackupCommand());
  };
  public getVersion = () => {
    return this.dockerExec(this.getVersionCommand());
  };
  public commit = (message: string) => {
    init();
    connectionValidator.validateSync(this.config);
    logger(`creating backup of ${this.name}...`);
    let journal = this.journal;
    // const driver = new DBDriver(config, containerId, name, journal);
    this.createBackupInDocker();
    shelljs.mkdir('-p', this.getDbPath());

    this.transferBackupFromDockerToHost();
    const version = this.getVersion();
    const backupName = this.getBackupName();
    const backupPath = join(this.getDbPath(), backupName);
    const backupSha256 = sha256FileContent(backupPath);
    logger(`backup sha: ${backupSha256.slice(0, 8)}`);
    let prevId = '';
    let file = backupPath;
    try {
      const currentHead = getHead(this.name);
      const currentCommit = getCommitByCommitId(
        this.journal,
        this.name,
        currentHead || 'latest'
      );
      // if we have a previous commit, generate a patch, and use that.
      if (currentCommit) {
        logger(`-- found earlier commit ${currentCommit.sha.slice(0, 8)} --`);
        prevId = currentCommit.id;
        const fileContents = readFileSync(backupPath, 'utf8').toString();
        const patch = generatePatchForFile(
          journal,
          this.name,
          prevId,
          fileContents
        );
        file = file.replace(
          /\.sql.tmp$/,
          `_${backupSha256.slice(0, 12)}.patch.tmp`
        );
        writeFileSync(file, patch);
        unlinkSync(backupPath);
      }
      // we don't want to save an absolute path
      file = file.replace(process.cwd(), '.');
      const eventualFile = file.replace(/\.tmp$/, '');
      const commitId = createCommitId(backupSha256, prevId);
      const commit: ICommit = {
        date: Date.now(),
        message,
        id: commitId,
        prevId: prevId,
        file: eventualFile,
        sha: backupSha256,
        metadata: {
          version,
        },
      };

      logger('adding commit', commit);

      journal = addCommitToJournal(journal, this.name, commit);
      renameSync(file, eventualFile);
      writeJournal(journal);
      setHead(this.name, commitId);
    } catch (e) {
      logger('removing', file);
      unlinkSilent(file);
      unlinkSilent(backupPath);
      throw e;
    }

    logger(inspect(journal.databases, false, 5));
  };
}

function unlinkSilent(file: string) {
  try {
    unlinkSync(file);
  } catch (e) {
    logger(`non-issue: could not unlink ${file}: ${e.toString()}`);
  }
}

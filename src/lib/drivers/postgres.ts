import debug from 'debug';
import yup, { object, string } from 'yup';

import { Driver, IConnection, IDockerCommands } from '../driver';

const logger = debug('git-db:commit:pg');
const connectionValidator = object({
  username: string().required(),
  dbName: string().required(),
}).required();
type IPostgresConnection = yup.InferType<typeof connectionValidator> &
  IConnection;

export class PostgresDriver extends Driver<IPostgresConnection> {
  protected getRestoreCommands(restoreFile: string): IDockerCommands {
    return {
      commands: [
        `dropdb ${this.config.dbName}`,
        `createdb ${this.config.dbName}`,
        `psql -d ${this.config.dbName} -f ${restoreFile}`,
      ],
      user: 'postgres',
    };
  }
  protected validateConfig(): void {
    logger('validating config for postgres...');
    connectionValidator.validateSync(this.config);
  }
  protected getBackupCommand(): IDockerCommands {
    const userNameStr = this.config.username
      ? `-U ${this.config.username}`
      : '';
    return {
      commands: [
        [`pg_dumpall -f /${this.getBackupName()}`, userNameStr]
          .filter((s) => s)
          .join(' '),
      ],
    };
  }
  protected getVersionCommand(): string {
    return 'postgres --version';
  }
  public getBackupName(): string {
    return `pg_${this.name}.sql.tmp`;
  }
}

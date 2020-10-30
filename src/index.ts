#!/usr/bin/env node
// import { hideBin } from 'yargs/helpers';
import { Argv } from 'yargs';
import yargs from 'yargs/yargs';

import { Driver, IConnection } from './lib/driver';
import { PostgresDriver } from './lib/drivers/postgres';
import { getJournal } from './lib/journal';
import { IConfig, parseFile } from './lib/parseFile';
import resolveFile from './lib/resolve';
import { logCommits, status } from './lib/status';
import { getTarget, setTarget } from './lib/tracking';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hideBin } = require('yargs/helpers');
const resolvedFile = resolveFile([
  '.git-db.yml',
  '.git-db.yaml',
  '.git-db.json',
]);
let currentTarget = getTarget();
function addDBCommand(yargs: Argv) {
  return yargs.option('database', {
    describe: 'database connection (from config) to connect to.',
    type: 'string',
    choices: Object.keys(parsedFile.databases),
    default: currentTarget,
    demandOption: false,
  });
}

const checkTarget = (argv: { database: string }) => {
  if (!argv.database)
    throw new Error('No database selected, use `db select [database]');
};
const parsedFile = parseFile(resolvedFile[0]);
currentTarget = currentTarget || Object.keys(parsedFile.databases)[0] || '';
yargs(hideBin(process.argv))
  .command(
    'select [database]',
    'select a database',
    (yargs) =>
      yargs.positional('database', {
        type: 'string',
        description: 'Database to select for use',
        default: currentTarget || Object.keys(parsedFile.databases)[0] || '',
        choices: Object.keys(parsedFile.databases),
      }),
    (argv) => {
      setTarget(argv.database);
    }
  )
  .command(
    'branches',
    'list branches',
    (yargs) => addDBCommand(yargs),
    (argv) => {
      console.log(getJournal().databases[argv.database]?.branches);
    }
  )
  .command(
    'tags',
    'list branches',
    (yargs) => addDBCommand(yargs),
    (argv) => {
      console.log(getJournal().databases[argv.database]?.tags);
    }
  )
  .command(
    'commit',
    'snapshot the current db',
    (yargs) => {
      return addDBCommand(yargs)
        .option('tag', {
          alias: 't',
          type: 'array',
          string: true,
          description:
            'Tag this commit with a name easier to remember. There can only be one commit for each tag',
        })
        .option('message', {
          alias: 'm',
          describe: 'Describe database changes',
          type: 'string',
          demandOption: true,
        });
    },
    (argv) => {
      checkTarget(argv);
      const driver = getDriver(parsedFile, argv.database);
      driver.commit(argv.message, argv.tag || []);
    }
  )
  .command(
    'checkout [commitId]',
    'checkout a snapshot',
    (yargs) => {
      return addDBCommand(yargs)
        .positional('commitId', {
          type: 'string',
          description: 'the commitId, branch, or tag to use',
        })
        .option('newBranch', {
          alias: 'b',
          type: 'string',
          description: 'create a new branch from HEAD',
        });
    },
    (argv) => {
      checkTarget(argv);
      const driver = getDriver(parsedFile, argv.database);
      if (!argv.commitId && !argv.newBranch)
        throw new Error('You must use a commitId or new branch');

      if (argv.commitId && argv.newBranch)
        throw new Error('You cannot specify a commit and create a new branch');
      if (argv.commitId) driver.checkout(argv.commitId);
      else if (argv.newBranch) driver.newBranch(argv.newBranch);
    }
  )
  .command(
    'log',
    'log previous commits, starting at HEAD',
    (yargs) => {
      return addDBCommand(yargs).option('limit', {
        alias: 'l',
        description: 'limit amount of outputs',
        type: 'number',
      });
    },
    (argv) => {
      checkTarget(argv);
      logCommits(argv.database, {
        limit: argv.limit,
      });
    }
  )
  .command(
    'status',
    'log the status of the current head',
    (yargs) => {
      return addDBCommand(yargs);
    },
    (argv) => {
      checkTarget(argv);
      status(argv.database);
    }
  )
  .demandCommand()
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
  })
  .completion().argv;
function getDriver(parsedFile: IConfig, name: string) {
  const config = parsedFile.databases[name];
  if (!config) throw new Error(`${name} config not found`);
  let driver: Driver<IConnection>;
  if (config.type === 'postgres') {
    driver = new PostgresDriver(config.connection as any, name);
    // commitPostgres(name, config.connection as any);
  } else throw new Error(`No driver for database: ${name}`);
  return driver;
}

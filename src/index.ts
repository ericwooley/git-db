#!/usr/bin/env node
// import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { Driver, IConnection } from './lib/commit';
import { PostgresDriver } from './lib/drivers/postgres';
import { IConfig, parseFile } from './lib/parseFile';
import resolveFile from './lib/resolve';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hideBin } = require('yargs/helpers');
const resolvedFile = resolveFile([
  '.git-db.yml',
  '.git-db.yaml',
  '.git-db.json',
]);
const parsedFile = parseFile(resolvedFile[0]);
yargs(hideBin(process.argv))
  .command(
    'commit [database]',
    'snapshot the current db',
    (yargs) => {
      return yargs
        .positional('database', {
          describe: 'database connection (from config) to connect to.',
          type: 'string',
          choices: Object.keys(parsedFile.databases),
        })
        .option('tags', {
          type: 'array',
          description:
            'Tag this commit with a name easier to remember. There can only be one commit for each tag',
        })
        .option('message', {
          alias: 'm',
          describe: 'Describe database changes',
          type: 'string',
          demandOption: true,
        })
        .demandOption('database');
    },
    (argv) => {
      const driver = getDriver(parsedFile, argv.database);
      driver.commit(argv.message);
    }
  )
  .command(
    'restore [database] [commitId]',
    'restore a snapshot',
    (yargs) => {
      return yargs
        .positional('database', {
          describe: 'database connection (from config) to connect to.',
          type: 'string',
          choices: Object.keys(parsedFile.databases),
        })
        .positional('commitId', {
          type: 'string',
          description: 'the commitId or tag to use, (latest for most recent)',
        })
        .demandOption('database');
    },
    (argv) => {
      throw new Error('not implemented');
    }
  )
  .demandCommand()
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
  }).argv;

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

#!/usr/bin/env node
// import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { Driver, IConnection } from './lib/driver';
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
        })
        .demandOption('database');
    },
    (argv) => {
      const driver = getDriver(parsedFile, argv.database);
      driver.commit(argv.message, argv.tag || []);
    }
  )
  .command(
    'checkout [database] [commitId]',
    'checkout a snapshot',
    (yargs) => {
      return yargs
        .positional('database', {
          describe: 'database connection (from config) to connect to.',
          type: 'string',
          choices: Object.keys(parsedFile.databases),
          demandOption: true,
        })
        .positional('commitId', {
          type: 'string',
          description: 'the commitId, branch, or tag to use',
          demandOption: true,
        });
    },
    (argv) => {
      const driver = getDriver(parsedFile, argv.database);
      driver.checkout(argv.commitId);
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

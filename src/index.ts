#!/usr/bin/env node
// import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { parseFile } from './lib/parseFile';
import { commitPostgres } from './lib/postgres';
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
        .demandOption('database');
    },
    (argv) => {
      const config = parsedFile.databases[argv.database];
      if (!config) throw new Error(`${argv.database} config not found`);
      if (config.type === 'postgres') {
        commitPostgres(argv.database, config.connection as any);
      }
    }
  )
  .demandCommand()
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
  }).argv;

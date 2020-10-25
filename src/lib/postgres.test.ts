import test from 'ava';

import { formatBackupCommand, formatCopyToRepoCommand } from './postgres';

test('backup command', (t) => {
  t.snapshot(
    formatBackupCommand(
      {
        containerId: 'my-postgres',
        username: 'postgres',
      },
      '1234',
      'test'
    )
  );
});

test('backup command with docker-compose', (t) => {
  t.snapshot(
    formatBackupCommand(
      {
        containerId: 'my-postgres',
        username: 'postgres',
        useCompose: true,
      },
      '1234',
      'test'
    )
  );
});

test('cp command', (t) => {
  t.snapshot(
    formatCopyToRepoCommand(
      {
        containerId: 'my-postgres',
        username: 'postgres',
      },
      '1234',
      'test',
      { dbPath: '/' }
    )
  );
});

test('cp command with docker-compose', (t) => {
  t.snapshot(
    formatCopyToRepoCommand(
      {
        containerId: 'my-postgres',
        username: 'postgres',
        useCompose: true,
      },
      '1234',
      'test',
      { dbPath: '/' }
    )
  );
});
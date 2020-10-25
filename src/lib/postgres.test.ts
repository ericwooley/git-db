import test from 'ava';

import { formatBackupCommand, formatCopyToRepoCommand } from './postgres';

test('backup command', (t) => {
  t.snapshot(
    formatBackupCommand(
      {
        containerId: 'my-postgres',
        username: 'postgres',
      },
      'my-postgres',
      'test'
    )
  );
});

test('cp command', (t) => {
  t.snapshot(formatCopyToRepoCommand('postgres', 'test', { dbPath: '/' }));
});

test('cp command with docker-compose', (t) => {
  t.snapshot(formatCopyToRepoCommand('postgres', 'test', { dbPath: '/' }));
});

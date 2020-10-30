import test from 'ava';

import { journalValidator } from './journal';
const devJournal = {
  version: '0.0.0',
  databases: {
    dev: {
      tags: {
        latest:
          '6dd5cd8958c8d48232b660a7d7f50a0f52040dbebec4ddea41bc1dd74178838d',
      },
      commits: {
        '6dd5cd8958c8d48232b660a7d7f50a0f52040dbebec4ddea41bc1dd74178838d': {
          date: 1603650956391,
          prev: '',
          file: './.db/pg_dev.sql',
          sha:
            '6dd5cd8958c8d48232b660a7d7f50a0f52040dbebec4ddea41bc1dd74178838d',
          metadata: {
            version: '',
          },
        },
      },
    },
  },
};
test('journal validation', (t) => {
  const isValid = journalValidator.validateSync(devJournal);
  t.truthy(isValid);
});

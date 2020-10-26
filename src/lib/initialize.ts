import { writeFileSync } from 'fs';
import { EOL } from 'os';
import { join } from 'path';

import shelljs from 'shelljs';

import { getDbPath } from './utils';

export function init() {
  shelljs.mkdir('-p', getDbPath());
  const ignorePath = join(getDbPath(), '.gitignore');
  if (!shelljs.test('-e', join(getDbPath(), '.gitignore'))) {
    writeFileSync(
      ignorePath,
      [
        '# these files are used to track current location etc...',
        '.head.yml',
        '.reflog',
        '.lock',
      ].join(EOL)
    );
  }
}

import fs from 'fs';
import path from 'path';

/**
 *
 * @param {Array<(String|Regex)>} fileNames - An array of file names or regex patterns to search for
 * @param {Object} opts - does nothing yet, reserved.
 */
export default function resolveFS(fileNames: readonly string[]) {
  const currentPath = process.cwd().split(path.sep);
  return recursiveCheck(fileNames, currentPath);
}

function recursiveCheck(
  fileNames: readonly string[],
  pathArr: readonly string[]
): readonly string[] {
  if (pathArr.length < 2) {
    return [];
  }
  const pathStr = pathArr.join(path.sep);
  const foundFiles: readonly string[] = fileNames
    .map(checkFilePath(pathStr))
    .reduce((a: readonly string[] = [], b: readonly string[]) => {
      return a.concat(b) || [];
    });
  return foundFiles.concat(
    recursiveCheck(fileNames, pathArr.slice(0, pathArr.length - 1))
  );
}

function checkFilePath(pathStr: string) {
  return (file: string | RegExp): readonly string[] => {
    if (typeof file === 'string') {
      const filePath = path.join(pathStr, file);
      if (fs.existsSync(filePath)) {
        return [filePath];
      } else {
        return [];
      }
    } else if (file instanceof RegExp) {
      return fs
        .readdirSync(pathStr)
        .filter((potentialFile) => potentialFile.match(file))
        .map((f) => path.join(pathStr, f));
    }
    return [];
  };
}

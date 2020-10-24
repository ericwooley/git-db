import fs from 'fs';

import yaml from 'js-yaml';
import * as yup from 'yup';

export function parseFile(file: string): IConfig {
  const fileTypeMatch = file.match(/^.*\.(yml|json|yaml)$/);
  if (!fileTypeMatch)
    throw new Error(
      'Filetype not found, filetypes must end in yml, json, yaml'
    );

  const fileType: string = fileTypeMatch[1];
  if (!fileType || !isFileType(fileType))
    throw new Error(
      'Filetype not found, filetypes must end in yml, json, yaml'
    );
  const parsedFile = readFileByType[fileType](file);
  if (!parsedFile) throw new Error(`Could not parse ${file}`);

  if (isConfig(parsedFile)) return parsedFile;
  // this shouldn't ever happen, since isConfig throws
  throw new Error('Parsed config file is invalid');
}
const isFileType = (f: string): f is FileTypes => {
  if (Object.prototype.hasOwnProperty.call(readFileByType, f)) return true;
  return false;
};

const isConfig = (c: any): c is IConfig => {
  if (!c) throw new Error('Empty config');
  if (typeof c.databases !== 'object')
    throw new Error('databases field is required');
  Object.entries(c.databases).forEach(([dbName, config]) => {
    try {
      validateConfig.validateSync(config);
    } catch (e) {
      console.error(e.toString(), `while validating ${dbName}`);
      throw e;
    }
  });
  return true;
};
type FileTypes = keyof typeof readFileByType;

const readAndParseYaml = (file: string) => {
  return yaml.safeLoad(fs.readFileSync(file, 'utf8'));
};
const readFileByType = {
  yml: readAndParseYaml,
  yaml: readAndParseYaml,
  json: (file: string) => fs.readFileSync(file).toJSON(),
};

interface IConfig {
  databases: { [dbName: string]: yup.InferType<typeof validateConfig> };
}

const validateConfig = yup
  .object({
    type: yup.string().oneOf(['postgres', 'mongodb']).required(),
    connection: yup.object().required(),
  })
  .required();

import fs from 'node:fs';import path from 'node:path';import {ROOT} from './config.js';
export const PREVIEW_CONTROLS=fs.readFileSync(path.join(ROOT,'public','preview-controls.js'),'utf8');

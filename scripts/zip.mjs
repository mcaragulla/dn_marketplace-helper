// Crea dist/dn_marketplace-helper-vX.Y.Z.zip solo con los archivos de la extensión.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
fs.mkdirSync('dist', { recursive: true });
const out = `dist/dn_marketplace-helper-v${version}.zip`;
fs.rmSync(out, { force: true });
execFileSync('zip', ['-r', '-q', out, 'manifest.json', '_locales', 'icons', 'src', 'LICENSE', 'README.md', 'PRIVACY.md'], { stdio: 'inherit' });
console.log('Creado', out);

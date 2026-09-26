const fs = require('node:fs');
const path = require('node:path');

const packagePath = path.join(__dirname, '..', 'node_modules', 'iconv-lite', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

if (packageJson.browser && typeof packageJson.browser === 'object') {
    delete packageJson.browser['./lib/extend-node'];
    delete packageJson.browser['./lib/streams'];
    fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

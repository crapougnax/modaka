#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const targetPkgPath = path.resolve(__dirname, '../package.json');
if (!fs.existsSync(targetPkgPath)) {
  console.error(`File not found: ${targetPkgPath}`);
  process.exit(1);
}

console.log(`[CI] Resolving local portal resolutions for ${targetPkgPath}...`);
const targetPkg = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));

// 1. Remove local portal entries from resolutions block
if (targetPkg.resolutions) {
  for (const resKey in targetPkg.resolutions) {
    if (typeof targetPkg.resolutions[resKey] === 'string' && targetPkg.resolutions[resKey].startsWith('portal:')) {
      console.log(`[CI] Removed local portal resolution: ${resKey}`);
      delete targetPkg.resolutions[resKey];
    }
  }
  if (Object.keys(targetPkg.resolutions).length === 0) {
    delete targetPkg.resolutions;
  }
}

// 2. Replace portal: paths in dependencies with ^1.1.0 SemVer range
for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
  if (!targetPkg[depType]) continue;
  for (const dep in targetPkg[depType]) {
    if (typeof targetPkg[depType][dep] === 'string' && targetPkg[depType][dep].startsWith('portal:')) {
      console.log(`[CI] Resolved portal dependency ${dep} -> ^1.1.0`);
      targetPkg[depType][dep] = '^1.1.0';
    }
  }
}

fs.writeFileSync(targetPkgPath, JSON.stringify(targetPkg, null, 2) + '\n');
console.log(`[CI] Successfully resolved workspace dependencies in package.json.`);

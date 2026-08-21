#!/usr/bin/env node

/**
 * @file resolve-workspaces.cjs
 * @description Prepares package.json for CI builds by replacing local portal: dependencies
 * and checking registry availability. Unpublished 404 packages are safely omitted so yarn install succeeds.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function fetchLatestNpmVersion(packageName) {
  try {
    const version = execSync(`npm view ${packageName} version 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (version) {
      console.log(`[CI] Queried NPM registry for ${packageName} -> ^${version}`);
      return `^${version}`;
    }
  } catch (e) {
    // Not found
  }
  return null;
}

function resolveWorkspaceDependencies() {
  const targetPkgPath = path.resolve(__dirname, '../package.json');
  if (!fs.existsSync(targetPkgPath)) {
    console.error(`File not found: ${targetPkgPath}`);
    process.exit(1);
  }

  console.log(`[CI] Resolving dependencies for ${targetPkgPath}...`);
  const targetPkg = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));

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

  for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (!targetPkg[depType]) continue;
    for (const dep in targetPkg[depType]) {
      const val = targetPkg[depType][dep];
      if (typeof val === 'string' && (val.startsWith('portal:') || dep.startsWith('@quatrain/'))) {
        const resolvedRange = fetchLatestNpmVersion(dep);
        if (resolvedRange) {
          targetPkg[depType][dep] = resolvedRange;
        } else {
          console.log(`[CI] Omitted unpublished package: ${dep}`);
          delete targetPkg[depType][dep];
        }
      }
    }
  }

  fs.writeFileSync(targetPkgPath, JSON.stringify(targetPkg, null, 2) + '\n');
  console.log(`[CI] Successfully prepared package.json for CI build.`);
}

resolveWorkspaceDependencies();

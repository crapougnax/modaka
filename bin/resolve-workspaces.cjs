#!/usr/bin/env node

/**
 * @file resolve-workspaces.cjs
 * @description Prepares package.json for CI builds by replacing local portal: dependencies
 * and resolutions with latest published versions queried directly from the NPM registry.
 * Unpublished 404 packages are safely omitted so yarn install succeeds.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Queries the NPM registry for the latest published version of a given package.
 *
 * @param {string} packageName - The NPM package name (e.g. '@quatrain/chat').
 * @returns {string|null} SemVer range string (^x.y.z) or null if package is not published.
 */
function fetchLatestNpmVersion(packageName) {
  try {
    const version = execSync(`npm view ${packageName} version 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (version) {
      console.log(`[CI] Queried NPM registry for ${packageName} -> ^${version}`);
      return `^${version}`;
    }
  } catch (e) {
    console.warn(`[CI] Package ${packageName} not found on NPM registry.`);
  }
  return null;
}

/**
 * Resolves workspace package.json dependencies for CI deployment.
 */
function resolveWorkspaceDependencies() {
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

  // 2. Query NPM registry for each portal: dependency; resolve to latest version or omit if unpublished 404
  for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (!targetPkg[depType]) continue;
    for (const dep in targetPkg[depType]) {
      if (typeof targetPkg[depType][dep] === 'string' && targetPkg[depType][dep].startsWith('portal:')) {
        const resolvedRange = fetchLatestNpmVersion(dep);
        if (resolvedRange) {
          targetPkg[depType][dep] = resolvedRange;
        } else {
          console.log(`[CI] Omitted unpublished dependency from build: ${dep}`);
          delete targetPkg[depType][dep];
        }
      }
    }
  }

  fs.writeFileSync(targetPkgPath, JSON.stringify(targetPkg, null, 2) + '\n');
  console.log(`[CI] Successfully resolved workspace dependencies in package.json.`);
}

resolveWorkspaceDependencies();

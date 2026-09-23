#!/usr/bin/env node

/**
 * @file resolve-workspaces.cjs
 * @description Prepares package.json for CI and container builds by replacing local portal: dependencies
 * and querying registry availability via native fetch (with npm view fallback).
 * Unpublished 404 packages are safely omitted so dependency installation succeeds.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function fetchLatestNpmVersion(packageName) {
  try {
    const encoded = packageName.startsWith('@')
      ? `@${encodeURIComponent(packageName.slice(1))}`
      : encodeURIComponent(packageName);
    const res = await fetch(`https://registry.npmjs.org/${encoded}`, {
      headers: { 'Accept': 'application/vnd.npm.install-v1+json' }
    });
    if (res.ok) {
      const data = await res.json();
      const version = data['dist-tags']?.latest;
      if (version) {
        console.log(`[CI] Queried NPM registry for ${packageName} -> ^${version}`);
        return `^${version}`;
      }
    }
  } catch (e) {
    // Fallback to npm view if fetch failed
    try {
      const version = execSync(`npm view ${packageName} version 2>/dev/null`, { encoding: 'utf8' }).trim();
      if (version) {
        console.log(`[CI] Queried NPM registry via CLI for ${packageName} -> ^${version}`);
        return `^${version}`;
      }
    } catch (_) {}
  }
  return null;
}

async function resolveWorkspaceDependencies() {
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
        const resolvedRange = await fetchLatestNpmVersion(dep);
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

resolveWorkspaceDependencies().catch((err) => {
  console.error('[CI] Failed to resolve workspace dependencies:', err);
  process.exit(1);
});

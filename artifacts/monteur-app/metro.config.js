// Metro configuratie voor FPS Monteur — pnpm monorepo
// De app staat in een subdirectory van de workspace-root. Metro moet de
// gedeelde workspace-pakketten (lib/, etc.) kunnen vinden via watchFolders.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Voeg de workspace-root toe zodat @workspace/* packages gevonden worden
config.watchFolders = [workspaceRoot];

// Zoek node_modules eerst in de app-map, dan in de workspace-root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Schakel symlink-ondersteuning in (pnpm gebruikt symlinks)
config.resolver.unstable_enableSymlinks = true;

module.exports = config;

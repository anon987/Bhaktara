const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.maxWorkers = 2;
// Agent worktrees under .claude/ are full repo copies; never crawl or bundle them.
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], /[\\/]\.claude[\\/]/);
module.exports = config;

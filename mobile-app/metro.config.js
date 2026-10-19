const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
// Bound worker memory on release/CI machines that also run Gradle.
if (process.env.CI) config.maxWorkers = Math.min(config.maxWorkers, 2);
// Native build trees and package caches contain thousands of generated files
// and are never JavaScript sources. Avoid crawling them during release builds.
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
    ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
    ...["android", "ios", ".npm-cache", "dist"].map(directory => {
        const absolute = path.resolve(__dirname, directory).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`^${absolute}[\\\\/].*`);
    }),
];

module.exports = withNativeWind(config, { input: "./global.css" });

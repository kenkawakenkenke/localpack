#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { promptYesNo } from "./utils/prompt.js";
import * as color from "./utils/color.js";

import serialMap from "./utils/serial_map.js";

const asyncexec = util.promisify(exec);

function parseDependencies(dependencies = []) {
    return Object.entries(dependencies)
        .map(([moduleName, modulePath]) => ({ moduleName, modulePath }));
}

function getLocalDependencies(dependencies) {
    return dependencies.filter(({ modulePath }) => modulePath.match("file:"))
        .filter(({ modulePath }) => !modulePath.match("tgz"))
        .map(({ moduleName, modulePath }) => {
            const parsedPath = modulePath.match("file:(.*)")[1];
            return { moduleName, modulePath: parsedPath };
        });
}

function createModuleInfo(moduleName, modulePath, localDependencies) {
    return {
        moduleName: moduleName,
        modulePath: modulePath,
        localDependencies: localDependencies.map(({ moduleName }) => moduleName),
    };
}

function getLocalDepedencyGraph(localPackConfig) {
    const directDependencies = parseDependencies(localPackConfig.localDependencies);

    let modulesNeedingProcessing = directDependencies.concat();
    let moduleSpecs = {
        "ROOT": createModuleInfo("ROOT", "./", directDependencies),
    };

    while (modulesNeedingProcessing.length > 0) {
        let { moduleName, modulePath } = modulesNeedingProcessing.pop();
        if (moduleSpecs[moduleName]) {
            // console.log("already processed", moduleName);
            continue;
        }
        const packageFile = JSON.parse(fs.readFileSync(path.join(modulePath, "package.json")));
        const localDependencies =
            getLocalDependencies(parseDependencies(packageFile.dependencies));
        localDependencies.forEach(({ moduleName, modulePath }) => {
            modulesNeedingProcessing.push({ moduleName, modulePath });
        });
        const moduleInfo = {
            moduleName: moduleName,
            modulePath: modulePath,
            localDependencies: localDependencies.map(({ moduleName }) => moduleName),
            packageConfig: packageFile,
        };
        moduleSpecs[moduleName] = moduleInfo;
    }
    buildTransitiveClosureGraph(moduleSpecs, "ROOT");
    return moduleSpecs;
}

function buildTransitiveClosureGraph(moduleSpecs, module) {
    if (!moduleSpecs[module].transitiveClosure) {
        let closure = {};
        moduleSpecs[module].localDependencies.forEach(subModule => closure[subModule] = true);
        moduleSpecs[module].localDependencies
            .map(submodule => buildTransitiveClosureGraph(moduleSpecs, submodule))
            .forEach(subclosure => subclosure.forEach(ancestor => closure[ancestor] = true));
        moduleSpecs[module].transitiveClosure = Object.keys(closure);
    }
    return moduleSpecs[module].transitiveClosure;
}

async function packModules(submoduleArchiveDir, submodules) {

    // Now npm pack all the dependent modules.
    const results = await serialMap(submodules,
        async module => asyncexec(`npm pack ${module.modulePath}`));
    const homeFiles = fs.readdirSync("./");

    submodules.forEach(module => {
        const fileName = homeFiles.find(file => file.match(`^${module.moduleName}-[0-9]*\\.[0-9]*\\.[0-9]*\\.tgz$`));
        if (!fileName) throw new Error(`no tgz file for ${module.moduleName} found!`);
        const newFilePath = path.join(submoduleArchiveDir, fileName);
        fs.renameSync(fileName, newFilePath);
        module.archiveName = fileName;
    });
}

function flattenDependencies(modules) {
    // Modules that the key depends on, that haven't been resolved yet.
    let unresolvedDependenciesForModule = {};
    // Modules that have no dependencies.
    let rootParents = [];
    // Modules that depend on the key.
    let dependantsForModule = {};
    modules.forEach(module => {
        unresolvedDependenciesForModule[module.moduleName] = {};
        if (module.localDependencies.length === 0) {
            rootParents.push(module.moduleName);
            return;
        }
        module.localDependencies.forEach(dependency => {
            unresolvedDependenciesForModule[module.moduleName][dependency] = true;

            let dependants = dependantsForModule[dependency] || [];
            dependants.push(module.moduleName);
            dependantsForModule[dependency] = dependants;
        });
    });

    let sortedModules = [];
    let processableModules = rootParents.concat();
    while (processableModules.length > 0) {
        const module = processableModules.pop();
        sortedModules.push(module);
        (dependantsForModule[module] || []).forEach(dependant => {
            delete unresolvedDependenciesForModule[dependant][module];
            if (Object.keys(unresolvedDependenciesForModule[dependant]).length === 0) {
                processableModules.push(dependant);
            }
        });
    }
    return sortedModules;
}

async function redirectSubmoduleArchives(submoduleArchiveDir, sortedSubmodules, moduleSpecsForName) {
    return serialMap(sortedSubmodules,
        async moduleName => {
            const module = moduleSpecsForName[moduleName];
            const archivePath = module.archiveName;

            // console.log(module);

            if (module.localDependencies.length === 0) {
                // console.log("no dependencies, nothing to do.");
                return 0;
            }

            // Unarchive *.tgz -> package
            await asyncexec(`tar -xf ${archivePath}`, { cwd: submoduleArchiveDir });

            const packageDirPath = "package";

            let editedDependencies = { ...module.packageConfig.dependencies };
            module.localDependencies.forEach(dependency => {
                editedDependencies[dependency] = `file:./${moduleSpecsForName[dependency].archiveName}`;
            });
            let editedPackage = {
                ...module.packageConfig,
                dependencies: editedDependencies,
            };
            fs.writeFileSync(path.join(submoduleArchiveDir, packageDirPath, "package.json"),
                JSON.stringify(editedPackage, null, 2));

            // Copy tgz files for dependencies.
            module.transitiveClosure.forEach(dependency => {
                const subModule = moduleSpecsForName[dependency];
                const fromPath = path.join(submoduleArchiveDir, subModule.archiveName);
                const toPath = path.join(submoduleArchiveDir, packageDirPath, subModule.archiveName);
                fs.copyFileSync(fromPath, toPath);
            });

            // Archive back: package -> *.tgz
            await asyncexec(`tar -cf ${archivePath} ${packageDirPath}`, { cwd: submoduleArchiveDir });

            // Delete package folder
            fs.rmdirSync(path.join(submoduleArchiveDir, packageDirPath), { recursive: true });

            return 0;
        });
}

(async () => {
    const rootPackageConfig = JSON.parse(fs.readFileSync("package.json"));

    const localPackConfigFile = "localpack.json";
    if (!fs.existsSync(localPackConfigFile)) {
        console.error(
            color.redBackground(`${localPackConfigFile} is missing!`));
        const answer = await promptYesNo("Do you want to build one from package.json?");
        if (!answer) {
            console.log("Aborting!");
            return;
        }

        const localPackConfig = {
            localDependencies:
                Object.fromEntries(
                    getLocalDependencies(
                        parseDependencies(rootPackageConfig.dependencies))
                        .map(({ moduleName, modulePath }) => [moduleName, modulePath]))
        };
        fs.writeFileSync(localPackConfigFile, JSON.stringify(localPackConfig, null, 2));
        console.log(`Created ${localPackConfigFile}. You should check-in this file.`);
    }
    const localPackConfig = JSON.parse(fs.readFileSync(localPackConfigFile));

    const submoduleArchiveDir = "sub_modules";
    fs.rmSync(submoduleArchiveDir, { recursive: true, force: true });
    fs.mkdirSync(submoduleArchiveDir, { recursive: true });

    const moduleSpecsForName = getLocalDepedencyGraph(localPackConfig);

    const submodules = Object.values(moduleSpecsForName)
        .filter(module => module.moduleName !== "ROOT");

    const sortedSubmodules = flattenDependencies(submodules);

    await packModules(submoduleArchiveDir, submodules);

    await redirectSubmoduleArchives(submoduleArchiveDir, sortedSubmodules, moduleSpecsForName);

    // Now update our own package.json
    moduleSpecsForName["ROOT"].localDependencies.forEach(dependency => {
        const module = moduleSpecsForName[dependency];
        const archivePath = path.join(submoduleArchiveDir, module.archiveName);
        if (!rootPackageConfig.dependencies) {
            rootPackageConfig.dependencies = {};
        }
        rootPackageConfig.dependencies[module.moduleName] = `file:./${archivePath}`;
    });
    fs.writeFileSync("package.json", JSON.stringify(rootPackageConfig, null, 2));
    fs.rmSync("package-lock.json", { force: true });
    fs.rmSync("node_modules", { recursive: true, force: true });

    // const res = await asyncexec(`npm install --cache ./new_cache`);
    const res = await asyncexec(`npm install`);
    console.log(res.stdout);
})();

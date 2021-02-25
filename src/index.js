#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const util = require("util");

const asyncexec = util.promisify(exec);

function serialMap(elements, elementToPromiseFactory) {
    let chain = Promise.resolve([]);
    elements.forEach(element => {
        chain = chain
            .then(chainedRes =>
                elementToPromiseFactory(element).then(res => [...chainedRes, res]));
    });
    return chain;
};

function parseDependencies(dependencies = []) {
    return Object.entries(dependencies)
        .map(([moduleName, modulePath]) => ({ moduleName, modulePath }));
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
            parseDependencies(packageFile.dependencies)
                // Any local dependencies
                .filter(({ modulePath }) => modulePath.match("file:"))
                .map(({ moduleName, modulePath }) => {
                    const parsedPath = modulePath.match("file:(.*)")[1]
                    return {
                        moduleName,
                        modulePath: parsedPath,
                    };
                })
                // That don't use tgz packs. (We assume here that the tgz file is contained within the module directory.
                // If there are submodules that have tgz files outside, then this will break.)
                .filter(({ modulePath }) => !modulePath.match("tgz$"));
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
    const submoduleArchiveDir = "sub_modules";
    fs.rmdirSync(submoduleArchiveDir, { recursive: true });
    fs.mkdirSync(submoduleArchiveDir, { recursive: true });

    const localPackConfig = JSON.parse(fs.readFileSync("localpack.json"));

    const moduleSpecsForName = getLocalDepedencyGraph(localPackConfig);

    const submodules = Object.values(moduleSpecsForName)
        .filter(module => module.moduleName !== "ROOT");

    const sortedModules = flattenDependencies(Object.values(moduleSpecsForName));
    const sortedSubmodules = flattenDependencies(submodules);

    await packModules(submoduleArchiveDir, submodules);

    await redirectSubmoduleArchives(submoduleArchiveDir, sortedSubmodules, moduleSpecsForName);

    // Now update our own package.json
    const rootPackageConfig = JSON.parse(fs.readFileSync("package.json"));
    moduleSpecsForName["ROOT"].localDependencies.forEach(dependency => {
        const module = moduleSpecsForName[dependency];
        const archivePath = path.join(submoduleArchiveDir, module.archiveName);
        rootPackageConfig.dependencies[module.moduleName] = `file:./${archivePath}`;
    });
    fs.writeFileSync("package.json", JSON.stringify(rootPackageConfig, null, 2));
    fs.rmSync("package-lock.json", { force: true });
    fs.rmdirSync("node_modules", { recursive: true });

    // const res = await asyncexec(`npm install --cache ./new_cache`);
    const res = await asyncexec(`npm install`);
    console.log(res.stdout);
})();

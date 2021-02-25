# localpack
Util for copying all local npm dependencies into the main project directory.

This is useful for deploying Cloud Function projects that depend on local modules. (Cloud Functions annoying can't depend on local modules placed outside of your directory.)

# Quick start
First install me:
```
npm install -D localpack
```

Then create `localpack.json` describing all your local dependencies:
```
{
    "localDependencies": {
        "submodule_b": "../submodule_b",
        "submodule_c": "../submodule_c"
    }
}
```
Finally run `npx localpack`.
All your local dependencies (including indirect ones) should be packaged into a new sub_modules folder:
```
sub_modules
 |_ submodule_a-1.0.2.tgz
 |_ submodule_b-1.0.1.tgz
 |_ submodule_c-1.0.3.tgz
 ```
 and your package.json should be updated to point to the archive files:
 ```
 .
 .
  "dependencies": {
    "submodule_b": "file:./sub_modules/submodule_b-1.0.3.tgz",
    "submodule_c": "file:./sub_modules/submodule_c-1.0.3.tgz"
  },
  .
  .
  ```
You should also put the `sub_modules` folder in .gitignore:
```
sub_modules/
```
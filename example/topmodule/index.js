import moduleB from "submodule_b";
import moduleC from "submodule_c";

const depends = () => ({
    iam: "mymodule 1.0.0",
    dependOn: [
        moduleB.depends(),
        moduleC.depends(),
    ]
});

console.log(JSON.stringify(depends(), null, 2));

import moduleA from "submodule_a";
import moduleB from "submodule_b";

const depends = () => ({
    iam: "submodule C 1.0.0",
    dependOn: [
        moduleA.depends(),
        moduleB.depends(),
    ]
});

export default {
    depends
}

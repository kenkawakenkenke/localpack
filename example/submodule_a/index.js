import moduleX from "submodule_x";

const depends = () => ({
    iam: "submodule A 1.0.0",
    dependOn: [
        moduleX.depends(),
    ]
});

export default {
    depends
}

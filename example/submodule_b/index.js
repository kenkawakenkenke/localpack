import moduleA from "submodule_a";

const depends = () => ({
    iam: "submodule B 1.0.0",
    dependOn: [
        moduleA.depends(),
    ]
});

export default {
    depends
}

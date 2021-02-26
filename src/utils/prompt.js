import readline from "readline";

async function prompt(question) {
    const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        readlineInterface.question(question, (answer) => {
            resolve(answer.trim());
            readlineInterface.close();
        });
    });
};

async function promptYesNo(question) {
    const answer = await prompt(`${question} [Y/n] `);
    console.log("[", answer, "]");
    return answer.length === 0 || !!answer.match("^[Yy]");
}
export {
    prompt, promptYesNo
};
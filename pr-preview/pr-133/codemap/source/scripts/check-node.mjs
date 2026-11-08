const requiredMajor = 22;
const currentMajor = Number(process.versions.node.split(".")[0]);

if (currentMajor < requiredMajor) {
  console.error("");
  console.error(`This repo requires Node ${requiredMajor}+; found ${process.version}.`);
  console.error("Run `nvm use`, or switch your shell to a Node 22+ runtime, then retry.");
  console.error("");
  process.exit(1);
}

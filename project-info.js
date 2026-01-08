const fs = require("fs");
const path = require("path");

// اسم المشروع (اسم المجلد)
const projectName = path.basename(process.cwd());

// قراءة package.json
const packageJsonPath = path.join(process.cwd(), "package.json");
let mainFile = "";
let startCommand = "";
if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    mainFile = packageJson.main || "server.js";
    startCommand = packageJson.scripts?.start || "node " + mainFile;
}

// قراءة متغيرات البيئة من .env
let envVars = {};
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
        if (line.includes("=")) {
            const [key, value] = line.split("=");
            envVars[key.trim()] = value.trim();
        }
    }
}

console.log("Project Name:", projectName);
console.log("Main File:", mainFile);
console.log("Start Command:", startCommand);
console.log("Environment Variables:", envVars);

const { spawn } = require('child_process');

function fail(msg) {
    process.stderr.write(msg + '\n');
    process.exit(1);
}

function info(msg) {
    process.stdout.write(msg + '\n');
}

const args = process.argv.slice(2);
const action = args[0] || 'server';

try {
    require('dotenv').config();
} catch (e) { }

const major = Number(String(process.versions.node || '').split('.')[0] || 0);
if (!Number.isFinite(major) || major < 18) {
    fail(`Node.js version غير مدعومة: ${process.versions.node}`);
}

const testspriteKey = process.env.TESTSPRITE_API_KEY || process.env.API_KEY || '';
if (!testspriteKey) {
    fail(
        [
            'TestSprite محتاج TESTSPRITE_API_KEY (أو API_KEY) عشان يشتغل.',
            'حل سريع (مؤقت) في PowerShell قبل التشغيل:',
            '$env:TESTSPRITE_API_KEY="ضع_المفتاح_هنا"',
            '',
            'حل دائم (محلي) بدون ما تكتبه كل مرة:',
            'اكتب TESTSPRITE_API_KEY داخل ملف .env في جذر المشروع (الملف متجاهَل في Git).',
            '',
            'ثم شغّل:',
            `npm run testsprite:${action}`
        ].join('\n')
    );
}

let subcommand = 'server';
if (action === 'server') subcommand = 'server';
else if (action === 'run') subcommand = 'generateCodeAndExecute';
else if (action === 'rerun') subcommand = 'reRunTests';
else {
    fail(`أمر غير معروف: ${action}\nاستخدم: server | run | rerun`);
}

info(`تشغيل TestSprite: ${subcommand}`);

const cmdLine = `npx --yes testsprite-mcp-plugin ${subcommand}`;
const childEnv = {
    ...process.env,
    API_KEY: process.env.API_KEY || testspriteKey
};
const child = spawn(cmdLine, {
    stdio: 'inherit',
    env: childEnv,
    shell: true
});

child.on('exit', (code) => {
    process.exit(code || 0);
});

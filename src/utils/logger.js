const axios = require('axios');
function hookConsoleAndStreams(webhookUrl) {
    if (!webhookUrl) return;
    let logBuffer = [];
    const originalStdout = process.stdout.write.bind(process.stdout);
    const originalStderr = process.stderr.write.bind(process.stderr);
    const stripAnsi = (str) => str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    function hookStream(originalFn) {
        return function (chunk, encoding, callback) {
            if (chunk) logBuffer.push(stripAnsi(chunk.toString()));
            return originalFn(chunk, encoding, callback);
        };
    }
    process.stdout.write = hookStream(originalStdout);
    process.stderr.write = hookStream(originalStderr);
    setInterval(async () => {
        if (!logBuffer.length) return;
        const logs = logBuffer.join('').substring(0, 1900);
        logBuffer = [];
        try {
            await axios.post(webhookUrl, { content: `\`\`\`prolog\n${logs}\n\`\`\`` });
        } catch (e) { }
    }, 3000);
}
module.exports = { hookConsoleAndStreams };
// Read-only deployment preflight. Run before sharing an APK against a new backend.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

async function main() {
    const configPath = path.resolve(__dirname, '../mobile-app/.env');
    const config = fs.existsSync(configPath) ? dotenv.parse(fs.readFileSync(configPath)) : {};
    const configured = process.argv[2] || process.env.EXPO_PUBLIC_API_URL || config.EXPO_PUBLIC_API_URL || 'https://my-ultimate-app-all.vercel.app/api';
    const base = new URL(configured.replace(/\/+$/, '') + '/');
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw Error('Use a plain HTTP(S) API base URL.');
    const routes = ['mobile/finance?resource=categories', 'mobile/tasks', 'mobile/settings', 'mobile/interview', 'mobile/sms', 'mobile/resume-ai', 'mobile/transactions/bulk'];
    const results = await Promise.all(routes.map(async route => {
        try {
            const response = await fetch(new URL(route, base), { redirect: 'manual', signal: AbortSignal.timeout(20000) });
            // Authenticated GET handlers reject anonymous users; write-only handlers
            // reject GET. Neither check reads account data or creates records.
            const present = [401, 403, 405].includes(response.status);
            await response.body?.cancel();
            return { route, status: response.status, present };
        } catch (error) { return { route, status: error.name, present: false }; }
    }));
    console.log('Android backend preflight: ' + base.origin + base.pathname);
    for (const item of results) console.log(`${item.present ? 'PASS' : 'FAIL'} ${item.status} ${item.route}`);
    if (results.some(item => !item.present)) {
        console.error('Deploy the matching backend before distributing this Android build.');
        process.exitCode = 1;
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

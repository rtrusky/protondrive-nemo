import './polyfills';

import { homedir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';

import { initDrive } from './sdk-bootstrap/init';
import { mount, unmount } from './mount';

const DEFAULT_MOUNT_POINT = path.join(homedir(), 'ProtonDrive');
const APP_VERSION = 'external-drive-protondrive_nemo@0.1.0-alpha';
const DISCLOSURE = 'protondrive-nemo is a third-party application, not officially supported by Proton.';

async function drive() {
    return initDrive({
        appVersion: APP_VERSION,
        clientUidPrefix: 'protondrive-nemo',
    });
}

const program = new Command();
program.name('protondrive-nemo').description(`Unofficial FUSE mount of Proton Drive. ${DISCLOSURE}`);

program
    .command('login')
    .description('Sign in to Proton Drive via your browser')
    .action(async () => {
        console.log(DISCLOSURE);
        const d = await drive();
        if (d.auth.isLoggedIn()) {
            console.log('Already logged in.');
            await d.dispose();
            process.exit(0);
        }
        await d.auth.authViaWeb(async (signInUrl) => {
            console.log(`Opening browser to sign in:\n  ${signInUrl}`);
            await import('open')
                .then((mod) => mod.default(signInUrl))
                .catch(() => {
                    console.log('Could not open a browser automatically — open the URL above manually.');
                });
        });
        console.log('Logged in.');
        await d.dispose();
        // The account API's HTTP keep-alive connection otherwise holds the
        // process open — this command is done, so exit explicitly.
        process.exit(0);
    });

program
    .command('logout')
    .description('Sign out and remove the locally stored session')
    .action(async () => {
        const d = await drive();
        await d.auth.logout();
        console.log('Logged out.');
        await d.dispose();
        process.exit(0);
    });

program
    .command('status')
    .description('Show login and mount status')
    .action(async () => {
        const d = await drive();
        console.log(`Logged in: ${d.auth.isLoggedIn()}`);
        console.log(`Mount point: ${DEFAULT_MOUNT_POINT}`);
        await d.dispose();
        process.exit(0);
    });

program
    .command('mount')
    .description('Mount Proton Drive as a folder (runs in the foreground until interrupted)')
    .option('-m, --mount-point <path>', 'mount point', DEFAULT_MOUNT_POINT)
    .action(async (opts: { mountPoint: string }) => {
        const d = await drive();
        const fuse = await mount(d, opts.mountPoint);
        console.log(`Mounted Proton Drive at ${opts.mountPoint}`);

        const shutdown = async () => {
            console.log('\nUnmounting...');
            await new Promise<void>((resolve) => fuse.unmount((err) => {
                if (err) console.error('Unmount failed:', err);
                resolve();
            }));
            await d.dispose();
            process.exit(0);
        };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
    });

program
    .command('unmount')
    .description('Unmount Proton Drive')
    .option('-m, --mount-point <path>', 'mount point', DEFAULT_MOUNT_POINT)
    .action(async (opts: { mountPoint: string }) => {
        await unmount(opts.mountPoint);
        console.log(`Unmounted ${opts.mountPoint}`);
        process.exit(0);
    });

program.parseAsync(process.argv).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});

#!/usr/bin/env node
/*
 * Bibles + grids sync: ~/Documents/Corson Agency/  →  Google Drive mount.
 *
 * Wraps rsync with the exact flags from Push 1's manual run:
 *   rsync -av --update --exclude=.DS_Store SRC/ DST/
 *
 * Why these flags:
 *   -a            archive (perms, mtimes, recursive — preserves history)
 *   --update      don't overwrite a newer file on the receiver
 *                 (so a Drive-side edit isn't clobbered if it's newer)
 *   --exclude     keep Finder cruft out of Drive
 *   NO --delete   additive only — never remove anything from Drive
 *
 * Silent on success or "nothing to sync." Stderr warning + skip if the
 * Drive mount path doesn't exist (Drive Desktop not running, offline,
 * etc.) — the local copy is the source of truth, sync catches up later.
 *
 * Two ways to use:
 *   1) Standalone:   `node scripts/sync-drive.js`
 *   2) From a parent script:
 *        const { syncDrive } = require('./sync-drive');
 *        const result = await syncDrive();
 *        if (result.transferred > 0) console.log(`synced ${result.transferred} to Drive`);
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC = path.join(process.env.HOME, 'Documents', 'Corson Agency');
const DST = path.join(
  process.env.HOME,
  'Library',
  'CloudStorage',
  'GoogleDrive-dho@corsonagency.com',
  'My Drive',
  'Corson Agency'
);

/**
 * Sync local Documents/Corson Agency → Drive mount.
 * @returns {Promise<{ success: boolean, transferred: number, skipped?: boolean, error?: string }>}
 */
function syncDrive() {
  return new Promise((resolve) => {
    if (!fs.existsSync(SRC)) {
      resolve({ success: false, transferred: 0, error: `Source not found: ${SRC}` });
      return;
    }
    if (!fs.existsSync(DST)) {
      // Drive mount missing — Drive Desktop isn't running, or user is offline.
      // Skip silently with a stderr breadcrumb. This is not a failure.
      process.stderr.write(`sync-drive: Drive mount not found at ${DST} — skipping (Drive Desktop offline?)\n`);
      resolve({ success: true, transferred: 0, skipped: true });
      return;
    }

    const args = [
      '-a',
      '--update',
      '--exclude=.DS_Store',
      '--stats',
      SRC + '/',
      DST + '/',
    ];
    const child = spawn('rsync', args);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('error', (err) => {
      resolve({ success: false, transferred: 0, error: err.message });
    });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          transferred: 0,
          error: stderr.trim() || `rsync exited with code ${code}`,
        });
        return;
      }
      // Parse "Number of regular files transferred: N" (BSD/macOS rsync 2.6.9)
      // or "Number of files transferred: N" (newer rsync). Cover both.
      const m = stdout.match(/Number of (?:regular )?files transferred:\s*(\d+)/);
      const transferred = m ? parseInt(m[1], 10) : 0;
      resolve({ success: true, transferred });
    });
  });
}

module.exports = { syncDrive };

// Standalone CLI entry
if (require.main === module) {
  syncDrive().then((result) => {
    if (!result.success) {
      process.stderr.write(`sync-drive FAILED: ${result.error}\n`);
      process.exit(1);
    }
    if (result.skipped) {
      // stderr warning already written
      process.exit(0);
    }
    if (result.transferred > 0) {
      console.log(`synced ${result.transferred} file(s) to Drive`);
    }
    // Silent on zero transfer
    process.exit(0);
  });
}

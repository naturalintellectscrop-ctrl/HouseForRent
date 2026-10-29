// Stop the isolated test rig (scripts/test-rig.mjs): the app on :3111 and
// the PGlite socket server on :5511. Fixture media stays in /tmp and can be
// removed safely; nothing here ever touches production.
import { execFileSync } from 'node:child_process';

for (const port of [3111, 5511]) {
  try {
    execFileSync('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
    console.log(`stopped :${port}`);
  } catch {
    console.log(`:${port} was not running`);
  }
}

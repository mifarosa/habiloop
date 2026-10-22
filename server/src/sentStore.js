import fs from 'node:fs';
import path from 'node:path';

// Remembers which reminders were already sent, in a small JSON file, so restarting
// the service never sends the same reminder twice.
export function fileSentStore(dir) {
  const file = path.join(dir, 'sent.json');
  fs.mkdirSync(dir, { recursive: true });
  return {
    load() {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        return {};
      }
    },
    save(sent) {
      // Write to a temp file first so a crash mid-write cannot leave a broken file.
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(sent));
      fs.renameSync(tmp, file);
    },
  };
}

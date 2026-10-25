import { createInterface } from 'node:readline';

function cancelled() {
  const error = new Error('Cancelled; no configuration changes applied.');
  error.exitCode = 130;
  return error;
}

export function prompts() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });
  const lines = rl[Symbol.asyncIterator]();
  rl.on('SIGINT', () => rl.close());
  return {
    async text(label, current = '') {
      const displayed =
        typeof current === 'string' ? current : JSON.stringify(current);
      process.stdout.write(`${label}${displayed ? ` [${displayed}]` : ''}: `);
      const next = await lines.next();
      if (
        next.done ||
        ['q', 'cancel'].includes(next.value.trim().toLowerCase())
      )
        throw cancelled();
      return next.value.trim() || current;
    },
    async confirm(label) {
      return /^(y|yes)$/i.test(await this.text(`${label} (y/N)`));
    },
    close() {
      rl.close();
    },
  };
}

import * as pty from '@lydell/node-pty';
import { stripVTControlCharacters } from 'node:util';

let terminal;
let output = '';
let index = 0;
process.on('message', (message) => {
  if (message.type === 'release') process.exit(0);
  if (message.type === 'abort') {
    terminal?.kill();
    process.exit(1);
  }
  if (message.type !== 'start') return;
  const { argv, cwd, env, steps } = message;
  let visible = '';
  terminal = pty.spawn(process.execPath, argv, {
    cwd,
    env,
    cols: 120,
    rows: 40,
    name: 'xterm-256color',
    useConptyDll: process.platform === 'win32',
  });
  terminal.onData((data) => {
    output += data;
    visible += stripVTControlCharacters(data);
    if (
      index < steps.length &&
      new RegExp(steps[index].source, steps[index].flags).test(visible)
    ) {
      const step = steps[index++];
      visible = '';
      terminal.write(step.send);
    }
  });
  terminal.onExit(({ exitCode }) => {
    // The parent inspects owned task processes while this PTY is still alive.
    // It then releases this host, avoiding kill-by-stale-PID cleanup after exit.
    process.send({
      type: 'result',
      status: exitCode,
      stdout: stripVTControlCharacters(output),
      stderr: '',
      steps: index,
    });
  });
});

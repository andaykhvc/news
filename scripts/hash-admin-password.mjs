import { scryptSync, randomBytes } from 'node:crypto';
// Read from a password manager pipe or silent shell input, never a command-line argument.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const password = input.replace(/\r?\n$/, '');
if (password.length < 16 || password.length > 200)
  throw new Error('Use a unique password of 16–200 characters');
const salt = randomBytes(24).toString('hex');
console.log(`${salt}:${scryptSync(password, salt, 64).toString('hex')}`);

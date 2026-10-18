// Skapar en ny familjenyckel. Lägg den som GitHub Secret FAMILY_KEY.
// Webbsidan öppnas sedan med  https://<användare>.github.io/<repo>/#k=<nyckel>
import { webcrypto as crypto } from 'node:crypto';

const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const site = process.argv[2] || 'https://pjan-code.github.io/family/';
console.log(`\nFAMILY_KEY (GitHub Secret):\n${key}\n`);
console.log(`Länk till surfplattan / bokmärke:\n${site}#k=${key}\n`);
console.log('Dela länken bara inom familjen. Byt nyckel = kör igen, uppdatera secret, uppdatera bokmärken.\n');

/** Erzeugt den Wert für ADMIN_PASSWORD_HASH: npm run hash-password -- "mein Passwort" */
import { hashPassword } from "../src/lib/password";
const pw = process.argv[2];
if (!pw || pw.length < 12) { console.error("Passwort mit mindestens 12 Zeichen als Argument übergeben."); process.exit(1); }
console.log(hashPassword(pw));

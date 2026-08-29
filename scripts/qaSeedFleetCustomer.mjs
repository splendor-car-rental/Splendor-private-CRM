// QA-only: seeds one vehicle + one customer via the real running app server
// (not direct Firestore writes) so all server-side defaulting/normalization
// runs exactly as it would in production. Requires the emulators + server
// from docs/QA_TEST_ENVIRONMENT.md to already be running.
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const APP = 'http://127.0.0.1:3000';

async function signIn(email, password) {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=any`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.idToken;
}

const ceoToken = await signIn('qa-ceo@splendor.test', 'Passw0rd!');

const vehicleRes = await fetch(`${APP}/api/fleet`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
  body: JSON.stringify({
    vin: `QA-VIN-${Date.now()}`, plateNumber: 'D-99999', plateCity: 'Dubai',
    make: 'Bugatti', model: 'Chiron', year: 2024, category: 'hypercar',
    dailyRate: 6500, weeklyRate: 40000, monthlyRate: 150000, minDeposit: 20000
  })
});
const vehicle = await vehicleRes.json();
console.log('vehicle', vehicleRes.status, vehicle.id);

const customerRes = await fetch(`${APP}/api/customers`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
  body: JSON.stringify({
    fullName: 'QA Discount Test Client', email: `qa-discount-${Date.now()}@example.test`,
    phone: `+971 55 ${Date.now() % 10000000}`, idType: 'emirates_id', idNumber: `784-1990-${Date.now() % 10000000}-1`
  })
});
const customer = await customerRes.json();
console.log('customer', customerRes.status, customer.id);

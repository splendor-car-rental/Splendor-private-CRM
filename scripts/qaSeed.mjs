process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'splendor-private-crm';
import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'splendor-private-crm' });

const users = [
  { uid: 'qa-ceo', email: 'qa-ceo@splendor.test', password: 'Passw0rd!', name: 'QA CEO', role: 'ceo' },
  { uid: 'qa-ops', email: 'qa-ops@splendor.test', password: 'Passw0rd!', name: 'QA Operations', role: 'operations' },
  { uid: 'qa-sales', email: 'qa-sales@splendor.test', password: 'Passw0rd!', name: 'QA Sales', role: 'sales' },
];

for (const u of users) {
  try {
    await admin.auth().createUser({ uid: u.uid, email: u.email, password: u.password, displayName: u.name });
  } catch (e) {
    if (e.code !== 'auth/uid-already-exists') throw e;
  }
  await admin.firestore().collection('users').doc(u.uid).set({
    name: u.name, email: u.email, role: u.role, status: 'active', createdAt: new Date().toISOString()
  }, { merge: true });
  console.log('seeded', u.uid, u.role);
}
process.exit(0);

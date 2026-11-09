// Run only against the disposable Pages worker created by e2e-preview.sh.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { parse } from 'devalue';

const [base, persistDir] = process.argv.slice(2);
assert(base?.startsWith('http://127.0.0.1:') && persistDir?.startsWith('/tmp/wsmc-e2e-preview-'));
const admin = 'e2e-coordinator-session';
const regional = 'e2e-regional-session';
const staffPath = '/contests/contest-region-2/staff';
const adminPath = '/admin/users';
function sql(query) {
	const output = execFileSync('npx', ['wrangler', 'd1', 'execute', 'wsmc-db', '--local', '--persist-to', persistDir, '--json', '--command', query], { encoding: 'utf8' });
	return JSON.parse(output)[0].results;
}
async function action(path, name, session, values, expected = 200) {
	const response = await fetch(`${base}${path}?/${name}`, {
		method: 'POST', headers: { Origin: base, Cookie: `wsmc_session=${session}`, Accept: 'application/json', 'x-sveltekit-action': 'true' },
		body: new URLSearchParams(values), redirect: 'manual',
	});
	const result = await response.json();
	assert.equal(result.status ?? response.status, expected, `${path}: ${name}`);
	if (name === 'qr' && expected === 200) {
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.equal(result.type, 'success');
		return parse(result.data).qr;
	}
}
async function consume(qr, expected) {
	const response = await fetch(qr.signInUrl, { redirect: 'manual' });
	assert.equal(response.status, expected);
	if (expected === 303) {
		const cookie = response.headers.get('set-cookie');
		assert.match(cookie, /wsmc_session=[^;]+;.*HttpOnly/i);
		const home = await fetch(`${base}/my-schools`, { headers: { Cookie: cookie.split(';')[0] }, redirect: 'manual' });
		assert.equal(home.status, 200, 'Scanned coach can use their assigned account');
	}
}

sql("INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES ('qr-scorekeeper-session', 'user-scorekeeper-2', 4102444800000, 1700000000000, 1700000000000);");

// These attempts reach real route/service authorization with valid sessions.
await action(adminPath, 'qr', regional, { userId: 'user-coach-gamma' }, 403);
await action(staffPath, 'qr', 'qr-scorekeeper-session', { userId: 'user-coach-gamma' }, 403);
await action('/contests/contest-region-1/staff', 'qr', regional, { userId: 'user-scorekeeper' }, 403);
await action(staffPath, 'qr', regional, { userId: 'user-coach-alpha-1' }, 403);

// A coach/scorekeeper who is also privileged must not be impersonated by a coordinator.
sql("INSERT INTO coach_assignments (user_id, season_id, school_id) VALUES ('user-coordinator', 'season-2026', 'school-gamma'), ('user-regional-coordinator-2', 'season-2026', 'school-gamma');");
for (const userId of ['user-coordinator', 'user-regional-coordinator-2']) {
	await action(staffPath, 'qr', regional, { userId }, 403);
}
sql("DELETE FROM coach_assignments WHERE user_id IN ('user-coordinator', 'user-regional-coordinator-2') AND school_id = 'school-gamma';");

// The actual buttons submit ordinary HTML forms, not enhanced JSON actions.
for (const [path, session] of [[adminPath, admin], [staffPath, regional]]) {
	const response = await fetch(`${base}${path}?/qr`, {
		method: 'POST', headers: { Origin: base, Cookie: `wsmc_session=${session}`, Accept: 'text/html' },
		body: new URLSearchParams({ userId: 'user-coach-gamma' }),
	});
	assert.equal(response.status, 200, 'Ordinary form submission renders the QR panel');
	assert.equal(response.headers.get('cache-control'), 'no-store');
	assert((await response.text()).includes('data:image/svg+xml,'), 'QR image appears in HTML');
}

// Pending accounts activate without any email delivery. Existing sessions are retained.
sql("UPDATE users SET status = 'pending' WHERE id = 'user-coach-gamma';");
const first = await action(staffPath, 'qr', regional, { userId: 'user-coach-gamma' });
assert(first.expiresAt > Date.now() && first.expiresAt <= Date.now() + 300000);
assert.equal(new URL(first.signInUrl).origin, base);
assert(first.image.startsWith('data:image/svg+xml,'));
const rawToken = new URL(first.signInUrl).pathname.split('/').at(-1);
const stored = sql(`SELECT token_hash, expires_at - created_at AS ttl FROM sign_in_tokens WHERE id = '${first.tokenId}';`)[0];
assert.equal(stored.token_hash, createHash('sha256').update(rawToken).digest('hex'));
assert.equal(stored.ttl, 300000);

// Optional independent scan check, enabled on machines with librsvg and zbar.
if (process.env.WSMC_VERIFY_QR_IMAGE === '1') {
	const svgPath = `${persistDir}/qr.svg`;
	const pngPath = `${persistDir}/qr.png`;
	writeFileSync(svgPath, decodeURIComponent(first.image.split(',')[1]));
	execFileSync('rsvg-convert', ['-o', pngPath, svgPath]);
	const decoded = execFileSync('zbarimg', ['--quiet', '--raw', pngPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	assert.equal(decoded, first.signInUrl, 'A separate decoder reads the actual QR credential');
}
await consume(first, 303);
await consume(first, 400);
assert.equal(sql("SELECT status FROM users WHERE id = 'user-coach-gamma';")[0].status, 'active');

const replaced = await action(staffPath, 'qr', regional, { userId: 'user-coach-gamma' });
const current = await action(adminPath, 'qr', admin, { userId: 'user-coach-gamma' });
await consume(replaced, 400);
await action(staffPath, 'revokeQr', regional, { userId: 'user-coach-gamma', tokenId: current.tokenId });
await consume(current, 400);

const expired = await action(staffPath, 'qr', regional, { userId: 'user-coach-gamma' });
sql(`UPDATE sign_in_tokens SET created_at = 1000, expires_at = 2000 WHERE id = '${expired.tokenId}';`);
await consume(expired, 400);
const disabled = await action(adminPath, 'qr', admin, { userId: 'user-coach-gamma' });
await action(adminPath, 'disable', admin, { userId: 'user-coach-gamma' });
await consume(disabled, 400);
await action(staffPath, 'qr', regional, { userId: 'user-coach-gamma' }, 400);
await action(adminPath, 'qr', admin, { userId: 'user-coach-gamma' }, 400);
await action(adminPath, 'enable', admin, { userId: 'user-coach-gamma' });

const scorekeeperQr = await action(staffPath, 'qr', regional, { userId: 'user-scorekeeper-2' });
await action(staffPath, 'revokeQr', regional, { userId: 'user-scorekeeper', tokenId: scorekeeperQr.tokenId }, 403);
assert.equal(sql(`SELECT revoked_at FROM sign_in_tokens WHERE id = '${scorekeeperQr.tokenId}';`)[0].revoked_at, null);
await action(staffPath, 'revokeQr', regional, { userId: 'user-scorekeeper-2', tokenId: scorekeeperQr.tokenId });
const audit = sql("SELECT actor_user_id, details_json FROM audit_events WHERE action = 'qr_sign_in_issued' AND entity_id = 'user-coach-gamma';");
assert(audit.some(row => row.actor_user_id === 'user-regional-coordinator-2'));
assert(audit.some(row => row.actor_user_id === 'user-coordinator'));
assert(audit.every(row => !row.details_json.includes('auth/callback') && !row.details_json.includes(rawToken)));
console.log('QR sign-in journey passed: authorization, activation, replay, expiry, replacement, revocation, disabled users, and local encoding.');

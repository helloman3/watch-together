// Automated E2E test for the WebM/JPEG relay fallback plumbing.
// Spawns the real server, connects 3 simulated clients, and verifies every
// relay event: subscribe -> viewers notify -> chunk relay -> nudge -> cleanup.
//
// Run:  node test-relay-e2e.js

const { spawn } = require('child_process');
const path = require('path');

let io;
try {
  io = require(path.join(__dirname, '..', 'client', 'node_modules', 'socket.io-client'));
} catch (e) {
  console.error('FATAL: socket.io-client not found at ../client/node_modules');
  process.exit(2);
}

const PORT = process.env.TEST_PORT || 3987;
const URL = `http://localhost:${PORT}`;
const ROOM = 'RELAY1';

let passed = 0;
let failed = 0;

function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra ? ' -> ' + extra : ''}`);
  }
}

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], timeout: 5000 });
    s.once('connect', () => resolve(s));
    s.once('connect_error', (e) => reject(e));
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => {
    let done = false;
    // NOTE: with .timeout(), the ack callback is (err, ...response)
    socket.timeout(3000).emit(event, payload, (err, resp) => {
      if (!done) {
        done = true;
        resolve(err ? { __error: String(err) } : (resp === undefined ? null : resp));
      }
    });
    setTimeout(() => { if (!done) { done = true; resolve({ __error: 'no-ack' }); } }, 3500);
  });
}

function waitFor(socket, event, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, timeoutMs);
    const handler = (data) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`\nStarting server on :${PORT} ...`);
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d.toString(); });
  server.stderr.on('data', (d) => { serverLog += d.toString(); });

  try {
    await sleep(900);
    if (!serverLog.includes('WATCH TOGETHER SERVER IS LIVE')) {
      throw new Error('Server did not start:\n' + serverLog);
    }

    // ---- Setup ----
    console.log('\n[Setup] Connecting clients...');
    const sA = await connect();
    const sB = await connect();
    const sC = await connect();

    const crA = await emitAck(sA, 'create_room', { roomCode: ROOM, name: 'HostA' });
    ok('A creates room', !!(crA && crA.success));

    const jrB = await emitAck(sB, 'join_room', { roomId: ROOM, name: 'Bob' });
    ok('B joins room', !!(jrB && jrB.success));

    const jrC = await emitAck(sC, 'join_room', { roomId: ROOM, name: 'Carol' });
    ok('C joins room', !!(jrC && jrC.success));

    // Sharer announces sharing BEFORE viewers subscribe (mirrors real app flow)
    sA.emit('screen_share_status', { isSharing: true });
    await sleep(150);

    // ---- Test 1: webm subscription notifies sharer ----
    console.log('\n[1] Subscribe (webm) -> sharer notified with modes');
    const viewersP1 = waitFor(sA, 'screen_relay_viewers');
    sB.emit('screen_relay_subscribe', { mode: 'webm' });
    const v1 = await viewersP1;
    ok('sharer got viewers event', !!v1);
    ok('count == 1', v1 && v1.count === 1, JSON.stringify(v1));
    ok('hasWebm == true', !!(v1 && v1.hasWebm), JSON.stringify(v1));
    ok('hasJpeg == false', !!(v1 && v1.hasJpeg === false), JSON.stringify(v1));

    // ---- Test 2: sharer relays binary chunk ----
    console.log('\n[2] Sharer relays WebM segment to subscriber');

    const chunkP = waitFor(sB, 'screen_relay_webm');
    const payload = {
      sid: 1,
      mime: 'video/webm;codecs="vp8,opus"',
      data: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03])
    };
    const ack1 = await emitAck(sA, 'screen_relay_webm', payload);
    ok('sharer send acked ok:true', !!(ack1 && ack1.ok === true));

    const seg = await chunkP;
    ok('viewer received segment', !!seg);
    ok('segment sid matches', !!(seg && seg.sid === 1));
    ok(
      'binary payload intact',
      !!(seg && seg.data && seg.data.length === payload.data.length &&
        Array.from(seg.data.slice(0, 4)).join() === '26,69,223,163'),
      seg && seg.data ? Array.from(seg.data.slice(0, 4)).join() : 'none'
    );
    ok('mime forwarded', !!(seg && seg.mime === payload.mime));

    // ---- Test 3: non-sharer cannot inject chunks ----
    console.log('\n[3] Non-sharer injection rejected');
    const leakP = waitFor(sB, 'screen_relay_webm', 800);
    const ackBad = await emitAck(sC, 'screen_relay_webm', { sid: 9, mime: 'x', data: new Uint8Array([9]) });
    ok('non-sharer acked ok:false', !!(ackBad && ackBad.ok === false));
    const leaked = await leakP;
    ok('nothing leaked to viewers', leaked === null);

    // ---- Test 4: stall nudge reaches sharer ----
    console.log('\n[4] Stall nudge forwarding');
    const nudgeP = waitFor(sA, 'screen_relay_nudge');
    sB.emit('screen_relay_nudge');
    const nudged = await nudgeP;
    ok('nudge delivered to sharer', nudged !== null);

    // ---- Test 5: mixed modes reported ----
    console.log('\n[5] Mixed jpeg+webm viewers summarized');
    const viewersP2 = waitFor(sA, 'screen_relay_viewers');
    sC.emit('screen_relay_subscribe', { mode: 'jpeg' });
    const v2 = await viewersP2;
    ok('count == 2', !!(v2 && v2.count === 2), JSON.stringify(v2));
    ok('hasWebm && hasJpeg', !!(v2 && v2.hasWebm && v2.hasJpeg), JSON.stringify(v2));

    // ---- Test 6: disconnect cleanup updates counts ----
    console.log('\n[6] Disconnect cleanup');
    const viewersP3 = waitFor(sA, 'screen_relay_viewers');
    sC.disconnect();
    const v3 = await viewersP3;
    ok('count drops back to 1', !!(v3 && v3.count === 1), JSON.stringify(v3));

    const viewersP4 = waitFor(sA, 'screen_relay_viewers');
    sB.emit('screen_relay_unsubscribe');
    const v4 = await viewersP4;
    ok('unsubscribe -> count 0 (sharer stops pump)', !!(v4 && v4.count === 0), JSON.stringify(v4));

    sA.disconnect();
    sB.disconnect();

    // ---- Summary ----
    console.log('\n==================================================');
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log('==================================================\n');
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('\nTEST RUNNER ERROR:', err.message);
    console.error(serverLog.slice(-800));
    process.exitCode = 2;
  } finally {
    try { server.kill(); } catch (e) {}
    setTimeout(() => process.exit(process.exitCode || 0), 300);
  }
})();

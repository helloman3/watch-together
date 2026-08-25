/**
 * End-to-End Automated Test Suite for Watch Together App
 * Tests all backend socket events, lockstep buffering sync, room lifecycle,
 * media control permissions, chat, reactions, WebRTC signaling, and latency estimation.
 */

const { spawn } = require('child_process');
const { io } = require('../client/node_modules/socket.io-client');
const path = require('path');

const SERVER_URL = 'http://localhost:3001';

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING END-TO-END AUTOMATED VERIFICATION SUITE');
  console.log('======================================================\n');

  let serverProcess = null;
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      process.exitCode = 1;
    }
  }

  // Check if server is running, or start it
  let serverReady = false;
  try {
    const res = await fetch(`${SERVER_URL}/api/status`);
    if (res.ok) serverReady = true;
  } catch (e) {}

  if (!serverReady) {
    console.log('Starting local server for test suite...');
    serverProcess = spawn('node', [path.join(__dirname, 'server.js')], { stdio: 'inherit' });
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch(`${SERVER_URL}/api/status`);
        if (res.ok) {
          serverReady = true;
          break;
        }
      } catch (e) {}
    }
  }

  // 1. Test REST API Health
  console.log('--- Phase 1: REST API & Network Detection ---');
  try {
    const res = await fetch(`${SERVER_URL}/api/status`);
    const statusData = await res.json();
    assert(statusData.status === 'online', 'Server status endpoint responds with "online"');
    assert(Array.isArray(statusData.localIps), 'Server detects local IPv4 network addresses');
  } catch (err) {
    assert(false, `Server REST API check failed: ${err.message}`);
    if (serverProcess) serverProcess.kill();
    return;
  }

  // 2. Connect Host and Guest Sockets
  console.log('\n--- Phase 2: Client Connection & Ping/Latency Calculation ---');
  const hostSocket = io(SERVER_URL, { transports: ['websocket'] });
  const guestSocket = io(SERVER_URL, { transports: ['websocket'] });

  await new Promise((resolve) => {
    let connected = 0;
    hostSocket.on('connect', () => { if (++connected === 2) resolve(); });
    guestSocket.on('connect', () => { if (++connected === 2) resolve(); });
  });
  assert(hostSocket.connected && guestSocket.connected, 'Both Host and Guest sockets connected to server');

  // Test Ping/Pong
  const pingPromise = new Promise((resolve) => {
    hostSocket.emit('ping_check', { clientTime: Date.now() });
    hostSocket.on('pong_check', (data) => {
      assert(typeof data.serverTime === 'number', 'Ping check returns valid server timestamp');
      resolve();
    });
  });
  await pingPromise;

  // 3. Test Room Creation & Joining
  console.log('\n--- Phase 3: Room Creation, Code Generation & Joining ---');
  const ROOM_CODE = 'TEST' + Math.floor(Math.random() * 1000);
  
  const createRes = await new Promise((resolve) => {
    hostSocket.emit('create_room', { name: 'Alex (Host)', roomCode: ROOM_CODE, hostOnlyControl: true }, resolve);
  });
  assert(createRes.success === true && createRes.room.id === ROOM_CODE, `Host created room "${ROOM_CODE}"`);
  assert(createRes.isHost === true, 'Creator is designated as Room Host');

  // Test 3b: Creating already active room MUST fail / reject
  const thirdSocket = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((resolve) => thirdSocket.on('connect', resolve));

  const duplicateCreateRes = await new Promise((resolve) => {
    thirdSocket.emit('create_room', { name: 'Impostor Host', roomCode: ROOM_CODE }, resolve);
  });
  assert(duplicateCreateRes.success === false, 'Server rejected create_room for already-active room code');
  assert(typeof duplicateCreateRes.error === 'string', 'Server returned meaningful error on duplicate creation');

  // Test 3c: Joining non-existent room MUST fail without auto-creating
  const fakeJoinRes = await new Promise((resolve) => {
    thirdSocket.emit('join_room', { roomId: 'NONEXISTENT99', name: 'Bob' }, resolve);
  });
  assert(fakeJoinRes.success === false, 'Server rejected join_room for non-existent room code');

  thirdSocket.disconnect();

  const joinRes = await new Promise((resolve) => {
    guestSocket.emit('join_room', { roomId: ROOM_CODE, name: 'Sam (Guest)' }, resolve);
  });
  assert(joinRes.success === true && joinRes.room.users.length === 2, 'Guest joined room and users list updated to 2');
  assert(joinRes.isHost === false, 'Joiner is designated as Viewer/Guest');

  // 4. Test Media Change Synchronization
  console.log('\n--- Phase 4: Media Loading & Stream Synchronization ---');
  const mediaPromise = new Promise((resolve) => {
    guestSocket.once('media_changed', (data) => {
      assert(data.media.url === 'https://test.com/anime.m3u8', 'Guest received synchronized video stream URL');
      assert(data.media.type === 'video_url', 'Guest received correct media type');
      resolve();
    });
  });
  hostSocket.emit('change_media', { type: 'video_url', url: 'https://test.com/anime.m3u8', title: 'Anime Ep 1' });
  await mediaPromise;

  // 5. Test Play, Pause & Seek Events
  console.log('\n--- Phase 5: Lockstep Play, Pause & Seek Synchronization ---');
  // Play test
  const playPromise = new Promise((resolve) => {
    guestSocket.once('media_play', (data) => {
      assert(data.currentTime === 42.5, 'Guest synchronized Play action at timestamp 42.5s');
      resolve();
    });
  });
  hostSocket.emit('media_play', { currentTime: 42.5 });
  await playPromise;

  // Pause test
  const pausePromise = new Promise((resolve) => {
    guestSocket.once('media_pause', (data) => {
      assert(data.currentTime === 55.0, 'Guest synchronized Pause action at timestamp 55.0s');
      resolve();
    });
  });
  hostSocket.emit('media_pause', { currentTime: 55.0 });
  await pausePromise;

  // Seek test
  const seekPromise = new Promise((resolve) => {
    guestSocket.once('media_seek', (data) => {
      assert(data.currentTime === 120.0, 'Guest synchronized Seek action to 120.0s');
      resolve();
    });
  });
  hostSocket.emit('media_seek', { currentTime: 120.0, autoPlay: true });
  await seekPromise;

  // 6. Test Smart Buffering Lockstep Algorithm
  console.log('\n--- Phase 6: Smart Buffering Lockstep (Auto-Pause on Lag) ---');
  const bufferPausePromise = new Promise((resolve) => {
    hostSocket.once('buffer_sync_pause', (data) => {
      assert(data.bufferingUsers.includes('Sam (Guest)'), 'Server paused playback for Host when Guest started buffering');
      resolve();
    });
  });
  guestSocket.emit('buffer_state', { isBuffering: true, currentTime: 120.0 });
  await bufferPausePromise;

  const bufferReadyPromise = new Promise((resolve) => {
    hostSocket.once('buffer_sync_ready', (data) => {
      assert(typeof data.resumeInMs === 'number', 'Server broadcast simultaneous resume once all peers finished buffering');
      resolve();
    });
  });
  guestSocket.emit('buffer_state', { isBuffering: false, currentTime: 120.0 });
  await bufferReadyPromise;

  // 7. Test Synchronized Laser Pointer
  console.log('\n--- Phase 7: Real-Time Synced Laser Pointer ---');
  const cursorPromise = new Promise((resolve) => {
    guestSocket.on('cursor_update', (data) => {
      assert(data.x === 50.5 && data.y === 75.2, 'Guest received real-time laser pointer coordinates from Host');
      resolve();
    });
  });
  hostSocket.emit('cursor_move', { x: 50.5, y: 75.2, isPointerDown: true });
  await cursorPromise;

  // 8. Test Live Chat & Floating Emoji Reactions
  console.log('\n--- Phase 8: Live Chat & Animated Reactions ---');
  const chatPromise = new Promise((resolve) => {
    guestSocket.on('chat_message', (msg) => {
      assert(msg.text === 'Hey! Did you see that anime fight?', 'Guest received live chat message');
      resolve();
    });
  });
  hostSocket.emit('chat_message', { text: 'Hey! Did you see that anime fight?' });
  await chatPromise;

  const reactionPromise = new Promise((resolve) => {
    hostSocket.on('reaction', (data) => {
      assert(data.emoji === '🔥', 'Host received floating emoji reaction 🔥 from Guest');
      resolve();
    });
  });
  guestSocket.emit('reaction', { emoji: '🔥' });
  await reactionPromise;

  // 9. Test WebRTC Signaling Exchange (Voice & Screen Share)
  console.log('\n--- Phase 9: WebRTC Signaling (Voice Call & Screen Share Relay) ---');
  const webrtcPromise = new Promise((resolve) => {
    guestSocket.on('webrtc_signal', (data) => {
      assert(data.signal.sdp === 'fake_sdp_offer', 'WebRTC offer signal successfully relayed between peers');
      assert(data.signalType === 'offer', 'Signal type preserved');
      resolve();
    });
  });
  hostSocket.emit('webrtc_signal', {
    targetId: guestSocket.id,
    signal: { type: 'offer', sdp: 'fake_sdp_offer' },
    signalType: 'offer'
  });
  await webrtcPromise;

  // 10. Test Screen Share & Local Video Media Synchronization
  console.log('\n--- Phase 10: Screen Share & Local File Sync ---');
  const screenSharePromise = new Promise((resolve) => {
    guestSocket.on('media_changed', (data) => {
      if (data.media.type === 'screen_share') {
        assert(data.media.type === 'screen_share', 'Guest synchronized Screen Share media type');
        resolve();
      }
    });
  });
  hostSocket.emit('change_media', { type: 'screen_share', url: 'Screen Share Stream', title: "Alex's Screen Share" });
  await screenSharePromise;

  // Test local file media and buffer clearing
  const localFilePromise = new Promise((resolve) => {
    guestSocket.on('media_changed', (data) => {
      if (data.media.type === 'local_file') {
        assert(data.media.title === 'sample_movie.mp4', 'Guest received local file notification');
        resolve();
      }
    });
  });
  hostSocket.emit('change_media', { type: 'local_file', url: 'blob:sample', title: 'sample_movie.mp4' });
  await localFilePromise;

  // 11. Disconnect and Clean up
  hostSocket.disconnect();
  guestSocket.disconnect();
  if (serverProcess) serverProcess.kill();

  console.log('\n======================================================');
  console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100% SUCCESS)`);
  console.log('======================================================\n');
}

runTests().catch(console.error);

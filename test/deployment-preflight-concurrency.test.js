require('../tools/owner-test-staging/context-host.cjs');
let mockEnrollment, mockMode, mockEndpoint;
const mockRpcOptions = jest.fn(),
  mockRequest = jest.fn(),
  mockRelease = jest.fn();
jest.mock("../src/owners/railgun-account-enrollment.js", () => ({
  isRailgunAccountEnrollment: (v) => v === mockEnrollment,
}));
jest.mock("../src/railgun-shield-pins.json", () => {
  const pins = jest.requireActual("../src/railgun-shield-pins.json");
  const { keccak256 } = require('ethers');
  return {
    ...pins,
    codeHashes: Object.fromEntries(
      Object.keys(pins.codeHashes).map((n) => [n, keccak256('0x6001')])
    ),
  };
});
jest.mock('../src/owners/host-bindings.js', () => ({
  ...jest.requireActual('../src/owners/host-bindings.js'),
  rpc: {
  createPrivateRpc: (handle, role, options) => {
    mockRpcOptions(options);
    const { getPrivacyContext } = require("../src/owners/context-bindings.js");
    const context = getPrivacyContext(handle);
    expect(role).toBe('protocol-rpc');
    expect(context.subject.operation).toBe('shield-preflight');
    return {
      request: mockRequest,
      release: mockRelease,
      signal: AbortSignal.any([context.signal, mockEndpoint.signal]),
      assertActive: () => {
        getPrivacyContext(handle);
        if (mockEndpoint.signal.aborted) throw Error('endpoint revoked');
      },
    };
  },
  },
}));
const { createPrivacyScope } = require("../src/owners/context-bindings.js");
const { Interface, id, toBeHex } = require('ethers');
const {
  createRailgunShieldPreflight,
} = require("../src/owners/railgun-shield-preflight.js");
const pins = require("../src/railgun-shield-pins.json");
const abi = new Interface([
  'function railgun() view returns (address)',
  'function wBase() view returns (address)',
  'function shieldFee() view returns (uint120)',
  'function tokenBlocklist(address) view returns (bool)',
]);
const block = { number: '0xb4911f', hash: '0x' + '1'.repeat(64), timestamp: '0x0' };
let scope, source;
beforeEach(() => {
  jest.clearAllMocks();
  mockMode = null;
  block.timestamp = toBeHex(Math.floor(Date.now() / 1000));
  mockEndpoint = new AbortController();
  scope = createPrivacyScope({ profileId: 'preflight-test', signal: new AbortController().signal });
  mockEnrollment = {
    signal: scope.signal,
    getContext: (role, operation) =>
      scope.getContext({
        kind: 'private-account',
        principal: 'railgun:0',
        protocol: 'railgun',
        deployment: 'sepolia',
        chainId: 11155111,
        role,
        operation,
      }),
  };
  mockRequest.mockImplementation(async (method, params, validate) => {
    let result;
    if (method === 'eth_getBlockByNumber')
      result =
        mockMode === 'head' && params[0] !== 'latest'
          ? { ...block, hash: '0x' + '2'.repeat(64) }
          : block;
    else if (method === 'eth_getCode')
      result =
        mockMode === 'code' ||
        (mockMode === 'implementation-code' && params[0] === pins.implementation)
          ? '0x6002'
          : '0x6001';
    else if (method === 'eth_getStorageAt') {
      const implementation = toBeHex(BigInt(id('eip1967.proxy.implementation')) - 1n, 32);
      result =
        params[1] === implementation
          ? '0x' + pins.implementation.slice(2).padStart(64, '0')
          : '0x' + '0'.repeat(64);
      if (
        mockMode === 'slot' ||
        (mockMode === 'implementation' && params[1] === implementation) ||
        (mockMode === 'paused' && params[1] !== implementation)
      )
        result = '0x' + '1'.repeat(64);
    } else if (method === 'eth_call') {
      const parsed = abi.parseTransaction(params[0]);
      const values = {
        railgun: mockMode === 'relay' ? pins.relayAdapt : pins.proxy,
        wBase: mockMode === 'weth' ? pins.proxy : pins.wrappedNative,
        shieldFee: mockMode === 'fee' ? 26 : 25,
        tokenBlocklist: mockMode === 'blocked',
      };
      result = abi.encodeFunctionResult(parsed.name, [values[parsed.name]]).toLowerCase();
      if (mockMode === 'padding') result += '00';
    } else throw Error('Unexpected request');
    if (!validate(result))
      throw Object.assign(Error('Invalid response'), { code: 'PRIVATE_RPC_INVALID' });
    return { result };
  });
  source = createRailgunShieldPreflight(mockEnrollment);
});
afterEach(() => {
  source.close();
  scope.close();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('1250 ms public reads complete in five bounded rounds at one unchanged anchor', async () => {
  jest.useFakeTimers();
  const original = mockRequest.getMockImplementation();
  let active = 0, peak = 0, settled = false;
  mockRequest.mockImplementation(async (...args) => {
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise(resolve => setTimeout(resolve, 1250));
      return await original(...args);
    } finally { active--; }
  });
  const pending = source.acquire();
  pending.then(() => { settled = true; }, () => { settled = true; });
  await jest.advanceTimersByTimeAsync(6250);
  expect(settled).toBe(true);
  const acquired = await pending;
  expect(peak).toBe(4);
  expect(active).toBe(0);
  expect(mockRequest).toHaveBeenCalledTimes(12);
  expect(source.assertResult(acquired.receipt).anchor).toEqual(block);
  for (const [method, params] of mockRequest.mock.calls)
    if (method !== 'eth_getBlockByNumber')
      expect(params.at(-1)).toEqual({ blockHash: block.hash, requireCanonical: true });
});

test('first code refusal aborts siblings, preserves its stage and waits for their drainage', async () => {
  const original = mockRequest.getMockImplementation();
  const releases = [];
  let settled = false;
  mockRequest.mockImplementation(async (...args) => {
    if (args[0] === 'eth_getCode') {
      await new Promise(resolve => releases.push(resolve));
      if (args[1][0] === pins.relayAdapt)
        throw Object.assign(Error('not reportable'), { code: 'TOR_REQUEST_FAILED', stage: 'response' });
    }
    return original(...args);
  });
  const pending = source.acquire().catch(error => error);
  pending.then(() => { settled = true; });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(releases).toHaveLength(4);
  releases[1]();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(source.signal.aborted).toBe(true);
  expect(settled).toBe(false);
  expect(mockRequest.mock.calls.some(([method]) => method === 'eth_getStorageAt')).toBe(false);
  for (const release of releases) release();
  const error = await pending;
  expect(error).toMatchObject({ reason: 'rpc', step: 'code-relayAdapt', causeCode: 'TOR_REQUEST_FAILED', causeStage: 'response' });
  expect(JSON.stringify(error)).not.toContain('not reportable');
  expect(mockRelease).toHaveBeenCalledTimes(1);
});

test('parallel groups do not renew the original 60 second evidence age', async () => {
  jest.useFakeTimers();
  const original = mockRequest.getMockImplementation();
  mockRequest.mockImplementation(async (...args) => {
    await new Promise(resolve => setTimeout(resolve, 12001));
    return original(...args);
  });
  const pending = source.acquire().catch(error => error);
  await jest.advanceTimersByTimeAsync(60005);
  expect(await pending).toMatchObject({ reason: 'stale', step: 'anchor-recheck' });
  expect(source.signal.aborted).toBe(true);
});

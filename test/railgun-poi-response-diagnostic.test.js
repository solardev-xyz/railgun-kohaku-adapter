/** Redacted POI error categories (package-owned). The pinned copy of the
 * original inspection test keeps its own cases; these cover the diagnostic. */
const {
  prepareRailgunPoiSubmission: prepare,
  inspectRailgunPoiResponse: inspectResponse,
} = require('../src/data/railgun-poi-submit-data');
const { REQUIRED_LIST } = require('../src/data/railgun-poi-records');
const requestId = 1791086400000;
const hex = (value) => '0x' + value.toString(16).padStart(64, '0');
const payload = () => ({
  listKey: REQUIRED_LIST,
  proof: { pi_a: ['1', '2'], pi_b: [['3', '4'], ['5', '6']], pi_c: ['7', '8'] },
  poiMerkleroots: [hex(3).slice(2)],
  txidMerkleroot: hex(4).slice(2),
  txidMerklerootIndex: 6,
  blindedCommitmentsOut: [hex(5)],
  railgunTxidIfHasUnshield: '0x00',
});
const response = (body, httpStatus = 200) => ({
  kind: 'response',
  httpStatus,
  body: Buffer.isBuffer(body) ? body : Buffer.from(body),
});
const resultWire = (value = null, id = requestId) => JSON.stringify({ jsonrpc: '2.0', id, result: value });
const classify = (evidence, submission = prepare({ requestId, payload: payload() })) =>
  inspectResponse({ submission, evidence });
const expectRefusal = (input) => {
  expect(() => inspectResponse(input)).toThrow(
    expect.objectContaining({ code: 'RAILGUN_POI_SUBMISSION_DATA_REFUSED' })
  );
};
describe('redacted error categories (diagnostic only)', () => {
  const errorWire = (error, id = requestId) => JSON.stringify({ jsonrpc: '2.0', error, id });
  const diagnose = (evidence) => classify(evidence).diagnostic;
  test.each([
    [{ code: -32602, message: 'Invalid proof' }, 400, 'invalid-params', 'invalid-proof', 'none'],
    [
      { code: -32602, message: 'Invalid params', data: [{ keyword: 'required' }] },
      400,
      'invalid-params',
      'invalid-params',
      'schema-errors',
    ],
    [
      { code: -32602, message: 'Invalid params', data: 'Invalid listKey' },
      400,
      'invalid-params',
      'invalid-params',
      'invalid-list-key',
    ],
    [
      { code: -32602, message: 'Validation error: Invalid txid merkleroot.' },
      400,
      'invalid-params',
      'invalid-txid-merkleroot',
      'none',
    ],
    [
      { code: -32603, message: 'Error occurred while executing the JSON-RPC method' },
      500,
      'internal-error',
      'execution-error-hidden',
      'none',
    ],
    [{ code: -32050, message: 'PRIVATE_SENTINEL' }, 400, 'server-error', 'other', 'none'],
    [{ code: 7, message: 'Invalid proof', data: { x: 'PRIVATE_SENTINEL' } }, 400, 'other', 'invalid-proof', 'other'],
  ])('HTTP %#: closed code, message and data categories', (error, status, rpcCode, messageCategory, dataCategory) => {
    const observed = classify(response(errorWire(error), status));
    expect(observed.classification).toBe('http-failure');
    expect(observed.matchingEnvelope).toBe(false);
    expect(observed.acceptanceVerified).toBe(false);
    expect(observed.diagnostic).toEqual({ envelope: 'matched-id', rpcCode, messageCategory, dataCategory });
    expect(JSON.stringify(observed)).not.toContain('PRIVATE_SENTINEL');
  });
  test('a 200 error envelope keeps rpc-error and adds the same category', () => {
    const observed = classify(response(errorWire({ code: -32602, message: 'Invalid proof' })));
    expect(observed.classification).toBe('rpc-error');
    expect(observed.diagnostic).toEqual({
      envelope: 'matched-id',
      rpcCode: 'invalid-params',
      messageCategory: 'invalid-proof',
      dataCategory: 'none',
    });
  });
  test('another request ID is reported as other-id, never matched', () => {
    expect(diagnose(response(errorWire({ code: -32602, message: 'Invalid proof' }, requestId + 1), 400))).toEqual({
      envelope: 'other-id',
      rpcCode: 'invalid-params',
      messageCategory: 'invalid-proof',
      dataCategory: 'none',
    });
  });
  const invalid = { envelope: 'invalid', rpcCode: null, messageCategory: null, dataCategory: null };
  test.each([
    ['plain text', 'Bad Request PRIVATE_SENTINEL'],
    ['HTML', '<html><body>400 Bad Request</body></html>'],
    ['BOM', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(errorWire({ code: -32602, message: 'Invalid proof' }))])],
    ['invalid UTF-8', Buffer.from([0x7b, 0xff, 0x7d])],
    ['duplicate member', '{"jsonrpc":"2.0","id":' + requestId + ',"error":{"code":-32602,"code":-32602,"message":"Invalid proof"}}'],
    ['result envelope', resultWire(null)],
    ['extra error member', errorWire({ code: -32602, message: 'Invalid proof', extra: 1 })],
    ['non-string message', errorWire({ code: -32602, message: 5 })],
    ['noncanonical code', '{"jsonrpc":"2.0","id":' + requestId + ',"error":{"code":-32602.0,"message":"Invalid proof"}}'],
    ['deep nesting', errorWire({ code: -32602, message: 'Invalid proof', data: JSON.parse('['.repeat(40) + ']'.repeat(40)) })],
    ['empty body', ''],
  ])('%s yields the invalid category without content', (_name, body) => {
    const observed = classify(response(body, 400));
    expect(observed.classification).toBe('http-failure');
    expect(observed.diagnostic).toEqual(invalid);
    expect(JSON.stringify(observed)).not.toContain('PRIVATE_SENTINEL');
  });
  test('the existing 2048-byte cap still refuses larger non-200 bodies', () => {
    expectRefusal({ submission: prepare({ requestId, payload: payload() }), evidence: response(Buffer.alloc(2049, 0x20), 400) });
  });
});

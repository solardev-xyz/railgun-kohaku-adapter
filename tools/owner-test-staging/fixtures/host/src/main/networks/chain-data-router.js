// Repository-only refusal: tests must explicitly mock unused public chain reads.
module.exports = new Proxy({}, { get() { throw new Error('Unexpected public chain-data access'); } });

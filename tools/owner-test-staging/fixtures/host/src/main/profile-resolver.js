// Repository-only boundary: every credential case must bind its explicit profile.
module.exports = { getActiveProfile() { throw new Error('Unexpected test profile access'); } };

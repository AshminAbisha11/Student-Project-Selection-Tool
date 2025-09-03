module.exports = function mockReq({ user={}, body={}, params={}, query={} } = {}) {
  return { user, body, params, query, headers: {} };
};

// tests/mocks/res.mock.js
exports.mockRes = () => {
  const res = {};

  res.status = jest.fn().mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });

  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);

  // Needed by controllers using res.set('Cache-Control', 'no-store')
  res.set = jest.fn().mockReturnValue(res);
  res.header = res.set;       // alias some code uses
  res.setHeader = res.set;    // alias just in case

  return res;
};

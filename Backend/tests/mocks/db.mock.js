// Mock of ../config/db (mysql2/promise-like pool)
const db = {
  query: jest.fn(),
  getConnection: jest.fn()
};

function makeConn() {
  return {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
  };
}

module.exports = { db, makeConn };

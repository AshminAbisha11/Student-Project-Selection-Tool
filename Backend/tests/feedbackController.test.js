const path = require('path');
const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

let feedbackCtl;
let db;
let sendMailMock;

function resolveDbFromControllers() {
  const controllersDir = path.join(__dirname, '..', 'controllers');
  return require.resolve('../config/db', { paths: [controllersDir] });
}

beforeEach(() => {
  jest.clearAllMocks();

  jest.isolateModules(() => {
    const dbModuleId = resolveDbFromControllers();

    // DB mock
    jest.doMock(dbModuleId, () => {
      const mocked = require('./mocks/db.mock');
      return mocked.db;
    });

    // Nodemailer mock
    sendMailMock = jest.fn().mockResolvedValue({});
    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => ({ sendMail: sendMailMock }))
    }));

    feedbackCtl = require('../controllers/feedbackController');
    db = require('./mocks/db.mock').db;
  });
});

describe('feedbackController.submitFeedback', () => {
  it('400 if message missing', async () => {
    const req = mockReq({ body: { message: '' } });
    const res = mockRes();

    await feedbackCtl.submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Feedback message is required.' })
    );
  });

  it('saves to DB and sends email on success', async () => {
    const req = mockReq({ body: { message: 'Great platform!' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([{ insertId: 1 }]);

    await feedbackCtl.submitFeedback(req, res);

    expect(db.query).toHaveBeenCalledWith(
      'INSERT INTO feedback (message) VALUES (?)',
      ['Great platform!']
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'New Feedback Submitted',
        text: expect.stringContaining('Great platform!')
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Feedback submitted and emailed successfully.'
      })
    );
  });

  it('500 if DB insert fails', async () => {
    const req = mockReq({ body: { message: 'DB test fail' } });
    const res = mockRes();

    db.query.mockRejectedValueOnce(new Error('DB failure'));

    await feedbackCtl.submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal server error.' })
    );
  });

  it('500 if sendMail fails', async () => {
    const req = mockReq({ body: { message: 'Email fail' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([{ insertId: 1 }]);
    sendMailMock.mockRejectedValueOnce(new Error('SMTP fail'));

    await feedbackCtl.submitFeedback(req, res);

    expect(sendMailMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal server error.' })
    );
  });
});

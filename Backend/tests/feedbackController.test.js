const path = require('path');
const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

let feedbackCtl;
let db;
let sendMailMock;
let createTransportMock;

function resolveDbFromControllers() {
  const controllersDir = path.join(__dirname, '..', 'controllers');
  return require.resolve('../config/db', { paths: [controllersDir] });
}

beforeEach(() => {
  jest.clearAllMocks();

  // Predictable env (used in email config)
  process.env.EMAIL_USER = 'test@example.com';
  process.env.EMAIL_APP_PASSWORD = 'app-pass';

  jest.isolateModules(() => {
    const dbModuleId = resolveDbFromControllers();

    // DB mock
    jest.doMock(dbModuleId, () => {
      const mocked = require('./mocks/db.mock');
      return mocked.db;
    });

    // Nodemailer mock
    sendMailMock = jest.fn().mockResolvedValue({});
    createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));
    jest.doMock('nodemailer', () => ({
      createTransport: createTransportMock,
    }));

    feedbackCtl = require('../controllers/feedbackController');
    db = require('./mocks/db.mock').db;

    // safety reset
    db.query.mockReset?.();
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
    expect(db.query).not.toHaveBeenCalled();
  });

  it('400 if message is only whitespace', async () => {
    const req = mockReq({ body: { message: '   \n\t  ' } });
    const res = mockRes();

    await feedbackCtl.submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Feedback message is required.' })
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  it('saves to DB and sends email on success', async () => {
    const req = mockReq({ body: { message: 'Great platform!' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([{ insertId: 1 }]);

    await feedbackCtl.submitFeedback(req, res);

    // DB insert
    expect(db.query).toHaveBeenCalledWith(
      'INSERT INTO feedback (message) VALUES (?)',
      ['Great platform!']
    );

    // transport config
    expect(createTransportMock).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: 'test@example.com', pass: 'app-pass' },
    });

    // outbound email
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining('<test@example.com>'),
        to: 'test@example.com',
        subject: 'New Feedback Submitted',
        text: expect.stringContaining('Great platform!'),
      })
    );

    // response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Feedback submitted and emailed successfully.',
      })
    );
  });

  it('500 if DB insert fails (and does not send email)', async () => {
    const req = mockReq({ body: { message: 'DB test fail' } });
    const res = mockRes();

    db.query.mockRejectedValueOnce(new Error('DB failure'));

    await feedbackCtl.submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal server error.' })
    );
    // ensure we didn't try to send an email
    expect(sendMailMock).not.toHaveBeenCalled();
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

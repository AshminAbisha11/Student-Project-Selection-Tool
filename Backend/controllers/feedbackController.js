const db = require('../config/db');
const nodemailer = require('nodemailer');

// Submit feedback and send email
exports.submitFeedback = async (req, res) => {
  const { message } = req.body;

  if (!message || message.trim() === '') {
    return res.status(400).json({ message: 'Feedback message is required.' });
  }

  try {
    // 1. Save to DB
    await db.query('INSERT INTO feedback (message) VALUES (?)', [message]);

    // 2. Send Email
    const transporter = nodemailer.createTransport({
      service: 'gmail', 
      auth: {
        user: process.env.EMAIL_USER,     
        pass: process.env.EMAIL_APP_PASSWORD 
      }
    });

    const mailOptions = {
      from: `"Student Feedback" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: 'New Feedback Submitted',
      text: `New feedback received:\n\n${message}`
    };

    await transporter.sendMail(mailOptions);

    // 3. Respond to client
    res.status(200).json({ message: 'Feedback submitted and emailed successfully.' });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

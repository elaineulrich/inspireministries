const express = require('express');

const router = express.Router();

router.get('/', (req, res) => res.render('home', { title: 'Home - Inspire Ministries' }));
router.get('/2026-bible-school', (req, res) => res.render('event', { title: '2026 Bible School Event - Inspire Ministries' }));
router.get('/contact-us', (req, res) => res.render('contact', { title: 'Contact Us - Inspire Ministries' }));
router.get('/student-application', (req, res) => res.render('student-application', { title: 'Student Application - Inspire Ministries' }));
router.get('/survey', (req, res) =>
  res.redirect('https://docs.google.com/forms/d/e/1FAIpQLSeJQC14UztikBwbn5PTeco-J9hHKJy96Ht9ocU6HQ1TqJ7Qqg/viewform?usp=send_form'));

// Keep old WordPress URLs working.
router.get(/^\/(2026-bible-school|contact-us|student-application|student-application-online)\/$/, (req, res) => res.redirect(301, req.path.slice(0, -1)));

module.exports = router;

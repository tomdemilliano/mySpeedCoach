// lib/webpush.js
//
// Initialises the web-push library with VAPID credentials from env vars and
// exports a thin helper that sends a notification to a single PushSubscription.
//
// Required env vars (add to .env.local and Vercel dashboard):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY   – used by the browser when subscribing
//   VAPID_PRIVATE_KEY              – server-only, never exposed to the client
//   VAPID_SUBJECT                  – mailto: or https: contact URL, e.g. mailto:admin@myspeedcoach.be
//
// Generate a VAPID key pair once:
//   npx web-push generate-vapid-keys
// Copy the output into your environment variables.

const webpush = require('web-push');

let initialised = false;

function init() {
  if (initialised) return;
  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT || 'mailto:admin@myspeedcoach.be';

  if (!publicKey || !privateKey) {
    throw new Error(
      'Missing VAPID keys. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your environment.'
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialised = true;
}

/**
 * Send a push notification to a single subscription.
 *
 * @param {object} subscription  - The PushSubscription object saved from the browser
 * @param {object} payload       - { title, body, url, tag, icon }
 * @returns {Promise<void>}      - Resolves on success, rejects on failure
 */
async function sendPushNotification(subscription, payload) {
  init();
  const json = JSON.stringify({
    title:  payload.title  || 'MySpeedCoach',
    body:   payload.body   || '',
    url:    payload.url    || '/announcements',
    tag:    payload.tag    || 'msc-announcement',
    icon:   payload.icon   || '/icons/icon-192.png',
    badge:  payload.badge  || '/icons/icon-192.png',
  });
  return webpush.sendNotification(subscription, json);
}

module.exports = { sendPushNotification };

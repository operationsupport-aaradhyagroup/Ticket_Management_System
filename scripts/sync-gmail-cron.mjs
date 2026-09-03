const baseUrl = String(process.env.TMS_BASE_URL || '').replace(/\/$/, '');
const syncSecret = String(process.env.GMAIL_SYNC_SECRET || '');

if (!baseUrl || !syncSecret) {
  throw new Error('TMS_BASE_URL and GMAIL_SYNC_SECRET are required.');
}

const response = await fetch(`${baseUrl}/api/admin/integrations/gmail/sync`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${syncSecret}` }
});
const body = await response.text();
if (!response.ok) throw new Error(`Gmail sync failed (${response.status}): ${body}`);
console.log(body);

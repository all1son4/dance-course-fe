/**
 * Independent lead projection shared by campaign commands, readers and delivery.
 * All eleven fields retain their string representation and existing status values.
 * Missing delivery evidence stays empty; zero send attempts remains "0".
 */
export type EmailCampaignLeadRecord = {
  lead_id: string;
  campaign_key: string;
  email_send_status: string;
  full_name: string;
  social_contact: string;
  email: string;
  locale: string;
  created_at: string;
  email_sent_at: string;
  email_send_attempts: string;
  last_email_error: string;
};

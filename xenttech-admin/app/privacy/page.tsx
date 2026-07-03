export const metadata = {
  title: 'Privacy Policy — XENTTECH / Conectaachat',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#080812] text-white px-6 py-16 max-w-2xl mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-400 mb-10">Last updated: July 2, 2026</p>

      <section className="space-y-8 text-gray-300 leading-relaxed text-sm">

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">1. About This Application</h2>
          <p>
            Conectaachat (operated by XENTTECH) is an AI-powered chatbot platform that enables
            businesses to automatically respond to Facebook Page comments and direct messages using
            artificial intelligence. This Privacy Policy explains what data we collect, how we use
            it, and your rights regarding that data.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">2. Data We Collect</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Public comments posted on connected Facebook Pages</li>
            <li>The name of the Facebook user who posted the comment (as shown publicly)</li>
            <li>The Facebook Page ID and name of the business page</li>
            <li>Timestamps of when comments were received and responded to</li>
            <li>AI-generated replies sent on behalf of the business</li>
          </ul>
          <p className="mt-3">
            We do NOT collect private messages, passwords, payment information, or any data beyond
            what is necessary to generate and post automated replies.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">3. How We Use Your Data</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>To generate AI-powered responses to public Facebook comments on behalf of the page owner</li>
            <li>To log interactions for the business owner to review in the admin dashboard</li>
            <li>To improve response quality and bot behavior</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">4. Data Sharing</h2>
          <p>
            We do <strong>not</strong> sell, rent, or share personal data with third parties for
            advertising or marketing purposes. Data is only shared with:
          </p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>
              <strong>Anthropic (Claude AI)</strong> — to generate comment replies. Anthropic's
              privacy policy applies to data processed through their API.
            </li>
            <li>
              <strong>Meta (Facebook)</strong> — to post replies via the Graph API. Meta's terms
              and privacy policy govern data on their platform.
            </li>
            <li>
              <strong>Supabase</strong> — our database provider, used to store comment logs
              securely.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">5. Data Retention</h2>
          <p>
            Comment logs are retained for up to 90 days for business review purposes. Page access
            tokens are stored securely and can be revoked at any time by the page owner through
            Facebook&apos;s app settings.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">6. Your Rights</h2>
          <p>
            You may request deletion of any data associated with your Facebook account by
            contacting us. Business owners can disconnect the app at any time via Facebook Settings
            → Apps and Websites, which immediately stops all data collection.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">7. Contact</h2>
          <p>
            For privacy inquiries or data deletion requests, contact us at:{' '}
            <a href="mailto:luisfelipebacagomez@gmail.com" className="text-[#00D4AA] hover:underline">
              luisfelipebacagomez@gmail.com
            </a>
          </p>
        </div>

      </section>
    </main>
  )
}

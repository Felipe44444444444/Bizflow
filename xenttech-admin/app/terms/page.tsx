export const metadata = {
  title: 'Terms of Service — XENTTECH / Conectaachat',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#080812] text-white px-6 py-16 max-w-2xl mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-400 mb-10">Last updated: July 2, 2026</p>

      <section className="space-y-8 text-gray-300 leading-relaxed text-sm">

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
          <p>
            By connecting your Facebook Page to Conectaachat (operated by XENTTECH), you agree to
            these Terms of Service. If you do not agree, do not connect your account.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">2. Description of Service</h2>
          <p>
            Conectaachat provides AI-powered automated responses to public Facebook comments on
            behalf of business page owners. The service uses Claude AI (by Anthropic) to generate
            contextually relevant replies based on the business&apos;s configured persona.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">3. Permitted Use</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>The service may only be used by authorized page administrators</li>
            <li>You must comply with Meta&apos;s Platform Policies and Terms of Service</li>
            <li>Automated replies must be truthful and not misleading</li>
            <li>The service may not be used to spam, harass, or send unsolicited commercial messages</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">4. Responsibilities</h2>
          <p>
            You are responsible for the content of AI-generated replies posted on your Facebook
            Page. While we design the AI to generate appropriate responses, we cannot guarantee
            every reply will be suitable for all contexts. We recommend monitoring the bot&apos;s
            activity through the admin dashboard.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">5. Disclaimer of Warranties</h2>
          <p>
            The service is provided &quot;as is&quot; without warranties of any kind. We do not
            guarantee that the service will be uninterrupted, error-free, or that AI responses
            will always be accurate or appropriate.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">6. Limitation of Liability</h2>
          <p>
            XENTTECH shall not be liable for any indirect, incidental, or consequential damages
            arising from the use or inability to use the service, including any damages resulting
            from AI-generated content posted to your Facebook Page.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">7. Termination</h2>
          <p>
            You may terminate your use of the service at any time by disconnecting the app via
            Facebook Settings → Apps and Websites. We reserve the right to suspend or terminate
            accounts that violate these terms.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">8. Changes to Terms</h2>
          <p>
            We may update these terms at any time. Continued use of the service after changes
            constitutes acceptance of the new terms.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">9. Contact</h2>
          <p>
            Questions about these terms:{' '}
            <a href="mailto:luisfelipebacagomez@gmail.com" className="text-[#00D4AA] hover:underline">
              luisfelipebacagomez@gmail.com
            </a>
          </p>
        </div>

      </section>
    </main>
  )
}

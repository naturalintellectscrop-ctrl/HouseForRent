import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get the House For Rent app',
  robots: { index: false, follow: false },
};

/**
 * The Android app download page.
 *
 * ── Why this lives in the console deployment ──
 * One Vercel project serves both surfaces: the ops console at `/`, and this
 * at `/download`. Field officers and staff are already signing in here, and
 * an internal build needs somewhere to be handed out from — a second
 * deployment for one static page would be a second thing to configure,
 * secure and remember.
 *
 * ── Why the APK is NOT committed to this repository ──
 * A debug build is ~79MB. Git stores every version of it forever, so a
 * handful of releases would make the repository slower to clone than the
 * entire rest of the codebase combined — and Vercel would redeploy the
 * whole binary on every unrelated push. Releases carry the artefact;
 * `NEXT_PUBLIC_APK_URL` points here at whichever one is current.
 */
const APK_URL = process.env.NEXT_PUBLIC_APK_URL ?? null;
const APK_VERSION = process.env.NEXT_PUBLIC_APK_VERSION ?? null;

export default function DownloadPage() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              width={28}
              height={28}
              className="brand-mark"
            />
            House For Rent <span>· Android app</span>
          </span>
        </div>
      </header>

      <main className="shell">
        <h1>Get the app</h1>
        <p className="lede">
          The tenant and landlord app for Android. Field officers and admins
          should use this console instead — the officer tools are built for
          the browser.
        </p>

        {APK_URL ? (
          <>
            <div className="card">
              <div className="card-head">
                <span className="card-title">
                  House For Rent{APK_VERSION ? ` ${APK_VERSION}` : ''}
                </span>
                <span className="pill pill-ok">Android</span>
              </div>
              <p className="muted">
                Requires Android 8.0 or newer. Sign in with the phone number
                you registered.
              </p>
              <p>
                <a className="btn" href={APK_URL} download>
                  Download the APK
                </a>
              </p>
            </div>

            <h2>Installing it</h2>
            <ol className="steps">
              <li>Tap the download above and wait for it to finish.</li>
              <li>
                Open the file. Android will ask permission to install from
                this source — that prompt is expected for an app not yet on
                the Play Store.
              </li>
              <li>Allow it, then tap <strong>Install</strong>.</li>
            </ol>

            <p className="alert alert-note">
              This is an internal build. Only install it on a device you
              control, and only from this page — an APK from anywhere else is
              not ours.
            </p>
          </>
        ) : (
          /*
           * Honest empty state, matching how the search feed handles zero
           * results: say what is actually happening rather than showing a
           * dead button that would download nothing.
           */
          <div className="empty">
            <p>
              <strong>No build published yet.</strong>
            </p>
            <p className="muted">
              Once an APK is attached to a GitHub release, set{' '}
              <code>NEXT_PUBLIC_APK_URL</code> in this project&rsquo;s Vercel
              environment variables and it will appear here.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

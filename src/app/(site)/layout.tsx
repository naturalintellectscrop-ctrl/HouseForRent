import { SiteFooter, SiteHeader } from '@/app/site-chrome';

/**
 * The public marketplace shell.
 *
 * Everything under this group is readable without an account: browsing is
 * free and requires no sign-up (Decision 3). Nothing here gates on a
 * session — the header simply renders different links when one exists.
 */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}

'use client';

/**
 * The sidebar's link groups, as a client island.
 *
 * Why a client component at all: the shell is otherwise a pure server
 * tree, but "which item is the active one" is a question about the current
 * URL. usePathname answers it during SSR too, so the first paint already
 * carries the green pill - the island ships a few bytes and no data
 * fetching, and with JavaScript disabled the nav still renders and every
 * link still works; only the active highlight is missing.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/app/ui';

export type ShellNavItem = {
  href: string;
  label: string;
  icon: keyof typeof Icon;
  /** Live workload figure (e.g. pending approvals) - a count, not a garnish. */
  count?: number | null;
  /** Externally hosted count that could not be resolved; render nothing. */
  hideCountWhenZero?: boolean;
};

export type ShellNavGroup = {
  label?: string;
  items: ShellNavItem[];
};

export function AppShellNav({ groups }: { groups: ShellNavGroup[] }) {
  const pathname = usePathname();

  const isCurrent = (href: string) => {
    if (href === '/platform' || href === '/ops' || href === '/account' || href === '/landlord') {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      {groups.map((group, index) => (
        <div className="shell-nav-group" key={group.label ?? index}>
          {group.label ? (
            <span className="shell-nav-label" aria-hidden="true">
              {group.label}
            </span>
          ) : null}
          <nav className="shell-nav" aria-label={group.label ?? 'Sections'}>
            {group.items.map((item) => {
              const Glyph = Icon[item.icon] ?? Icon.doc;
              const showCount =
                typeof item.count === 'number' && item.count > 0;
              const count = typeof item.count === 'number' ? item.count : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                >
                  <Glyph size={17} />
                  <span>{item.label}</span>
                  {showCount ? (
                    <span className="shell-nav-count" aria-label={`${count} pending`}>
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </>
  );
}

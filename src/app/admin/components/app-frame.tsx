import {
  Activity,
  LayoutDashboard,
  LibraryBig,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Store,
  UsersRound,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import styled, { css } from "styled-components";

import { ADMIN_FEATURE_GROUP_LABELS, ADMIN_FEATURES } from "../lib/admin.constants";
import type { AdminFeatureId } from "../lib/admin.types";
import { adminTokens } from "../styles/tokens.styles";
import { focusVisible, IconButton } from "../ui/primitives";
import { useSiteHost } from "../ui/use-site-host";

export type AdminEnvironment = "production" | "preview" | "development";

const FEATURE_ICONS: Record<AdminFeatureId, ReactNode> = {
  broadcasts: <Send aria-hidden />,
  "inspiration-hub": <LibraryBig aria-hidden />,
  "invite-links": <Link2 aria-hidden />,
  "online-group": <UsersRound aria-hidden />,
  operations: <Activity aria-hidden />,
  overview: <LayoutDashboard aria-hidden />,
  purchases: <Receipt aria-hidden />,
  sales: <Store aria-hidden />,
};

const Root = styled.div`
  ${adminTokens}
  /* The site's body is a full-height flex column: without this the frame would
     shrink to one screen and the page background would end mid-scroll. */
  flex-shrink: 0;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: var(--a-sidebar-width) minmax(0, 1fr);

  @media (max-width: 1023px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const SidebarRoot = styled.aside<{ $open: boolean }>`
  position: sticky;
  top: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 12px 14px;
  border-right: 1px solid var(--a-border);
  background: var(--a-surface);
  overflow-y: auto;

  @media (max-width: 1023px) {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 50;
    width: min(300px, 86vw);
    box-shadow: var(--a-shadow-lg);
    transform: translateX(${({ $open }) => ($open ? "0" : "-105%")});
    transition: transform 200ms ease;
    padding-top: calc(14px + env(safe-area-inset-top));

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
`;

const Scrim = styled.div<{ $open: boolean }>`
  display: none;

  @media (max-width: 1023px) {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.36);
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
    transition: opacity 200ms ease;
  }
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 8px 14px;

  span[data-mark] {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--a-accent);
    color: #fff;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.02em;
  }

  strong {
    display: block;
    font-size: var(--a-text);
    letter-spacing: -0.01em;
  }

  small {
    display: block;
    color: var(--a-ink-3);
    font-size: var(--a-text-xs);
  }
`;

const GroupLabel = styled.div`
  padding: 12px 10px 4px;
  color: var(--a-ink-3);
  font-size: var(--a-text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
`;

const NavItem = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--a-radius-sm);
  font: inherit;
  font-size: var(--a-text);
  font-weight: ${({ $active }) => ($active ? 650 : 500)};
  text-align: left;
  cursor: pointer;
  color: ${({ $active }) => ($active ? "var(--a-accent)" : "var(--a-ink-2)")};
  background: ${({ $active }) => ($active ? "var(--a-accent-soft)" : "transparent")};
  transition: background-color 120ms ease;
  ${focusVisible}

  svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    color: ${({ $active }) => ($active ? "var(--a-accent)" : "var(--a-ink-3)")};
  }

  &:hover {
    background: ${({ $active }) =>
      $active ? "var(--a-accent-soft)" : "var(--a-surface-hover)"};
  }

  @media (max-width: 1023px) {
    min-height: 44px;
  }
`;

const NavCount = styled.span`
  margin-left: auto;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--a-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
`;

const SidebarFooter = styled.div`
  margin-top: auto;
  display: grid;
  justify-items: start;
  gap: 8px;
  padding: 12px 6px 0;
  border-top: 1px solid var(--a-border);
`;

const EnvPill = styled.span<{ $environment: AdminEnvironment }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 10px;
  line-height: 1.4;
  border-radius: 999px;
  font-size: var(--a-text-xs);
  font-weight: 650;
  ${({ $environment }) =>
    $environment === "production"
      ? css`
          background: var(--a-accent-soft);
          color: var(--a-accent);
        `
      : css`
          background: var(--a-warning-soft);
          color: var(--a-warning);
        `}

  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
`;

const SessionLine = styled.div<{ $unavailable: boolean }>`
  justify-self: stretch;
  display: flex;
  align-items: center;
  gap: 4px;
  color: ${({ $unavailable }) => ($unavailable ? "var(--a-danger)" : "var(--a-ink-3)")};
  font-size: var(--a-text-xs);

  span {
    flex: 1;
  }
`;

const Main = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const Topbar = styled.header`
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: var(--a-topbar-height);
  padding: 10px 28px;
  border-bottom: 1px solid var(--a-border);
  background: rgba(244, 245, 246, 0.86);
  backdrop-filter: saturate(140%) blur(10px);

  @media (max-width: 1023px) {
    padding: calc(8px + env(safe-area-inset-top)) 12px 8px;
  }
`;

const MobileOnly = styled.div`
  display: none;

  @media (max-width: 1023px) {
    display: contents;
  }
`;

const CurrentTitle = styled.span`
  display: none;
  font-weight: 700;
  font-size: var(--a-text-md);

  @media (max-width: 1023px) {
    display: block;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const SearchForm = styled.form<{ $mobileOpen: boolean }>`
  position: relative;
  flex: 1;
  max-width: 460px;

  svg {
    position: absolute;
    left: 11px;
    top: 50%;
    width: 16px;
    height: 16px;
    color: var(--a-ink-3);
    transform: translateY(-50%);
    pointer-events: none;
  }

  input {
    width: 100%;
    height: 38px;
    padding: 0 38px 0 34px;
    border: 1px solid var(--a-border);
    border-radius: 10px;
    background: var(--a-surface);
    color: var(--a-ink);
    font: inherit;
    font-size: var(--a-text);
    ${focusVisible}

    &::placeholder {
      color: var(--a-ink-3);
    }
  }

  kbd {
    position: absolute;
    right: 9px;
    top: 50%;
    transform: translateY(-50%);
    padding: 1px 6px;
    border: 1px solid var(--a-border-strong);
    border-radius: 5px;
    color: var(--a-ink-3);
    font-family: var(--a-mono);
    font-size: 11px;
  }

  @media (max-width: 1023px) {
    display: ${({ $mobileOpen }) => ($mobileOpen ? "block" : "none")};
    position: absolute;
    inset: calc(100% + 0px) 0 auto 0;
    max-width: none;
    padding: 8px 12px 10px;
    background: var(--a-canvas);
    border-bottom: 1px solid var(--a-border);

    svg {
      left: 23px;
      top: calc(50% + 1px);
    }

    input {
      height: 44px;
      font-size: 16px;
    }

    kbd {
      display: none;
    }
  }
`;

const TopbarEnd = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;

  @media (max-width: 1023px) {
    margin-left: 0;
  }

  /* On phones the site address lives in the menu: the bar keeps the section name. */
  @media (max-width: 520px) {
    > span {
      display: none;
    }
  }
`;

const Content = styled.main`
  container: admin-content / inline-size;
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 28px 28px 64px;

  @media (max-width: 640px) {
    padding: 18px 14px calc(48px + env(safe-area-inset-bottom));
  }
`;

type AdminFrameProps = {
  activeId: AdminFeatureId;
  badges: Partial<Record<AdminFeatureId, number>>;
  children: ReactNode;
  environment: AdminEnvironment | null;
  isLoggingOut: boolean;
  isRefreshingSession: boolean;
  isSessionCheckUnavailable: boolean;
  onLogout: () => void;
  onNavigate: (id: AdminFeatureId) => void;
  onRefreshSession: () => void;
  onSearch: (query: string) => void;
};

/**
 * The control centre's frame. Wide screens get a fixed sidebar; tablets and phones
 * get a top bar whose menu slides the same navigation in. The purchase search is
 * always one key away (`/`).
 */
export const AdminFrame = ({
  activeId,
  badges,
  children,
  environment,
  isLoggingOut,
  isRefreshingSession,
  isSessionCheckUnavailable,
  onLogout,
  onNavigate,
  onRefreshSession,
  onSearch,
}: AdminFrameProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const active = ADMIN_FEATURES.find((feature) => feature.id === activeId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.closest("input, textarea, select, [contenteditable='true']") !== null;
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setMobileSearchOpen(true);
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (mobileSearchOpen) searchRef.current?.focus();
  }, [mobileSearchOpen]);

  const navigate = (id: AdminFeatureId) => {
    onNavigate(id);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch(trimmed);
    setMobileSearchOpen(false);
    setMenuOpen(false);
  };

  const hostLabel = useSiteHost();
  const navEntries = ADMIN_FEATURES.map((feature, index) => ({
    feature,
    showGroup:
      feature.group !== "home" && feature.group !== ADMIN_FEATURES[index - 1]?.group,
  }));

  return (
    <Root>
      <Scrim $open={menuOpen} onClick={() => setMenuOpen(false)} aria-hidden />
      <SidebarRoot $open={menuOpen} aria-label="Разделы админки">
        <Brand>
          <span data-mark aria-hidden>
            AS
          </span>
          <div>
            <strong>Anna Strok</strong>
            <small>Центр управления</small>
          </div>
        </Brand>
        <nav>
          {navEntries.map(({ feature, showGroup }) => {
            const count = badges[feature.id] ?? 0;
            return (
              <div key={feature.id}>
                {showGroup && (
                  <GroupLabel>{ADMIN_FEATURE_GROUP_LABELS[feature.group]}</GroupLabel>
                )}
                <NavItem
                  type="button"
                  $active={feature.id === activeId}
                  aria-current={feature.id === activeId ? "page" : undefined}
                  onClick={() => navigate(feature.id)}
                >
                  {FEATURE_ICONS[feature.id]}
                  {feature.label}
                  {count > 0 && (
                    <NavCount aria-label={`${count} требует внимания`}>{count}</NavCount>
                  )}
                </NavItem>
              </div>
            );
          })}
        </nav>
        <SidebarFooter>
          {environment && <EnvPill $environment={environment}>{hostLabel}</EnvPill>}
          <SessionLine $unavailable={isSessionCheckUnavailable} role="status">
            <span>
              {isSessionCheckUnavailable
                ? "Не удалось проверить сессию"
                : "Сессия подтверждена"}
            </span>
            <IconButton
              type="button"
              aria-label="Проверить сессию"
              title="Проверить сессию"
              onClick={onRefreshSession}
              aria-busy={isRefreshingSession || undefined}
              disabled={isRefreshingSession}
            >
              {isRefreshingSession ? (
                <LoaderCircle aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
            </IconButton>
            <IconButton
              type="button"
              aria-label="Выйти"
              title="Выйти"
              onClick={onLogout}
              disabled={isLoggingOut}
            >
              <LogOut aria-hidden />
            </IconButton>
          </SessionLine>
        </SidebarFooter>
      </SidebarRoot>

      <Main>
        <Topbar>
          <MobileOnly>
            <IconButton
              type="button"
              aria-label="Открыть меню"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu aria-hidden />
            </IconButton>
            <CurrentTitle>{active?.label}</CurrentTitle>
          </MobileOnly>
          <SearchForm
            role="search"
            onSubmit={submitSearch}
            $mobileOpen={mobileSearchOpen}
          >
            <Search aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти покупку: email, имя или номер платежа"
              aria-label="Найти покупку"
              enterKeyHint="search"
            />
            <kbd aria-hidden>/</kbd>
          </SearchForm>
          <TopbarEnd>
            {environment && <EnvPill $environment={environment}>{hostLabel}</EnvPill>}
            <MobileOnly>
              <IconButton
                type="button"
                aria-label={mobileSearchOpen ? "Закрыть поиск" : "Найти покупку"}
                onClick={() => setMobileSearchOpen((open) => !open)}
              >
                {mobileSearchOpen ? <X aria-hidden /> : <Search aria-hidden />}
              </IconButton>
            </MobileOnly>
          </TopbarEnd>
        </Topbar>
        <Content>{children}</Content>
      </Main>
    </Root>
  );
};

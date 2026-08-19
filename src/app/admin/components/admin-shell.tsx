import { CircleHelp, LoaderCircle, RefreshCw } from "lucide-react";
import type { FormEvent } from "react";

import Button from "@/components/common/Button";
import Input from "@/components/common/Input";

import { ADMIN_FEATURE_COPY, ADMIN_FEATURES } from "../lib/admin.constants";
import type { AdminFeature, AdminFeatureId, StatusMessage } from "../lib/admin.types";
import {
  AdminInvitePage,
  ButtonRow,
  FeatureHelp,
  FeatureHelpButton,
  FeatureHelpTooltip,
  Form,
  FormControl,
  HeaderInfo,
  HeaderRow,
  HeaderTitleRow,
  LockAccent,
  LockCard,
  LockDescription,
  LockTitle,
  LockViewport,
  Sidebar,
  SidebarActionRow,
  SidebarFooter,
  SidebarIconButton,
  SidebarItem,
  SidebarItemLabel,
  SidebarNav,
  SidebarTitle,
  SidebarTop,
  StatusText,
  Title,
} from "../page.styles";

type AdminLoginProps = {
  authPassword: string;
  authStatus: StatusMessage;
  isChecking: boolean;
  isUnlocking: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

// Presentation stays stateless so extraction cannot move or reset operational state.
export const AdminLogin = ({
  authPassword,
  authStatus,
  isChecking,
  isUnlocking,
  onPasswordChange,
  onSubmit,
}: AdminLoginProps) => (
  <AdminInvitePage>
    <LockViewport>
      <LockCard>
        <LockAccent aria-hidden />
        <LockTitle>Вход в админ-панель</LockTitle>
        <LockDescription>Управление курсами, потоками и приглашениями.</LockDescription>
        <Form onSubmit={onSubmit}>
          <FormControl>
            <Input
              id="admin-password"
              name="adminPassword"
              type="password"
              label="Пароль"
              value={authPassword}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Введите пароль"
              disabled={isChecking || isUnlocking}
              width="100%"
            />
          </FormControl>
          <ButtonRow>
            <Button
              buttonText={
                isChecking ? "Проверка..." : isUnlocking ? "Открываю..." : "Войти"
              }
              type="submit"
              disabled={isChecking || isUnlocking || !authPassword.trim()}
              isLoading={isUnlocking}
              width="100%"
            />
          </ButtonRow>
          {authStatus && (
            <StatusText $tone={authStatus.tone}>{authStatus.text}</StatusText>
          )}
        </Form>
      </LockCard>
    </LockViewport>
  </AdminInvitePage>
);

type AdminSidebarProps = {
  activeFeatureId: AdminFeatureId;
  isLoggingOut: boolean;
  isRefreshingSession: boolean;
  onFeatureSelect: (featureId: AdminFeatureId) => void;
  onLogout: () => void | Promise<void>;
  onRefreshSession: () => void | Promise<void>;
};

export const AdminSidebar = ({
  activeFeatureId,
  isLoggingOut,
  isRefreshingSession,
  onFeatureSelect,
  onLogout,
  onRefreshSession,
}: AdminSidebarProps) => (
  <Sidebar>
    <SidebarTop>
      <SidebarTitle>Anna Strok</SidebarTitle>
      <SidebarNav>
        {ADMIN_FEATURES.map((feature) => (
          <SidebarItem
            key={feature.id}
            type="button"
            $active={feature.id === activeFeatureId}
            onClick={() => onFeatureSelect(feature.id)}
            aria-current={feature.id === activeFeatureId ? "page" : undefined}
          >
            <SidebarItemLabel>{feature.label}</SidebarItemLabel>
          </SidebarItem>
        ))}
      </SidebarNav>
    </SidebarTop>

    <SidebarFooter>
      <SidebarActionRow>
        <SidebarIconButton
          type="button"
          onClick={onRefreshSession}
          disabled={isRefreshingSession}
          $isLoading={isRefreshingSession}
          aria-label="Проверить сессию"
          title="Проверить сессию"
        >
          {isRefreshingSession ? <LoaderCircle aria-hidden /> : <RefreshCw aria-hidden />}
        </SidebarIconButton>
        <Button
          buttonText={isLoggingOut ? "Выход..." : "Выйти"}
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          isLoading={isLoggingOut}
          size="sm"
          variant="secondary"
          width="100%"
        />
      </SidebarActionRow>
    </SidebarFooter>
  </Sidebar>
);

export const AdminFeatureHeader = ({ feature }: { feature: AdminFeature }) => {
  const copy = ADMIN_FEATURE_COPY[feature.id];

  return (
    <HeaderRow>
      <HeaderInfo>
        <HeaderTitleRow>
          <Title>{feature.label}</Title>
          <FeatureHelp>
            <FeatureHelpButton
              type="button"
              aria-label={`Что можно сделать в разделе «${feature.label}»`}
              aria-describedby={`admin-feature-help-${feature.id}`}
            >
              <CircleHelp aria-hidden />
            </FeatureHelpButton>
            <FeatureHelpTooltip id={`admin-feature-help-${feature.id}`} role="tooltip">
              {copy.description}
            </FeatureHelpTooltip>
          </FeatureHelp>
        </HeaderTitleRow>
      </HeaderInfo>
    </HeaderRow>
  );
};

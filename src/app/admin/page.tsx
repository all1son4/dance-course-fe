"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { AdminFeatureHeader, AdminLogin, AdminSidebar } from "./components/admin-shell";
import { BroadcastWorkspace } from "./components/broadcast-workspace";
import {
  InviteLinkGeneratorCard,
  InviteLinkJournalCard,
} from "./components/invite-links-workspace";
import {
  ActiveOnlineGroupCard,
  OnlineGroupInviteLinksCard,
  RenewalCampaignsCard,
  RenewalGeneratorCard,
} from "./components/online-group-workspace";
import { OperationsWorkspace } from "./components/operations-workspace";
import { PurchasesWorkspace } from "./components/purchases-workspace";
import { SalesWorkspace } from "./components/sales-workspace";
import { useBroadcastAdmin } from "./hooks/use-broadcast-admin";
import { useInviteLinksAdmin } from "./hooks/use-invite-links-admin";
import { useOnlineGroupAdmin } from "./hooks/use-online-group-admin";
import { useOperationsAdmin } from "./hooks/use-operations-admin";
import { usePurchasesAdmin } from "./hooks/use-purchases-admin";
import { useSalesAdmin } from "./hooks/use-sales-admin";
import {
  ADMIN_API_ENDPOINTS,
  ADMIN_FEATURES,
  ADMIN_SESSION_HEARTBEAT_MS,
} from "./lib/admin.constants";
import type {
  AdminFeatureId,
  AuthResponse,
  AuthState,
  StatusMessage,
} from "./lib/admin.types";
import {
  AdminInvitePage,
  AdminShell,
  Card,
  MainPanel,
  OnlineGroupWorkspace,
  StatusText,
  WorkspaceGrid,
  WorkspacePrimary,
  WorkspaceSecondary,
} from "./page.styles";

export default function AdminPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authPassword, setAuthPassword] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeFeatureId, setActiveFeatureId] = useState<AdminFeatureId>("invite-links");
  const [authStatus, setAuthStatus] = useState<StatusMessage>({
    text: "Проверяю сессию...",
    tone: "info",
  });
  const [copyingUrl, setCopyingUrl] = useState("");

  const activeFeature =
    ADMIN_FEATURES.find((feature) => feature.id === activeFeatureId) ?? ADMIN_FEATURES[0];
  const isInviteLinksFeatureActive = activeFeature.id === "invite-links";
  const isOnlineGroupFeatureActive = activeFeature.id === "online-group";
  const isBroadcastsFeatureActive = activeFeature.id === "broadcasts";
  const isOperationsFeatureActive = activeFeature.id === "operations";
  const isPurchasesFeatureActive = activeFeature.id === "purchases";
  const isSalesFeatureActive = activeFeature.id === "sales";
  const isChecking = authState === "checking";
  const isAuthorized = authState === "authorized";

  const handleSessionExpired = useCallback(() => {
    setAuthState("locked");
    setAuthStatus({
      text: "Сессия истекла. Введи пароль снова.",
      tone: "error",
    });
  }, []);

  const inviteLinksAdmin = useInviteLinksAdmin({
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const onlineGroupAdmin = useOnlineGroupAdmin({
    isActive: isOnlineGroupFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const {
    audience: firstTouchBroadcastAudience,
    confirmingGlobalLeadId: confirmingGlobalBroadcastLeadId,
    exclude: handleExcludeFirstTouchBroadcastLead,
    isDisabled: isFirstTouchBroadcastDisabled,
    isLoading: isLoadingFirstTouchBroadcastStats,
    isSending: isSendingFirstTouchBroadcast,
    load: loadFirstTouchBroadcastStats,
    pendingCount: firstTouchBroadcastPendingCount,
    send: handleSendFirstTouchBroadcast,
    setConfirmingGlobalLeadId: setConfirmingGlobalBroadcastLeadId,
    stats: firstTouchBroadcastStats,
    status: firstTouchBroadcastStatus,
    updatingLeadId: updatingFirstTouchBroadcastLeadId,
  } = useBroadcastAdmin({
    isActive: isBroadcastsFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const purchasesAdmin = usePurchasesAdmin({
    isActive: isPurchasesFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const operationsAdmin = useOperationsAdmin({
    isActive: isOperationsFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const {
    activeCampaignTitle: salesActiveCampaignTitle,
    isLoading: isLoadingSalesState,
    load: loadSalesState,
    products: salesProducts,
    status: salesStatus,
    toggle: handleToggleProductSales,
    updatingProductId: updatingSalesProductId,
  } = useSalesAdmin({
    isActive: isSalesFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });

  const checkAuthState = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setAuthStatus({
          text: "Проверяю сессию...",
          tone: "info",
        });
      }

      try {
        const response = await fetch(ADMIN_API_ENDPOINTS.auth, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as AuthResponse;

        if (response.ok && data.authorized) {
          setAuthState("authorized");

          if (!silent) {
            setAuthStatus(null);
          }

          return;
        }

        setAuthState("locked");

        if (data.errorCode === "auth_not_configured") {
          setAuthStatus({
            text: "Не задан ADMIN_PASSWORD на сервере.",
            tone: "error",
          });
          return;
        }

        if (silent) {
          setAuthStatus({
            text: "Сессия завершена. Введи пароль снова.",
            tone: "info",
          });
          return;
        }

        setAuthStatus({
          text: "Введи пароль для доступа к админке.",
          tone: "info",
        });
      } catch {
        setAuthState("locked");
        setAuthStatus({
          text: "Не удалось проверить авторизацию. Попробуй обновить страницу.",
          tone: "error",
        });
      }
    },
    [],
  );

  useEffect(() => {
    void checkAuthState();

    const sessionHeartbeat = window.setInterval(() => {
      void checkAuthState({ silent: true });
    }, ADMIN_SESSION_HEARTBEAT_MS);

    return () => {
      window.clearInterval(sessionHeartbeat);
    };
  }, [checkAuthState]);

  const handleRefreshSession = async () => {
    if (isRefreshingSession) {
      return;
    }

    setIsRefreshingSession(true);

    try {
      await checkAuthState();
      await inviteLinksAdmin.loadJournal();
    } finally {
      setIsRefreshingSession(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.auth, {
        method: "DELETE",
      });

      if (!response.ok) {
        setAuthStatus({
          text: "Не удалось завершить сессию. Попробуй снова.",
          tone: "error",
        });
        return;
      }

      setAuthState("locked");
      setAuthPassword("");
      inviteLinksAdmin.resetForLogout();
      setAuthStatus({
        text: "Сессия завершена.",
        tone: "info",
      });
    } catch {
      setAuthStatus({
        text: "Ошибка сети при завершении сессии.",
        tone: "error",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleUnlockSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authPassword.trim() || isUnlocking) {
      return;
    }

    setIsUnlocking(true);
    setAuthStatus({
      text: "Проверяю пароль...",
      tone: "info",
    });

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.auth, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: authPassword,
        }),
      });
      const data = (await response.json()) as AuthResponse;

      if (response.ok && data.authorized) {
        setAuthState("authorized");
        setAuthPassword("");
        setAuthStatus(null);
        return;
      }

      if (data.errorCode === "invalid_password") {
        setAuthStatus({
          text: "Неверный пароль.",
          tone: "error",
        });
        return;
      }

      if (data.errorCode === "auth_not_configured") {
        setAuthStatus({
          text: "Не задан ADMIN_PASSWORD на сервере.",
          tone: "error",
        });
        return;
      }

      setAuthStatus({
        text: "Не удалось авторизоваться. Попробуй снова.",
        tone: "error",
      });
    } catch {
      setAuthStatus({
        text: "Ошибка сети при авторизации.",
        tone: "error",
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleGenerateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void inviteLinksAdmin.generate();
  };

  const handleOnlineGroupAdminAccessSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onlineGroupAdmin.generateAdminAccess();
  };

  const handleRenewalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onlineGroupAdmin.generateRenewal();
  };

  const handleSaveOnlineGroupSettingsSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onlineGroupAdmin.saveSettings();
  };

  const handleCopyLink = async (link: string) => {
    if (!link || copyingUrl) {
      return;
    }

    setCopyingUrl(link);

    try {
      await navigator.clipboard.writeText(link);
      inviteLinksAdmin.setStatus({
        text: "Ссылка скопирована.",
        tone: "success",
      });
    } catch {
      inviteLinksAdmin.setStatus({
        text: "Не удалось скопировать автоматически. Скопируй ссылку вручную.",
        tone: "error",
      });
    } finally {
      setCopyingUrl("");
    }
  };

  if (!isAuthorized) {
    return (
      <AdminLogin
        authPassword={authPassword}
        authStatus={authStatus}
        isChecking={isChecking}
        isUnlocking={isUnlocking}
        onPasswordChange={setAuthPassword}
        onSubmit={handleUnlockSubmit}
      />
    );
  }

  return (
    <AdminInvitePage>
      <AdminShell>
        <AdminSidebar
          activeFeatureId={activeFeature.id}
          isLoggingOut={isLoggingOut}
          isRefreshingSession={isRefreshingSession}
          onFeatureSelect={setActiveFeatureId}
          onLogout={handleLogout}
          onRefreshSession={handleRefreshSession}
        />

        <Card>
          <MainPanel>
            <AdminFeatureHeader feature={activeFeature} />

            {authStatus && (
              <StatusText $tone={authStatus.tone}>{authStatus.text}</StatusText>
            )}

            {isSalesFeatureActive ? (
              <SalesWorkspace
                activeCampaignTitle={salesActiveCampaignTitle}
                isLoading={isLoadingSalesState}
                onRefresh={loadSalesState}
                onToggle={handleToggleProductSales}
                products={salesProducts}
                status={salesStatus}
                updatingProductId={updatingSalesProductId}
              />
            ) : isOnlineGroupFeatureActive ? (
              <OnlineGroupWorkspace>
                <ActiveOnlineGroupCard
                  activeCampaign={onlineGroupAdmin.activeCampaign}
                  activeMainChatTitle={onlineGroupAdmin.activeMainChatTitle}
                  inspirationChatTitle={onlineGroupAdmin.inspirationChatTitle}
                  isFormOpen={onlineGroupAdmin.isFormOpen}
                  isLoading={onlineGroupAdmin.isLoading}
                  isSaveDisabled={onlineGroupAdmin.isSaveDisabled}
                  isSaving={onlineGroupAdmin.isSaving}
                  libraryChatId={onlineGroupAdmin.libraryChatId}
                  mainChatId={onlineGroupAdmin.mainChatId}
                  onFormToggle={onlineGroupAdmin.toggleForm}
                  onLibraryChatChange={onlineGroupAdmin.changeLibraryChat}
                  onMainChatChange={onlineGroupAdmin.changeMainChat}
                  onRefresh={onlineGroupAdmin.load}
                  onStartsAtChange={onlineGroupAdmin.changeStartsAt}
                  onSubmit={handleSaveOnlineGroupSettingsSubmit}
                  onTitleChange={onlineGroupAdmin.setTitle}
                  startsAt={onlineGroupAdmin.startsAt}
                  status={onlineGroupAdmin.status}
                  telegramChatOptions={onlineGroupAdmin.telegramChatSelectOptions}
                  title={onlineGroupAdmin.title}
                />
                {onlineGroupAdmin.hasConfiguredCampaign && (
                  <OnlineGroupInviteLinksCard
                    accessMode={onlineGroupAdmin.adminAccessMode}
                    adminLabel={onlineGroupAdmin.adminLabel}
                    copyingUrl={copyingUrl}
                    grants={onlineGroupAdmin.adminGrants}
                    isDisabled={onlineGroupAdmin.isAdminGenerateDisabled}
                    isGenerating={onlineGroupAdmin.isGeneratingAdminAccess}
                    isLoading={onlineGroupAdmin.isLoading}
                    onAccessModeChange={onlineGroupAdmin.changeAdminAccessMode}
                    onAdminLabelChange={onlineGroupAdmin.changeAdminLabel}
                    onCopy={handleCopyLink}
                    onRefresh={onlineGroupAdmin.load}
                    onSubmit={handleOnlineGroupAdminAccessSubmit}
                    status={onlineGroupAdmin.adminStatus}
                  />
                )}
                {onlineGroupAdmin.activeCampaign && (
                  <RenewalGeneratorCard
                    chats={onlineGroupAdmin.telegramChats}
                    copyingUrl={copyingUrl}
                    generatedLink={onlineGroupAdmin.generatedRenewalLink}
                    isDisabled={onlineGroupAdmin.isRenewalGenerateDisabled}
                    isGenerating={onlineGroupAdmin.isGeneratingRenewal}
                    isLoading={onlineGroupAdmin.isLoading}
                    offerId={onlineGroupAdmin.renewalOfferId}
                    offerOptions={onlineGroupAdmin.renewalOfferSelectOptions}
                    onCopy={handleCopyLink}
                    onOfferChange={onlineGroupAdmin.changeRenewalOffer}
                    onRegenerate={() => void onlineGroupAdmin.generateRenewal(true)}
                    onSourceChatToggle={onlineGroupAdmin.toggleRenewalSourceChat}
                    onSubmit={handleRenewalSubmit}
                    sourceChatIds={onlineGroupAdmin.renewalSourceChatIds}
                    status={onlineGroupAdmin.renewalStatus}
                    title={onlineGroupAdmin.renewalTitle}
                    onTitleChange={onlineGroupAdmin.setRenewalTitle}
                  />
                )}
                {(onlineGroupAdmin.activeCampaign ||
                  onlineGroupAdmin.renewalCampaigns.length > 0) && (
                  <RenewalCampaignsCard
                    campaigns={onlineGroupAdmin.renewalCampaigns}
                    copyingUrl={copyingUrl}
                    onCopy={handleCopyLink}
                    onToggleStatus={onlineGroupAdmin.toggleRenewalStatus}
                    updatingSlug={onlineGroupAdmin.updatingRenewalSlug}
                  />
                )}
              </OnlineGroupWorkspace>
            ) : isInviteLinksFeatureActive ? (
              <WorkspaceGrid>
                <WorkspacePrimary>
                  <InviteLinkGeneratorCard
                    adminLabel={inviteLinksAdmin.adminLabel}
                    choreoSelectOptions={inviteLinksAdmin.choreoSelectOptions}
                    copyingUrl={copyingUrl}
                    generatedLink={inviteLinksAdmin.generatedLink}
                    generatorStatus={inviteLinksAdmin.status}
                    isGenerateDisabled={inviteLinksAdmin.isGenerateDisabled}
                    isGenerating={inviteLinksAdmin.isGenerating}
                    kind={inviteLinksAdmin.kind}
                    kindSelectOptions={inviteLinksAdmin.kindSelectOptions}
                    onAdminLabelChange={inviteLinksAdmin.setAdminLabel}
                    onChoreoSelectionChange={inviteLinksAdmin.selectChoreo}
                    onCopy={handleCopyLink}
                    onKindChange={inviteLinksAdmin.changeKind}
                    onSubmit={handleGenerateSubmit}
                    selectedChoreoKey={inviteLinksAdmin.selectedChoreoKey}
                  />
                </WorkspacePrimary>

                <WorkspaceSecondary>
                  <InviteLinkJournalCard
                    copyingUrl={copyingUrl}
                    isInitialLoading={inviteLinksAdmin.isJournalInitialLoading}
                    isLoading={inviteLinksAdmin.isJournalLoading}
                    links={inviteLinksAdmin.recentLinks}
                    onCopy={handleCopyLink}
                    onRefresh={inviteLinksAdmin.refreshJournal}
                  />
                </WorkspaceSecondary>
              </WorkspaceGrid>
            ) : isBroadcastsFeatureActive ? (
              <BroadcastWorkspace
                audience={firstTouchBroadcastAudience}
                confirmingGlobalLeadId={confirmingGlobalBroadcastLeadId}
                isDisabled={isFirstTouchBroadcastDisabled}
                isLoadingStats={isLoadingFirstTouchBroadcastStats}
                isSending={isSendingFirstTouchBroadcast}
                isUpdatingLeadId={updatingFirstTouchBroadcastLeadId}
                onExclude={handleExcludeFirstTouchBroadcastLead}
                onGlobalExcludeCancel={() => setConfirmingGlobalBroadcastLeadId("")}
                onGlobalExcludeRequest={setConfirmingGlobalBroadcastLeadId}
                onRefresh={loadFirstTouchBroadcastStats}
                onSend={handleSendFirstTouchBroadcast}
                pendingCount={firstTouchBroadcastPendingCount}
                stats={firstTouchBroadcastStats}
                status={firstTouchBroadcastStatus}
              />
            ) : isPurchasesFeatureActive ? (
              <PurchasesWorkspace
                appliedSearch={purchasesAdmin.appliedSearch}
                isDownloadingReport={purchasesAdmin.isDownloadingReport}
                isLoading={purchasesAdmin.isLoading}
                isSendingReport={purchasesAdmin.isSendingReport}
                monthValue={purchasesAdmin.monthValue}
                months={purchasesAdmin.months}
                onClearSearch={purchasesAdmin.clearSearch}
                onDownloadReport={purchasesAdmin.downloadReport}
                onMonthChange={purchasesAdmin.selectMonth}
                onRefresh={purchasesAdmin.refresh}
                onResendEmail={purchasesAdmin.resendEmail}
                onSearchInputChange={purchasesAdmin.setSearchInput}
                onSendReport={purchasesAdmin.sendReport}
                onSubmitSearch={purchasesAdmin.submitSearch}
                previousSummary={purchasesAdmin.previousSummary}
                products={purchasesAdmin.products}
                purchases={purchasesAdmin.purchases}
                reportStatus={purchasesAdmin.reportStatus}
                resendingPaymentIntentId={purchasesAdmin.resendingPaymentIntentId}
                searchInput={purchasesAdmin.searchInput}
                status={purchasesAdmin.status}
                summary={purchasesAdmin.summary}
              />
            ) : isOperationsFeatureActive ? (
              <OperationsWorkspace
                copyingUrl={copyingUrl}
                isLoading={operationsAdmin.isLoading}
                onCopy={handleCopyLink}
                onRefresh={operationsAdmin.refresh}
                onReissueAccess={operationsAdmin.reissueAccess}
                onReplay={operationsAdmin.replay}
                reissuedLinks={operationsAdmin.reissuedLinks}
                reissuingPaymentIntentId={operationsAdmin.reissuingPaymentIntentId}
                replayingKey={operationsAdmin.replayingKey}
                snapshot={operationsAdmin.snapshot}
                status={operationsAdmin.status}
              />
            ) : null}
          </MainPanel>
        </Card>
      </AdminShell>
    </AdminInvitePage>
  );
}

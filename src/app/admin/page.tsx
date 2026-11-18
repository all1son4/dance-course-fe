"use client";

import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AdminFrame } from "./components/app-frame";
import { BroadcastsTab } from "./components/broadcasts-tab";
import { HubWorkspace } from "./components/hub-workspace";
import {
  InviteLinkGeneratorCard,
  InviteLinkJournalCard,
} from "./components/invite-links-workspace";
import { LoginScreen } from "./components/login-screen";
import { OnlineGroupTab } from "./components/online-group-tab";
import { OperationsWorkspace } from "./components/operations-workspace";
import { OverviewWorkspace } from "./components/overview-workspace";
import { PurchasesWorkspace } from "./components/purchases-workspace";
import { SalesWorkspace } from "./components/sales-workspace";
import { SystemPulsePanel } from "./components/system-pulse-panel";
import { useAdminAuth } from "./hooks/use-admin-auth";
import { useBroadcastAdmin } from "./hooks/use-broadcast-admin";
import { useCohortsAdmin } from "./hooks/use-cohorts-admin";
import { useHubAdmin } from "./hooks/use-hub-admin";
import { useInviteLinksAdmin } from "./hooks/use-invite-links-admin";
import { useOnlineGroupAdmin } from "./hooks/use-online-group-admin";
import { useOperationsAdmin } from "./hooks/use-operations-admin";
import { useOverviewAdmin } from "./hooks/use-overview-admin";
import { usePurchasesAdmin } from "./hooks/use-purchases-admin";
import { useSalesAdmin } from "./hooks/use-sales-admin";
import { ADMIN_FEATURE_COPY, ADMIN_FEATURES } from "./lib/admin.constants";
import type { AdminFeatureId } from "./lib/admin.types";
import { readAdminDeepLink } from "./lib/admin-deep-link";
import { WorkspaceGrid, WorkspacePrimary, WorkspaceSecondary } from "./page.styles";
import { ToastProvider } from "./ui/feedback";
import { StatusCallout } from "./ui/forms";
import { PageHeader, Stack } from "./ui/primitives";

export default function AdminPage() {
  return (
    <ToastProvider>
      <AdminApp />
    </ToastProvider>
  );
}

function AdminApp() {
  const deepLink = readAdminDeepLink(useSearchParams());
  const [activeId, setActiveId] = useState<AdminFeatureId>(deepLink.view || "overview");
  const activeFeature =
    ADMIN_FEATURES.find((feature) => feature.id === activeId) ?? ADMIN_FEATURES[0];

  const auth = useAdminAuth();
  const { handleSessionExpired: onUnauthorized, isAuthorized } = auth;

  const overview = useOverviewAdmin({ isAuthorized, onUnauthorized });
  const inviteLinks = useInviteLinksAdmin({ isAuthorized, onUnauthorized });
  const onlineGroup = useOnlineGroupAdmin({
    isActive: activeId === "online-group",
    isAuthorized,
    onUnauthorized,
  });
  const cohorts = useCohortsAdmin({
    isActive: activeId === "online-group",
    isAuthorized,
    onUnauthorized,
  });
  const hub = useHubAdmin({
    isActive: activeId === "inspiration-hub",
    isAuthorized,
    onUnauthorized,
  });
  const broadcast = useBroadcastAdmin({
    isActive: activeId === "broadcasts",
    isAuthorized,
    onUnauthorized,
  });
  const purchases = usePurchasesAdmin({
    initialSearch: deepLink.purchasesSearch,
    isActive: activeId === "purchases",
    isAuthorized,
    onUnauthorized,
  });
  const operations = useOperationsAdmin({
    isActive: activeId === "operations",
    isAuthorized,
    onUnauthorized,
  });
  const sales = useSalesAdmin({
    isActive: activeId === "sales",
    isAuthorized,
    onUnauthorized,
  });

  if (!isAuthorized) {
    return (
      <LoginScreen
        authPassword={auth.authPassword}
        authStatus={auth.authStatus}
        isChecking={auth.isChecking}
        isSessionCheckUnavailable={auth.isSessionCheckUnavailable}
        isUnlocking={auth.isUnlocking}
        onPasswordChange={auth.setAuthPassword}
        onRetrySessionCheck={auth.retrySessionCheck}
        onSubmit={auth.submitUnlock}
      />
    );
  }

  const refreshOverview = () => void overview.load();

  const openPurchase = (query: string) => {
    setActiveId("purchases");
    void purchases.searchFor(query);
  };

  const handleGenerateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void inviteLinks.generate();
  };

  const attentionFor = (view: AdminFeatureId) =>
    overview.overview?.attention.filter((item) => item.view === view) ?? [];

  const sectionDescription = ADMIN_FEATURE_COPY[activeFeature.id].description;

  return (
    <AdminFrame
      activeId={activeFeature.id}
      badges={overview.overview?.badges ?? {}}
      environment={overview.overview?.environment ?? null}
      isLoggingOut={auth.isLoggingOut}
      isRefreshingSession={auth.isRefreshingSession}
      isSessionCheckUnavailable={auth.isSessionCheckUnavailable}
      onLogout={() => auth.logout({ onLoggedOut: inviteLinks.resetForLogout })}
      onNavigate={setActiveId}
      onRefreshSession={() => auth.refreshSession({ after: inviteLinks.loadJournal })}
      onSearch={openPurchase}
    >
      <StatusCallout status={auth.authStatus} />

      {activeFeature.id === "overview" ? (
        <OverviewWorkspace
          failed={overview.failed}
          isLoading={overview.isLoading}
          onNavigate={setActiveId}
          onRefresh={overview.load}
          overview={overview.overview}
        />
      ) : activeFeature.id === "online-group" ? (
        <OnlineGroupTab
          attention={attentionFor("online-group")}
          cohorts={cohorts}
          onNavigate={setActiveId}
          onProblemsChanged={refreshOverview}
          onUnauthorized={onUnauthorized}
          settings={onlineGroup}
        />
      ) : activeFeature.id === "inspiration-hub" ? (
        <HubWorkspace
          failed={hub.failed}
          hub={hub.hub}
          isLoading={hub.isLoading}
          onNavigate={setActiveId}
          onOpenPurchase={openPurchase}
          onPreviewAtChange={hub.changePreviewAt}
          onRefresh={() => {
            void hub.load();
            refreshOverview();
          }}
          onReissue={hub.reissue}
          onUnauthorized={onUnauthorized}
          previewAt={hub.previewAt}
          reissued={hub.reissued}
          reissuing={hub.reissuing}
        />
      ) : (
        <Stack $gap={20}>
          <PageHeader title={activeFeature.label} description={sectionDescription} />

          {activeFeature.id === "sales" ? (
            <SalesWorkspace
              activeCampaignTitle={sales.activeCampaignTitle}
              isLoading={sales.isLoading}
              onRefresh={sales.load}
              onToggle={async (...args: Parameters<typeof sales.toggle>) => {
                await sales.toggle(...args);
                refreshOverview();
              }}
              products={sales.products}
              status={sales.status}
              updatingProductId={sales.updatingProductId}
            />
          ) : activeFeature.id === "invite-links" ? (
            <WorkspaceGrid>
              <WorkspacePrimary>
                <InviteLinkGeneratorCard
                  adminLabel={inviteLinks.adminLabel}
                  choreoSelectOptions={inviteLinks.choreoSelectOptions}
                  generatedLink={inviteLinks.generatedLink}
                  generatorStatus={inviteLinks.status}
                  isGenerateDisabled={inviteLinks.isGenerateDisabled}
                  isGenerating={inviteLinks.isGenerating}
                  kind={inviteLinks.kind}
                  kindSelectOptions={inviteLinks.kindSelectOptions}
                  onAdminLabelChange={inviteLinks.setAdminLabel}
                  onChoreoSelectionChange={inviteLinks.selectChoreo}
                  onKindChange={inviteLinks.changeKind}
                  onSubmit={handleGenerateSubmit}
                  selectedChoreoKey={inviteLinks.selectedChoreoKey}
                />
              </WorkspacePrimary>
              <WorkspaceSecondary>
                <InviteLinkJournalCard
                  isInitialLoading={inviteLinks.isJournalInitialLoading}
                  isLoading={inviteLinks.isJournalLoading}
                  links={inviteLinks.recentLinks}
                  onRefresh={inviteLinks.refreshJournal}
                />
              </WorkspaceSecondary>
            </WorkspaceGrid>
          ) : activeFeature.id === "broadcasts" ? (
            <BroadcastsTab
              firstTouch={{
                audience: broadcast.audience,
                confirmingGlobalLeadId: broadcast.confirmingGlobalLeadId,
                isDisabled: broadcast.isDisabled,
                isLoadingStats: broadcast.isLoading,
                isSending: broadcast.isSending,
                isUpdatingLeadId: broadcast.updatingLeadId,
                onExclude: broadcast.exclude,
                onGlobalExcludeCancel: () => broadcast.setConfirmingGlobalLeadId(""),
                onGlobalExcludeRequest: broadcast.setConfirmingGlobalLeadId,
                onRefresh: broadcast.load,
                onSend: broadcast.send,
                pendingCount: broadcast.pendingCount,
                stats: broadcast.stats,
                status: broadcast.status,
              }}
              isAuthorized={isAuthorized}
              onUnauthorized={onUnauthorized}
            />
          ) : activeFeature.id === "purchases" ? (
            <PurchasesWorkspace
              appliedSearch={purchases.appliedSearch}
              isDownloadingReport={purchases.isDownloadingReport}
              isLoading={purchases.isLoading}
              isSendingReport={purchases.isSendingReport}
              monthValue={purchases.monthValue}
              months={purchases.months}
              onClearSearch={purchases.clearSearch}
              onDownloadReport={purchases.downloadReport}
              onMonthChange={purchases.selectMonth}
              onRefresh={purchases.refresh}
              onResendEmail={purchases.resendEmail}
              onSearchInputChange={purchases.setSearchInput}
              onSendReport={purchases.sendReport}
              onSubmitSearch={purchases.submitSearch}
              onTerminalRecordedChange={async (
                ...args: Parameters<typeof purchases.setTerminalRecorded>
              ) => {
                await purchases.setTerminalRecorded(...args);
                refreshOverview();
              }}
              previousSummary={purchases.previousSummary}
              products={purchases.products}
              purchases={purchases.purchases}
              reportStatus={purchases.reportStatus}
              resendingPaymentIntentId={purchases.resendingPaymentIntentId}
              searchInput={purchases.searchInput}
              status={purchases.status}
              summary={purchases.summary}
              updatingTerminalPaymentIntentId={purchases.updatingTerminalPaymentIntentId}
            />
          ) : activeFeature.id === "operations" ? (
            <>
              <SystemPulsePanel onUnauthorized={onUnauthorized} />
              <OperationsWorkspace
                isLoading={operations.isLoading}
                onRefresh={operations.refresh}
                onReissueAccess={operations.reissueAccess}
                onReplay={async (...args: Parameters<typeof operations.replay>) => {
                  await operations.replay(...args);
                  refreshOverview();
                }}
                reissuedLinks={operations.reissuedLinks}
                reissuingPaymentIntentId={operations.reissuingPaymentIntentId}
                replayingKey={operations.replayingKey}
                snapshot={operations.snapshot}
                status={operations.status}
              />
            </>
          ) : null}
        </Stack>
      )}
    </AdminFrame>
  );
}
